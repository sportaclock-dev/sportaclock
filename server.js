import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import nflRoute from "./nfl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

/* ------------------------------------------------------------
   FOOTBALL (football-data.org) — one route, three competitions
     WC = World Cup 2026
     PL = Premier League
     CL = UEFA Champions League
   Each competition gets its own 15-minute cache.
   SPOILER SHIELD: only kickoff time, team names, crests, and
   status leave this server. Scores never reach the browser.
   ------------------------------------------------------------ */
const COMPS = new Set(["WC", "PL", "CL"]);
const CACHE_MS = 15 * 60 * 1000; // 15 minutes
const caches = {}; // { WC: { time, data }, PL: {...}, CL: {...} }

async function footballHandler(comp, res) {
  try {
    if (!TOKEN) {
      return res.json({ enabled: false, reason: "No FOOTBALL_DATA_TOKEN set" });
    }
    const cached = caches[comp];
    if (cached && Date.now() - cached.time < CACHE_MS) {
      return res.json(cached.data);
    }
    const r = await fetch(
      `https://api.football-data.org/v4/competitions/${comp}/matches`,
      { headers: { "X-Auth-Token": TOKEN } }
    );
    if (!r.ok) {
      if (cached) return res.json(cached.data);
      return res.json({ enabled: false, reason: `API responded ${r.status}` });
    }
    const raw = await r.json();

    // SPOILER SHIELD: scores are stripped right here.
    const matches = (raw.matches || [])
      .filter((m) => m.status !== "CANCELLED")
      .map((m) => ({
        utcDate: m.utcDate,
        status: m.status,
        home: m.homeTeam?.name || null,
        away: m.awayTeam?.name || null,
        homeCrest: m.homeTeam?.crest || null,
        awayCrest: m.awayTeam?.crest || null,
        matchday: m.matchday ?? null,
        stage: m.stage || null,
      }));

    const data = { enabled: true, matches };
    caches[comp] = { time: Date.now(), data };
    res.json(data);
  } catch (err) {
    const cached = caches[comp];
    if (cached) return res.json(cached.data);
    res.json({ enabled: false, reason: "Could not reach football-data.org" });
  }
}

/* ------------------------------------------------------------
   ICELAND — Besta deildin (formerly Úrvalsdeild karla), via
   TheSportsDB's free public API (key "3", no signup needed).
   football-data.org doesn't cover Iceland, ESPN's API lacks the
   league, and API-Football's free plan blocks current seasons.

   FREE-TIER QUIRK: every event-list endpoint silently caps at
   5 results, but rounds have 6 games (12 teams). Event IDs are
   assigned in sequential blocks per round, so the missing games
   are exactly the gaps in the ID sequence — and the single-event
   lookup endpoint is NOT capped. So: fetch each round, find ID
   gaps, fill them with individual lookups. ~50 small requests,
   done in a throttled BACKGROUND refresh so visitors never wait.

   Same spoiler shield applies: only kickoff time, team names,
   crests, and status leave this server. Scores never do.
   ------------------------------------------------------------ */
const TSDB = "https://www.thesportsdb.com/api/v1/json/3";
// "Icelandic Úrvalsdeild karla" (Besta deildin) — ID confirmed against
// TheSportsDB. If it ever stops returning fixtures, the refresh falls
// back to re-resolving the ID dynamically from their Iceland league list.
const TSDB_ICELAND_ID = "4642";
const ICELAND_REFRESH_MS = 30 * 60 * 1000; // full rebuild every 30 min
const TSDB_DELAY_MS = 700; // stay well under free-tier rate limits
let isLeagueId = TSDB_ICELAND_ID;
const isCacheHolder = { time: 0, data: null };
let isRefreshInFlight = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// TheSportsDB status strings → the football-data.org-style codes the
// frontend understands. Unknown/blank statuses map to null, which makes
// the frontend fall back to its own kickoff-time logic — safe default.
function tsdbStatus(ev) {
  if ((ev.strPostponed || "").toLowerCase() === "yes") return "TIMED";
  const s = (ev.strStatus || "").trim().toUpperCase();
  if (!s) return null;
  if (["MATCH FINISHED", "FT", "AET", "PEN"].includes(s)) return "FINISHED";
  if (["NOT STARTED", "NS", "TIME TO BE DEFINED", "TBD"].includes(s)) return "TIMED";
  if (["1H", "2H", "ET", "LIVE", "IN PROGRESS"].includes(s)) return "IN_PLAY";
  if (["HT", "BREAK TIME", "SUSPENDED", "INTERRUPTED"].includes(s)) return "PAUSED";
  return null;
}

// Kickoff in UTC ISO form. strTimestamp is UTC but lacks the Z suffix.
function tsdbKickoff(ev) {
  if (ev.strTimestamp) {
    return /[zZ]|[+-]\d\d:?\d\d$/.test(ev.strTimestamp)
      ? ev.strTimestamp
      : `${ev.strTimestamp}Z`;
  }
  return `${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`;
}

function tsdbEventToMatch(ev) {
  return {
    utcDate: tsdbKickoff(ev),
    status: tsdbStatus(ev),
    home: ev.strHomeTeam || null,
    away: ev.strAwayTeam || null,
    homeCrest: ev.strHomeTeamBadge || null,
    awayCrest: ev.strAwayTeamBadge || null,
    matchday: ev.intRound ? Number(ev.intRound) || null : null,
    stage: null,
  };
}

async function tsdbEvents(pathAndQuery) {
  const r = await fetch(`${TSDB}/${pathAndQuery}`);
  if (!r.ok) throw new Error(`TheSportsDB responded ${r.status}`);
  const raw = await r.json();
  return raw.events || [];
}

async function resolveIcelandLeagueId() {
  if (isLeagueId) return isLeagueId;
  const r = await fetch(`${TSDB}/search_all_leagues.php?c=Iceland&s=Soccer`);
  if (!r.ok) throw new Error(`TheSportsDB league lookup responded ${r.status}`);
  const raw = await r.json();
  // Yes, the key really is spelled "countrys" in their API.
  const leagues = raw.countrys || raw.countries || [];
  const match = leagues.find((l) => {
    const name = l.strLeague || "";
    return /besta|rvalsdeild/i.test(name) && !/women|kvenna|2\.|second/i.test(name);
  });
  if (!match) {
    throw new Error("Could not find Besta deildin in TheSportsDB's Iceland list");
  }
  isLeagueId = match.idLeague;
  return isLeagueId;
}

async function fetchIcelandSeason(leagueId, year) {
  const byId = new Map(); // idEvent (string) → raw event

  // Pass 1: rounds. Each returns at most 5 of its 6 games (free-tier cap).
  let emptyStreak = 0;
  for (let round = 1; round <= 40 && emptyStreak < 3; round++) {
    let evs = [];
    try {
      evs = await tsdbEvents(`eventsround.php?id=${leagueId}&r=${round}&s=${year}`);
    } catch { /* treat a failed round like an empty one */ }
    if (!evs.length) { emptyStreak++; }
    else { emptyStreak = 0; evs.forEach((ev) => byId.set(ev.idEvent, ev)); }
    await sleep(TSDB_DELAY_MS);
  }

  // Pass 2: gap-fill. IDs come in sequential per-round blocks, so any
  // missing ID between min and max is a game the 5-cap hid from us.
  // The single-event lookup endpoint is not capped.
  const ids = [...byId.keys()].map(Number).filter(Number.isFinite);
  if (ids.length) {
    const min = Math.min(...ids), max = Math.max(...ids);
    const missing = [];
    for (let id = min + 1; id < max; id++) {
      if (!byId.has(String(id))) missing.push(id);
    }
    // If IDs aren't actually contiguous (e.g. after a re-import), the gap
    // list explodes — skip the hack rather than hammer their API.
    if (missing.length && missing.length <= 60) {
      for (const id of missing) {
        try {
          const evs = await tsdbEvents(`lookupevent.php?id=${id}`);
          const ev = evs[0];
          // Only accept events that really belong to this league + season.
          if (ev && ev.idLeague === String(leagueId) && ev.strSeason === String(year)) {
            byId.set(ev.idEvent, ev);
          }
        } catch { /* a missed fill just means one absent fixture */ }
        await sleep(TSDB_DELAY_MS);
      }
    }
  }

  // Pass 3: near-term safety net. Catches reschedules/additions whose new
  // IDs fall outside the block range. Also serves as the sole source if
  // the round endpoint returned nothing at all.
  for (const q of [
    `eventsnextleague.php?id=${leagueId}`,
    `eventspastleague.php?id=${leagueId}`,
  ]) {
    try {
      (await tsdbEvents(q)).forEach((ev) => {
        if (ev.strSeason === String(year) || !byId.size) byId.set(ev.idEvent, ev);
      });
    } catch { /* optional pass */ }
    await sleep(TSDB_DELAY_MS);
  }

  return [...byId.values()]
    .filter((ev) => !/cancel/i.test(ev.strStatus || ""))
    .map(tsdbEventToMatch)
    .filter((m) => m.home && m.away);
}

async function refreshIceland() {
  if (isRefreshInFlight) return;
  isRefreshInFlight = true;
  try {
    const leagueId = await resolveIcelandLeagueId();
    const y = new Date().getFullYear();
    let matches = await fetchIcelandSeason(leagueId, y);
    if (!matches.length) matches = await fetchIcelandSeason(leagueId, y - 1);
    if (!matches.length && leagueId === TSDB_ICELAND_ID) {
      // Hardcoded ID came up empty — re-resolve from the league list once.
      isLeagueId = null;
      const resolved = await resolveIcelandLeagueId();
      if (resolved !== TSDB_ICELAND_ID) {
        matches = await fetchIcelandSeason(resolved, y);
        if (!matches.length) matches = await fetchIcelandSeason(resolved, y - 1);
      }
    }
    if (matches.length) {
      isCacheHolder.time = Date.now();
      isCacheHolder.data = { enabled: true, matches };
      console.log(`[iceland] refreshed: ${matches.length} matches`);
    } else {
      console.error("[iceland] refresh found no fixtures; keeping previous data");
    }
  } catch (err) {
    console.error(`[iceland] refresh failed: ${err.message}`);
  } finally {
    isRefreshInFlight = false;
  }
}

// Build the schedule shortly after boot, then keep it fresh.
setTimeout(refreshIceland, 2000);
setInterval(refreshIceland, ICELAND_REFRESH_MS);

async function icelandHandler(res) {
  // Serve whatever we have instantly; the background job keeps it fresh.
  if (isCacheHolder.data) {
    if (Date.now() - isCacheHolder.time > ICELAND_REFRESH_MS) refreshIceland();
    return res.json(isCacheHolder.data);
  }
  // Cold start before the first refresh lands: give visitors a quick
  // partial view (next/last ~5 games) while the full build runs.
  refreshIceland();
  try {
    const byId = new Map();
    for (const q of [
      `eventsnextleague.php?id=${isLeagueId || TSDB_ICELAND_ID}`,
      `eventspastleague.php?id=${isLeagueId || TSDB_ICELAND_ID}`,
    ]) {
      try { (await tsdbEvents(q)).forEach((ev) => byId.set(ev.idEvent, ev)); }
      catch { /* optional */ }
    }
    const matches = [...byId.values()]
      .filter((ev) => !/cancel/i.test(ev.strStatus || ""))
      .map(tsdbEventToMatch)
      .filter((m) => m.home && m.away);
    if (!matches.length) {
      return res.json({ enabled: false, reason: "Schedule is still loading — try again in a minute" });
    }
    res.json({ enabled: true, matches });
  } catch (err) {
    console.error(`[iceland] ${err.message}`);
    res.json({ enabled: false, reason: err.message || "Could not reach TheSportsDB" });
  }
}

app.get("/api/football/:comp", (req, res) => {
  const comp = String(req.params.comp || "").toUpperCase();
  if (comp === "IS") return icelandHandler(res);
  if (!COMPS.has(comp)) {
    return res.status(404).json({ enabled: false, reason: "Unknown competition" });
  }
  footballHandler(comp, res);
});

// Kept for backwards compatibility — same as /api/football/WC
app.get("/api/matches", (req, res) => footballHandler("WC", res));

// Full NFL schedule (ESPN data, scores stripped in nfl.js)
app.get("/api/nfl", nflRoute);

// Serve the built frontend
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Sportaclock running on port ${PORT}`);
});

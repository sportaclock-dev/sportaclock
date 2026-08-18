import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import nflRoute from "./nfl.js";
import golfRoute from "./golf.js";
import { ynwaApi, ynwaPage, ynwaProbe } from "./ynwa.js";
import { commentsGet, commentsPost, commentsDelete } from "./comments.js";
import { espnTry } from "./espn.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Railway sits behind a reverse proxy — without this, req.ip would be the
// proxy's address for every request, making the comment rate-limiter
// (which keys off req.ip) useless.
app.set("trust proxy", true);
app.use(express.json({ limit: "8kb" })); // small cap — comments are short by design
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

/* ------------------------------------------------------------
   FOOTBALL (football-data.org) — one route, two competitions
     PL = Premier League
     CL = UEFA Champions League
   Each competition gets its own 15-minute cache.
   SPOILER SHIELD: only kickoff time, team names, crests, and
   status leave this server. Scores never reach the browser.
   ------------------------------------------------------------ */
const COMPS = new Set(["PL", "CL"]);
const CACHE_MS = 15 * 60 * 1000; // 15 minutes
const caches = {}; // { PL: { time, data }, CL: {...} }

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

/* The critical distinction. tsdbEvents throws on a bad response, and the
   round sweep used to swallow that with a bare catch — so a rate-limited
   request looked exactly like a round with no games in it. */
async function tsdbTry(pathAndQuery) {
  try {
    return { ok: true, events: await tsdbEvents(pathAndQuery) };
  } catch (e) {
    return { ok: false, events: [], error: e.message };
  }
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
  const log = (m) => console.log(`[iceland] ${m}`);
  const inSeason = (ev) =>
    ev.strSeason === String(year) || String(ev.dateEvent || "").slice(0, 4) === String(year);

  /* Pass 0: the cheap, high-value calls FIRST. Two requests buy the next 15
     and last 15 fixtures — which is exactly what the Coming up tab needs.
     Running these before the round sweep means that if the free tier starts
     throttling partway through, we've already banked the upcoming games. */
  for (const q of [
    `eventsnextleague.php?id=${leagueId}`,
    `eventspastleague.php?id=${leagueId}`,
  ]) {
    const r = await tsdbTry(q);
    if (!r.ok) log(`${q.split(".php")[0]} failed: ${r.error}`);
    r.events.forEach((ev) => { if (inSeason(ev)) byId.set(ev.idEvent, ev); });
    await sleep(TSDB_DELAY_MS);
  }
  log(`near-term pass: ${byId.size} fixtures`);

  /* Pass 1: rounds, for full-season coverage. Each returns at most 5 of its
     6 games (free-tier cap).

     A FAILED request is not an empty round. Treating them alike is what froze
     this league on matchday 3: once TheSportsDB began throttling, three
     throttled calls in a row looked like three empty rounds and the sweep
     gave up — and because rounds 1-3 were the whole season back in April,
     nothing looked wrong until the season moved on. */
  let emptyStreak = 0, failures = 0, retried = 0;
  for (let round = 1; round <= 40 && emptyStreak < 6; round++) {
    const r = await tsdbTry(`eventsround.php?id=${leagueId}&r=${round}&s=${year}`);

    if (!r.ok) {
      failures++;
      if (failures > 10) { log(`round sweep abandoned after ${failures} failures`); break; }
      await sleep(TSDB_DELAY_MS * 4); // back off and try this same round again
      if (retried++ < 20) round--;    // bounded, so a dead API can't spin
      continue;
    }

    if (!r.events.length) emptyStreak++;
    else { emptyStreak = 0; r.events.forEach((ev) => byId.set(ev.idEvent, ev)); }
    await sleep(TSDB_DELAY_MS);
  }
  log(`after round sweep: ${byId.size} fixtures (${failures} failed requests)`);

  /* Pass 2: gap-fill. IDs come in sequential per-round blocks, so any missing
     ID between min and max is a game the 5-cap hid from us. The single-event
     lookup endpoint is not capped. */
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
      let filled = 0;
      for (const id of missing) {
        const r = await tsdbTry(`lookupevent.php?id=${id}`);
        const ev = r.events[0];
        if (ev && ev.idLeague === String(leagueId) && ev.strSeason === String(year)) {
          byId.set(ev.idEvent, ev);
          filled++;
        }
        await sleep(TSDB_DELAY_MS);
      }
      log(`gap-fill: recovered ${filled} of ${missing.length} missing ids`);
    } else if (missing.length) {
      log(`gap-fill skipped: ${missing.length} ids missing, too many to be real`);
    }
  }

  const out = [...byId.values()]
    .filter((ev) => !/cancel/i.test(ev.strStatus || ""))
    .map(tsdbEventToMatch)
    .filter((m) => m.home && m.away);

  const ahead = out.filter((m) => new Date(m.utcDate).getTime() > Date.now()).length;
  log(`season ${year}: ${out.length} fixtures, ${ahead} still to come`);
  return out;
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

/* ============================================================
   /api/football/probe — throwaway diagnostic, delete once answered.

   Two independent checks, since guessing either would just repeat
   the golf/OWGR/ESPN mistakes from earlier in this project:

   1. football-data.org's OWN competition catalogue, called with the
      real token already on this server. Answers: does an FA Cup or
      League Cup code even exist for them, and is it on this plan?
      (Being listed and being accessible are different things —
      football-data.org gates a lot of competitions by tier.)

   2. ESPN's soccer API under the eng.fa / eng.league_cup slugs —
      guessed when YNWA's fixture hunt was built, never confirmed.
      Free, and goes through the shared circuit breaker, so it can't
      make things worse for golf/nfl/ynwa even if this gets hit hard.

   MUST be registered before /api/football/:comp — that route treats
   any path segment as a competition code, so "probe" would otherwise
   be swallowed as an unknown competition and 404 silently.
   ------------------------------------------------------------ */
async function footballProbe(req, res) {
  const out = { fdo: null, fdoCupAttempts: [], espn: {} };

  if (!TOKEN) {
    out.fdo = { status: 0, note: "No FOOTBALL_DATA_TOKEN set on this server" };
  } else {
    try {
      const r = await fetch("https://api.football-data.org/v4/competitions", {
        headers: { "X-Auth-Token": TOKEN },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        out.fdo = { status: r.status, note: body.message || "request failed" };
      } else {
        const all = Array.isArray(body.competitions) ? body.competitions : [];
        const england = all.filter((c) => c.area && c.area.name === "England");
        out.fdo = {
          status: r.status,
          totalCompetitionsVisible: all.length,
          englandCompetitions: england.map((c) => ({
            code: c.code, name: c.name, type: c.type, plan: c.plan || null,
          })),
        };
        // Listed isn't the same as accessible — actually try to pull matches
        // for anything English and CUP-shaped.
        for (const c of england.filter((c) => c.type === "CUP")) {
          try {
            const mr = await fetch(
              `https://api.football-data.org/v4/competitions/${c.code}/matches`,
              { headers: { "X-Auth-Token": TOKEN } },
            );
            const mbody = await mr.json().catch(() => ({}));
            out.fdoCupAttempts.push({
              code: c.code, name: c.name, status: mr.status,
              matches: Array.isArray(mbody.matches) ? mbody.matches.length : 0,
              note: mbody.message || "",
            });
          } catch (e) {
            out.fdoCupAttempts.push({ code: c.code, name: c.name, status: 0, note: e.message });
          }
        }
      }
    } catch (e) {
      out.fdo = { status: 0, note: e.message };
    }
  }

  // A scoreboard can look "empty" just because nothing's on today — FA Cup
  // doesn't touch Premier League clubs until January, League Cup not until
  // Liverpool enter in September. Query full calendar years, not "today",
  // so an empty result actually means something.
  for (const [slug, label] of [["eng.fa", "FA Cup"], ["eng.league_cup", "League Cup"]]) {
    const years = {};
    for (const yr of [2026, 2027]) {
      const r = await espnTry(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${yr}`);
      years[yr] = r.ok
        ? { events: (r.data.events || []).length,
            sample: (r.data.events || []).slice(0, 3).map((e) => ({ name: e.name, date: e.date })) }
        : { skipped: !!r.skipped, note: r.note };
    }
    out.espn[label] = years;
  }

  /* eng.community_shield doesn't exist (confirmed — 403 on a run where FA Cup
     and League Cup succeeded, so it isn't the rate limiter). Liverpool's own
     preseason friendlies all turned out to be filed under club.friendly
     rather than a dedicated slug, so the Shield — a single exhibition match —
     is a good bet to be sitting there too. List everything in the window it
     would fall in (the week or two before the PL season starts) rather than
     text-matching, since ESPN's event.name is just "Team A vs Team B", never
     labelled with the competition name. */
  {
    const r = await espnTry(
      // Narrowed past the truncation point found in the last run: a 24-day
      // window returned exactly 100 results (club.friendly mixes in every
      // club on Earth) and cut off at 8 Aug — right before the date range
      // a Shield would actually fall in. A ~9-day window stays well clear
      // of that cap.
      "https://site.api.espn.com/apis/site/v2/sports/soccer/club.friendly/scoreboard?dates=20260808-20260817",
    );
    out.espn["Community Shield (via club.friendly, 25 Jul – 17 Aug 2026)"] = r.ok
      ? { events: (r.data.events || []).length,
          all: (r.data.events || []).map((e) => ({ name: e.name, date: e.date })) }
      : { skipped: !!r.skipped, note: r.note };
  }

  res.json(out);
}

app.get("/api/football/probe", footballProbe);

app.get("/api/football/:comp", (req, res) => {
  const comp = String(req.params.comp || "").toUpperCase();
  if (comp === "IS") return icelandHandler(res);
  if (!COMPS.has(comp)) {
    return res.status(404).json({ enabled: false, reason: "Unknown competition" });
  }
  footballHandler(comp, res);
});

// Full NFL schedule (ESPN data, scores stripped in nfl.js)
app.get("/api/nfl", nflRoute);
app.get("/api/golf", golfRoute);

// YNWA experiment — a standalone Liverpool live feed in Icelandic.
// Registered before the SPA catch-all so /ynwa serves its own page.
app.get("/api/ynwa", ynwaApi);
app.get("/api/ynwa/probe", ynwaProbe);
app.get("/api/ynwa/comments", commentsGet);
app.post("/api/ynwa/comments", commentsPost);
app.delete("/api/ynwa/comments", commentsDelete);
app.get("/ynwa", ynwaPage);

// Serve the built frontend
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Sportaclock running on port ${PORT}`);
});

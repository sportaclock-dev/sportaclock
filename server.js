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
   football-data.org doesn't cover Iceland and ESPN's API lacks
   the league. Same spoiler shield applies: only kickoff time,
   team names, crests, and status leave here. Scores never do.
   ------------------------------------------------------------ */
const TSDB = "https://www.thesportsdb.com/api/v1/json/3";
// "Icelandic Úrvalsdeild karla" (Besta deildin) — ID confirmed against
// TheSportsDB. If it ever stops returning fixtures, the handler falls
// back to re-resolving the ID dynamically from their Iceland league list.
const TSDB_ICELAND_ID = "4642";
let isLeagueId = TSDB_ICELAND_ID;
const isCacheHolder = { time: 0, data: null };

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

// Kickoff in UTC ISO form. strTimestamp is UTC but sometimes lacks the Z.
function tsdbKickoff(ev) {
  if (ev.strTimestamp) {
    return /[zZ]|[+-]\d\d:?\d\d$/.test(ev.strTimestamp)
      ? ev.strTimestamp
      : `${ev.strTimestamp}Z`;
  }
  return `${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`;
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
  const r = await fetch(`${TSDB}/eventsseason.php?id=${leagueId}&s=${year}`);
  if (!r.ok) throw new Error(`TheSportsDB fixtures responded ${r.status}`);
  const raw = await r.json();
  return (raw.events || [])
    .filter((ev) => !/cancel/i.test(ev.strStatus || ""))
    .map((ev) => ({
      utcDate: tsdbKickoff(ev),
      status: tsdbStatus(ev),
      home: ev.strHomeTeam || null,
      away: ev.strAwayTeam || null,
      // Badges are present on newer records; frontend handles null crests.
      homeCrest: ev.strHomeTeamBadge || null,
      awayCrest: ev.strAwayTeamBadge || null,
      matchday: ev.intRound ? Number(ev.intRound) || null : null,
      stage: null,
    }))
    .filter((m) => m.home && m.away);
}

async function icelandHandler(res) {
  try {
    if (isCacheHolder.data && Date.now() - isCacheHolder.time < CACHE_MS) {
      return res.json(isCacheHolder.data);
    }
    const y = new Date().getFullYear();
    let matches = await fetchIcelandSeason(isLeagueId, y);
    if (!matches.length) matches = await fetchIcelandSeason(isLeagueId, y - 1);
    if (!matches.length && isLeagueId === TSDB_ICELAND_ID) {
      // Hardcoded ID came up empty — re-resolve from the league list once.
      isLeagueId = null;
      const resolved = await resolveIcelandLeagueId();
      if (resolved !== TSDB_ICELAND_ID) {
        matches = await fetchIcelandSeason(resolved, y);
        if (!matches.length) matches = await fetchIcelandSeason(resolved, y - 1);
      }
    }
    if (!matches.length) {
      // Don't cache an empty result as success — keep it debuggable.
      const reason = `TheSportsDB returned no fixtures for league ${isLeagueId}`;
      console.error(`[iceland] ${reason}`);
      return res.json({ enabled: false, reason });
    }
    const data = { enabled: true, matches };
    isCacheHolder.time = Date.now();
    isCacheHolder.data = data;
    res.json(data);
  } catch (err) {
    console.error(`[iceland] ${err.message}`);
    if (isCacheHolder.data) return res.json(isCacheHolder.data);
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

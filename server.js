import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import nflRoute from "./nfl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

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
   ICELAND — Úrvalsdeild karla, via API-Football (api-sports.io)
   football-data.org doesn't cover Iceland at any tier, so this
   league uses a separate provider. Same spoiler shield applies:
   only kickoff time, team names, crests, and status leave here.
   ------------------------------------------------------------ */
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";
let isLeagueId = null; // resolved once, then cached for the process lifetime
const isCacheHolder = { time: 0, data: null };

// API-Football returns HTTP 200 even on failures (bad key, plan limits,
// rate limits) and puts the real problem in an `errors` field. Turn that
// into a readable string, or null if the response is genuinely fine.
function apiFootballErrors(raw) {
  const e = raw?.errors;
  if (!e) return null;
  if (Array.isArray(e)) return e.length ? e.join("; ") : null;
  const msgs = Object.entries(e).map(([k, v]) => `${k}: ${v}`);
  return msgs.length ? msgs.join("; ") : null;
}

// API-Football status codes → the football-data.org-style codes the
// frontend already understands (isLive/isFinished check these).
const AF_STATUS = {
  NS: "TIMED", TBD: "SCHEDULED", PST: "TIMED",
  "1H": "IN_PLAY", "2H": "IN_PLAY", ET: "IN_PLAY", P: "IN_PLAY",
  LIVE: "IN_PLAY", BT: "PAUSED", HT: "PAUSED", SUSP: "PAUSED", INT: "PAUSED",
  FT: "FINISHED", AET: "FINISHED", PEN: "FINISHED",
  AWD: "FINISHED", WO: "FINISHED", ABD: "FINISHED",
};

async function resolveIcelandLeagueId() {
  if (isLeagueId) return isLeagueId;
  // No `search` param: fetch Iceland's full (small) league list and filter
  // locally — the remote search is another thing that can silently miss.
  const r = await fetch(
    `${API_FOOTBALL_BASE}/leagues?country=Iceland`,
    { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
  );
  if (!r.ok) throw new Error(`leagues lookup responded ${r.status}`);
  const raw = await r.json();
  const apiErr = apiFootballErrors(raw);
  if (apiErr) throw new Error(`leagues lookup: ${apiErr}`);
  // Prefer the men's top flight; avoid "Women" / lower tiers.
  // /rvalsdeild/ (no leading letter) matches both "Úrvalsdeild" and "Urvalsdeild".
  const match = (raw.response || []).find(
    (l) => /rvalsdeild/i.test(l.league?.name || "") && !/women/i.test(l.league?.name || "")
  );
  if (!match) throw new Error("Could not find Úrvalsdeild in API-Football's league list");
  isLeagueId = match.league.id;
  return isLeagueId;
}

async function icelandHandler(res) {
  try {
    if (!API_FOOTBALL_KEY) {
      return res.json({ enabled: false, reason: "No API_FOOTBALL_KEY set" });
    }
    if (isCacheHolder.data && Date.now() - isCacheHolder.time < CACHE_MS) {
      return res.json(isCacheHolder.data);
    }
    const leagueId = await resolveIcelandLeagueId();
    // Iceland's season runs Apr–Oct within a single calendar year.
    // Try the current year first; fall back to last year off-season.
    const now = new Date();
    const seasons = now.getMonth() >= 2 ? [now.getFullYear(), now.getFullYear() - 1]
                                          : [now.getFullYear() - 1, now.getFullYear()];
    let matches = [];
    let lastApiErr = null;
    for (const season of seasons) {
      const r = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      if (!r.ok) { lastApiErr = `fixtures responded ${r.status}`; continue; }
      const raw = await r.json();
      const apiErr = apiFootballErrors(raw);
      if (apiErr) { lastApiErr = apiErr; continue; }
      const fixtures = raw.response || [];
      if (fixtures.length) {
        matches = fixtures
          .filter((f) => f.fixture?.status?.short !== "CANC")
          .map((f) => {
            const roundMatch = /(\d+)\s*$/.exec(f.league?.round || "");
            const short = f.fixture?.status?.short || "NS";
            return {
              utcDate: f.fixture.date,
              status: AF_STATUS[short] || "TIMED",
              home: f.teams?.home?.name || null,
              away: f.teams?.away?.name || null,
              homeCrest: f.teams?.home?.logo || null,
              awayCrest: f.teams?.away?.logo || null,
              matchday: roundMatch ? Number(roundMatch[1]) : null,
              stage: null,
            };
          });
        break;
      }
    }
    if (!matches.length) {
      // Don't cache an empty result as success — report why it's empty
      // so /api/football/IS is actually debuggable in the browser.
      const reason = lastApiErr || "API-Football returned no fixtures for this league/season";
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
    res.json({ enabled: false, reason: err.message || "Could not reach API-Football" });
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

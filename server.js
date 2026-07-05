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

app.get("/api/football/:comp", (req, res) => {
  const comp = String(req.params.comp || "").toUpperCase();
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

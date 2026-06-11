import express from "express";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Serve the built Vite frontend
app.use(express.static(join(__dirname, "dist")));

// Optional: live bracket data from football-data.org
// Scores are stripped before sending to the client so the spoiler shield holds.
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
let cache = { ts: 0, data: null };
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

app.get("/api/matches", async (req, res) => {
  if (!TOKEN) {
    return res.json({ enabled: false, matches: [] });
  }
  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) {
    return res.json(cache.data);
  }
  try {
    const r = await fetch(
      "https://api.football-data.org/v4/competitions/WC/matches?season=2026",
      { headers: { "X-Auth-Token": TOKEN } }
    );
    if (!r.ok) throw new Error(`football-data ${r.status}`);
    const raw = await r.json();
    const matches = (raw.matches || []).map((m) => ({
      utcDate: m.utcDate,
      status: m.status,
      // Strip scores — only pass team names for knockout bracket resolution
      home: m.homeTeam?.name ?? null,
      away: m.awayTeam?.name ?? null,
    }));
    cache = { ts: now, data: { enabled: true, matches } };
    res.json(cache.data);
  } catch (err) {
    console.error("football-data fetch failed:", err.message);
    res.json({ enabled: false, matches: [] });
  }
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Sportaclock running on port ${PORT}`);
});

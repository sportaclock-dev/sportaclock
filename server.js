import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

const CACHE_MS = 15 * 60 * 1000; // 15 minutes
let cache = { time: 0, data: null };

app.get("/api/matches", async (req, res) => {
  try {
    if (!TOKEN) {
      return res.json({ enabled: false, reason: "No FOOTBALL_DATA_TOKEN set" });
    }
    if (cache.data && Date.now() - cache.time < CACHE_MS) {
      return res.json(cache.data);
    }
    const r = await fetch(
      "https://api.football-data.org/v4/competitions/WC/matches",
      { headers: { "X-Auth-Token": TOKEN } }
    );
    if (!r.ok) {
      if (cache.data) return res.json(cache.data);
      return res.json({ enabled: false, reason: `API responded ${r.status}` });
    }
    const raw = await r.json();

    // SPOILER SHIELD: keep only kickoff time, team names, and status.
    // Scores never leave this server.
    const matches = (raw.matches || []).map((m) => ({
      utcDate: m.utcDate,
      status: m.status,
      home: m.homeTeam?.name || null,
      away: m.awayTeam?.name || null,
    }));

    cache = { time: Date.now(), data: { enabled: true, matches } };
    res.json(cache.data);
  } catch (err) {
    if (cache.data) return res.json(cache.data);
    res.json({ enabled: false, reason: "Could not reach football-data.org" });
  }
});

// Serve the built frontend
app.use(express.static(path.join(__dirname, "dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Sportaclock running on port ${PORT}`);
});

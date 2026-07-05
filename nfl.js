/* ============================================================
   SPORTACLOCK — /api/nfl
   Full 2026 NFL schedule via ESPN's public (undocumented) API.
   - One request for the whole season (date-range query)
   - Cached in memory for 60 minutes
   - Scores are STRIPPED here on the server, so nothing that
     reaches the browser can ever spoil a result.
   - If ESPN is down or changes, the route returns
     { enabled: false } and the site falls back to the
     built-in marquee schedule.

   Wiring (Express, in server.js):
     import nflRoute from "./nfl.js";
     app.get("/api/nfl", nflRoute);
   ============================================================ */

// Covers Hall of Fame game (early Aug) through Super Bowl LXI (Feb 14, 2027)
const SEASON_RANGE = "20260801-20270215";
const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard" +
  `?dates=${SEASON_RANGE}&limit=1000`;

const CACHE_MS = 60 * 60 * 1000; // 1 hour
let cache = { at: 0, payload: null };

// ESPN season.type → our tag / label prefix
const SEASON_TYPE = {
  1: { tag: "Preseason", label: (w) => `Preseason Week ${w}` },
  2: { tag: "Regular season", label: (w) => `Week ${w}` },
  3: {
    tag: "Playoffs",
    label: (w) =>
      ({ 1: "Wild Card", 2: "Divisional Round", 3: "Conference Championships", 5: "Super Bowl LXI" }[w] ||
      "Playoffs"),
  },
};

function mapEvent(ev) {
  const comp = ev.competitions && ev.competitions[0];
  if (!comp) return null;

  // Skip the Pro Bowl — it's not a real game
  if ((ev.name || "").toLowerCase().includes("pro bowl")) return null;

  const homeC = comp.competitors.find((c) => c.homeAway === "home");
  const awayC = comp.competitors.find((c) => c.homeAway === "away");
  if (!homeC || !awayC) return null;

  const st = ev.season && SEASON_TYPE[ev.season.type];
  const weekNum = ev.week && ev.week.number;
  const isSB = st && ev.season.type === 3 && weekNum === 5;

  return {
    id: ev.id,
    date: ev.date, // ISO 8601 UTC
    // team display names + logos only — NO score fields are copied over
    home: homeC.team.displayName,
    away: awayC.team.displayName,
    homeLogo: homeC.team.logo || null,
    awayLogo: awayC.team.logo || null,
    venue: (comp.venue && comp.venue.fullName) || "",
    city: (comp.venue && comp.venue.address && comp.venue.address.city) || "",
    tag: isSB ? "Super Bowl" : (st ? st.tag : "Regular season"),
    label: st && weekNum ? st.label(weekNum) : "",
    // pre | in | post → the client treats "in" as live, "post" as finished
    state:
      (ev.status && ev.status.type && ev.status.type.state) || "pre",
  };
}

export default async function nflRoute(req, res) {
  try {
    if (cache.payload && Date.now() - cache.at < CACHE_MS) {
      return res.json(cache.payload);
    }

    const r = await fetch(ESPN_URL);
    if (!r.ok) throw new Error(`ESPN responded ${r.status}`);
    const data = await r.json();

    const events = (data.events || [])
      .map(mapEvent)
      .filter(Boolean)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (events.length === 0) throw new Error("ESPN returned no events");

    const payload = { enabled: true, fetchedAt: new Date().toISOString(), events };
    cache = { at: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    console.error("[/api/nfl]", err.message);
    // Serve stale cache if we have one — better than nothing
    if (cache.payload) return res.json(cache.payload);
    res.json({ enabled: false });
  }
}

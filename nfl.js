import { espnTry } from "./espn.js";
/* ============================================================
   SPORTACLOCK — /api/nfl
   The whole NFL season via ESPN's public (undocumented) API.
   - Preseason, regular season and playoffs, fetched per season type
   - Cached in memory for 60 minutes
   - Scores are STRIPPED here on the server, so nothing that
     reaches the browser can ever spoil a result.
   - If ESPN is down or changes, the route returns
     { enabled: false } and the site falls back to the
     built-in marquee schedule.

   WHAT BROKE IN SEPTEMBER 2026
   This used one date-range query, `dates=20260801-20270215`. From
   15 Sep ESPN answered it with 400 "Failed to get events endpoint".
   The tab lived on a stale cache until the next restart, then showed
   only the fallback list. Worse, a failure wasn't remembered, so every
   visit asked again, and three refusals in a row trip espn.js's
   breaker, pausing golf and /nfl too.

   What works is `dates=<year>&seasontype=<n>`, but <year> is the
   CALENDAR year: dates=2026 also returns last season's January games
   and leaves out this season's weeks 17–18 (January 2027). So we ask
   for each calendar year a season type spans and keep only events
   whose season.year is ours. Checked against 2026: 272 regular-season
   games, as it should be. nfl-is/data.js does the same.

   Wiring (Express, in server.js):
     import nflRoute from "./nfl.js";
     app.get("/api/nfl", nflRoute);
   ============================================================ */

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

// The NFL season is named after the year it starts. Jan–Feb belong to
// the previous one; from March on we're looking at the next.
export function seasonYear(now = new Date()) {
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

// [seasonType, calendarYear, required] for every query a season needs.
export function seasonQueries(y) {
  return [
    [1, y, false],     // preseason: August
    [2, y, true],      // regular season: September–December…
    [2, y + 1, true],  // …and weeks 17–18 in January
    [3, y + 1, false], // playoffs: January–February
  ];
}

const CACHE_MS = 60 * 60 * 1000;   // 1 hour
const FAIL_BACKOFF = 5 * 60 * 1000; // after a failure, wait before asking again
let cache = { at: 0, payload: null };
let failedAt = 0;
let pending = null;

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
    // US broadcasters (CBS, FOX, ESPN, Prime Video…): who, not what happened
    tv: [...new Set((comp.broadcasts || []).flatMap((b) => b.names || []))],
    // pre | in | post → the client treats "in" as live, "post" as finished
    state:
      (ev.status && ev.status.type && ev.status.type.state) || "pre",
  };
}

/* Playoff games exist on ESPN long before anyone knows who plays in them:
   "TBD @ TBD", dated midnight Eastern because no kickoff is set. Six such
   rows with a countdown to 05:00 would mislead, so each undecided round
   becomes one row with a title and no teams. A game with a real kickoff
   time (the Super Bowl, set a year ahead) keeps it. */
export function collapseUndecided(events) {
  const seen = new Set();
  const out = [];
  for (const e of events) {
    if (e.home !== "TBD" || e.away !== "TBD") { out.push(e); continue; }
    if (seen.has(e.label)) continue;
    seen.add(e.label);
    out.push({ ...e, home: null, away: null, homeLogo: null, awayLogo: null,
      title: `${e.label} — teams to be decided` });
  }
  return out;
}

async function fetchSeason() {
  const y = seasonYear();
  const byId = new Map();
  for (const [type, cal, required] of seasonQueries(y)) {
    const t = await espnTry(`${SCOREBOARD}?dates=${cal}&seasontype=${type}&limit=1000`);
    if (!t.ok) {
      if (required) throw new Error(t.note || `ESPN responded ${t.status}`);
      continue; // no preseason or playoffs yet is fine
    }
    for (const ev of t.data.events || []) {
      if (Number(ev.season?.year) === y) byId.set(String(ev.id), ev);
    }
  }
  const events = collapseUndecided([...byId.values()]
    .map(mapEvent)
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date)));
  if (events.length === 0) throw new Error("ESPN returned no events");
  return { enabled: true, fetchedAt: new Date().toISOString(), events };
}

export default async function nflRoute(req, res) {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_MS) return res.json(cache.payload);
  // A recent failure: answer from what we have instead of asking ESPN again.
  if (now - failedAt < FAIL_BACKOFF) return res.json(cache.payload || { enabled: false });

  try {
    // Visitors arriving together share one fetch.
    pending = pending || fetchSeason();
    const payload = await pending;
    cache = { at: Date.now(), payload };
    failedAt = 0;
    res.json(payload);
  } catch (err) {
    console.error("[/api/nfl]", err.message);
    failedAt = Date.now();
    // Serve stale cache if we have one — better than nothing
    res.json(cache.payload || { enabled: false });
  } finally {
    pending = null;
  }
}

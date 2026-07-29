/* ============================================================
   SPORTACLOCK — /api/golf
   PGA Tour tee times via ESPN's public (undocumented) API.

   Shape confirmed by probing the live feed:
     - /pga/scoreboard returns ONE tournament (current or next),
       already carrying the full field. No season schedule, so
       there is no way to know October's field in July.
     - Per-round tee times live at
         competitors[].linescores[].{ period, teeTime }
     - competitors[].status.teeTime holds the current round only.
     - Rounds 1 and 2 are published together before play starts.
       Rounds 3 and 4 appear as the tournament progresses, since
       they depend on the cut.
     - Event objects have NO startDate, so every date here is
       derived from the tee times themselves.
     - No rankings endpoint works: /pga/rankings 500s,
       /golf/rankings 404s, /pga/standings returns nothing.
       The top-10 watchlist therefore lives in the frontend.

   SPOILER SHIELD
   Golf payloads are the most score-dense on the whole site —
   every competitor carries strokes, position, earnings and
   round totals. So this file WHITELISTS the handful of fields
   it forwards instead of trying to delete the bad ones. Any
   field ESPN adds in future is dropped by default rather than
   leaking. Nothing here copies a score.

   Wiring (Express, in server.js):
     import golfRoute from "./golf.js";
     app.get("/api/golf", golfRoute);
   ============================================================ */

const BASE = "https://site.api.espn.com/apis/site/v2/sports/golf";
const CACHE_MS = 10 * 60 * 1000; // tee times firm up through the week
let cache = { at: 0, payload: null };

/* ------------------------------------------------------------
   OFFICIAL WORLD GOLF RANKING
   owgr.com is a Next.js app that calls this endpoint itself —
   it's internal plumbing, not a published API, so treat it as
   breakable. The ranking only changes on Sundays, so it gets its
   own long cache, and any failure here is swallowed: the route
   still returns tee times and the frontend falls back to its
   built-in list. Rankings can never take the golf tab down.

   The site is fronted by Akamai, which may challenge a bare
   server-side request, hence the browser-ish headers.
   ------------------------------------------------------------ */
const OWGR = "https://apiweb.owgr.com/api/owgr";
const RANK_CACHE_MS = 12 * 60 * 60 * 1000;
const RANK_COUNT = 30; // a few spare beyond the top 10 we display
let rankCache = { at: 0, payload: null };

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

// OWGR nests the name; be liberal about where it sits.
function rankedName(entry) {
  const p = (entry && entry.player) || {};
  return (
    p.fullName || p.displayName || p.name ||
    [p.firstName, p.lastName].filter(Boolean).join(" ") ||
    entry.fullName || entry.name || null
  );
}

async function fetchRankings() {
  if (rankCache.payload && Date.now() - rankCache.at < RANK_CACHE_MS) {
    return rankCache.payload;
  }
  const url = `${OWGR}/rankings/getRankings` +
    `?regionId=0&pageSize=${RANK_COUNT}&pageNumber=1&countryId=0&sortString=Rank+ASC`;
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`OWGR responded ${r.status}`);
  const data = await r.json();

  const list = Array.isArray(data) ? data
    : data.rankingsList || data.rankings || data.data || data.items || data.results || [];
  if (!Array.isArray(list) || !list.length) throw new Error("OWGR returned no ranks");

  const rankings = list
    .map((e) => {
      const player = rankedName(e);
      const rank = num(e.rank) || num(e.position);
      if (!player || !rank) return null;
      const lastWeek = num(e.lastWeekRank);
      return {
        rank,
        player,
        lastWeek,
        // positive means climbed since last week
        movement: lastWeek ? lastWeek - rank : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);
  if (!rankings.length) throw new Error("OWGR ranks unreadable");

  const payload = {
    rankings,
    week: iso(list[0] && list[0].weekEndDate) || null,
  };
  rankCache = { at: Date.now(), payload };
  return payload;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const iso = (v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

/* The whitelist. Only these three values ever leave the server. */
function safeTee(entry) {
  const teeTime = iso(entry && entry.teeTime);
  if (!teeTime) return null;
  return {
    round: num(entry.period),
    teeTime,
    startHole: num(entry.startHole),
  };
}

/* One competitor → a list of { round, teeTime, startHole }.
   Prefers linescores (per round); falls back to status for the
   current round when linescores is missing or empty. */
function teesForPlayer(c, currentRound) {
  const out = [];
  const seen = new Set();

  for (const ls of Array.isArray(c.linescores) ? c.linescores : []) {
    const t = safeTee(ls);
    if (t && !seen.has(t.round)) { seen.add(t.round); out.push(t); }
  }

  if (!out.length && c.status && c.status.teeTime) {
    const t = safeTee({
      teeTime: c.status.teeTime,
      period: c.status.period || currentRound || 1,
      startHole: c.status.startHole,
    });
    if (t) out.push(t);
  }
  return out;
}

function playerName(c) {
  return (
    (c.athlete && (c.athlete.displayName || c.athlete.fullName)) ||
    c.displayName ||
    c.name ||
    null
  );
}

function courseOf(comp) {
  if (!comp) return { course: "", city: "" };
  const venue = comp.venue || {};
  const course =
    venue.fullName ||
    (comp.course && comp.course.name) ||
    (Array.isArray(comp.courses) && comp.courses[0] && comp.courses[0].name) ||
    "";
  const addr = venue.address || (comp.course && comp.course.address) || {};
  const city = [addr.city, addr.state || addr.country].filter(Boolean).join(", ");
  return { course, city };
}

export default async function golfRoute(req, res) {
  try {
    if (cache.payload && Date.now() - cache.at < CACHE_MS) {
      return res.json(cache.payload);
    }

    // 1. which tournament is on?
    const sbRes = await fetch(`${BASE}/pga/scoreboard`);
    if (!sbRes.ok) throw new Error(`ESPN scoreboard responded ${sbRes.status}`);
    const sb = await sbRes.json();

    const events = Array.isArray(sb.events) ? sb.events : [];
    // prefer one in progress, else the next one up
    const ev =
      events.find((e) => e.status && e.status.type && e.status.type.state === "in") ||
      events.find((e) => e.status && e.status.type && e.status.type.state === "pre") ||
      events[0];
    if (!ev) throw new Error("no tournament in the feed");

    // 2. the field and its tee sheet
    const lbRes = await fetch(`${BASE}/leaderboard?event=${ev.id}`);
    const lb = lbRes.ok ? await lbRes.json() : null;
    const detail = (lb && lb.events && lb.events[0]) || lb || ev;
    const comp =
      (detail.competitions && detail.competitions[0]) ||
      (ev.competitions && ev.competitions[0]) ||
      {};
    const field = Array.isArray(comp.competitors) ? comp.competitors : [];

    const state = (ev.status && ev.status.type && ev.status.type.state) || "pre";
    const currentRound = num(comp.status && comp.status.period) || null;

    // 3. flatten to one entry per player per round
    const teeTimes = [];
    for (const c of field) {
      const name = playerName(c);
      if (!name) continue;
      for (const t of teesForPlayer(c, currentRound)) {
        teeTimes.push({
          id: `${c.id || name}-${t.round || 0}`,
          player: name,
          round: t.round,
          teeTime: t.teeTime,
          startHole: t.startHole,
        });
      }
    }
    if (!teeTimes.length) throw new Error("no tee times published yet");

    teeTimes.sort((a, b) => Date.parse(a.teeTime) - Date.parse(b.teeTime));

    const rounds = [...new Set(teeTimes.map((t) => t.round).filter(Boolean))]
      .sort((a, b) => a - b);
    const { course, city } = courseOf(comp);

    // Independent of everything above: if this throws, tee times still ship.
    let ranks = { rankings: [], week: null };
    try {
      ranks = await fetchRankings();
    } catch (e) {
      console.error("[/api/golf] rankings unavailable:", e.message);
      if (rankCache.payload) ranks = rankCache.payload; // stale beats none
    }

    const payload = {
      enabled: true,
      fetchedAt: new Date().toISOString(),
      rankings: ranks.rankings,
      rankingsWeek: ranks.week,
      tournament: {
        id: String(ev.id),
        name: ev.name || ev.shortName || "PGA Tour event",
        state,                       // pre | in | post
        detail: (ev.status && ev.status.type && ev.status.type.detail) || "",
        currentRound,
        course,
        city,
        fieldSize: field.length,
        roundsPublished: rounds,     // e.g. [1,2] early in the week
      },
      teeTimes,
    };

    cache = { at: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    console.error("[/api/golf]", err.message);
    if (cache.payload) return res.json(cache.payload); // stale beats nothing
    res.json({ enabled: false, reason: err.message });
  }
}

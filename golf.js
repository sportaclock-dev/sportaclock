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
/* The season calendar. /pga/scoreboard alone returns a single tournament, but
   ?dates=YYYY returns the whole year — 48 events. Future ones come back with
   no competitors ("field:none"), because ESPN only publishes a field during
   tournament week, which is exactly the behaviour we want to show. */
const SCHEDULE_COUNT = 6; // the current one plus the next five
const SCHEDULE_CACHE_MS = 6 * 60 * 60 * 1000;
let schedCache = { at: 0, list: null };

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

/* ------------------------------------------------------------
   WHERE IS IT?
   ESPN scatters course info across a few possible places and the
   first guess (competitions[0].venue) came back empty against the
   live feed, so try every plausible path rather than one.
   ------------------------------------------------------------ */
const firstOf = (...vals) => vals.find((v) => v != null && v !== "") || "";

function pickCourse(ev, detail, comp) {
  const cands = [
    comp && comp.venue,
    comp && comp.course,
    comp && Array.isArray(comp.courses) && comp.courses[0],
    detail && Array.isArray(detail.courses) && detail.courses[0],
    ev && Array.isArray(ev.courses) && ev.courses[0],
    detail && detail.venue,
    ev && ev.venue,
  ].filter(Boolean);

  let found = null;
  for (const c of cands) {
    const name = firstOf(c.fullName, c.name, c.shortName);
    const addr = c.address || {};
    let city = firstOf(addr.city);
    let region = firstOf(addr.state, addr.region, addr.province);
    let country = firstOf(addr.country, addr.countryAbbreviation, addr.countryCode);

    // some payloads carry a bare "Detroit, MI" string instead of an address
    const loose = firstOf(c.location, c.venueLocation, addr.summary);
    if (!city && typeof loose === "string" && loose.includes(",")) {
      const [a, b] = loose.split(",").map((x) => x.trim());
      city = a; region = region || b;
    } else if (!city && typeof loose === "string" && loose) {
      city = loose;
    }

    if (city || country) return { name, city, region, country };
    // remember a name-only hit but keep looking for one with a location
    if (name && !found) found = { name, city: "", region: "", country: "" };
  }
  return found || { name: "", city: "", region: "", country: "" };
}

/* ESPN abbreviates US states. Spell them out — "Detroit, Michigan" reads
   better than "Detroit, MI", and matches how the rest of the world shows. */
const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

const COUNTRY_NAMES = {
  USA: "United States", US: "United States", "U.S.": "United States",
  UK: "United Kingdom", GB: "United Kingdom", ENG: "England", SCO: "Scotland",
  WAL: "Wales", NIR: "Northern Ireland", IRL: "Ireland", RSA: "South Africa",
  UAE: "United Arab Emirates", KOR: "South Korea", JPN: "Japan", AUS: "Australia",
  NZL: "New Zealand", CAN: "Canada", MEX: "Mexico", ESP: "Spain", FRA: "France",
  DEU: "Germany", GER: "Germany", ITA: "Italy", PRT: "Portugal", NLD: "Netherlands",
  BEL: "Belgium", CHE: "Switzerland", SWE: "Sweden", DNK: "Denmark", CHN: "China",
  SGP: "Singapore", IND: "India", KEN: "Kenya", MAR: "Morocco", QAT: "Qatar",
  SAU: "Saudi Arabia", BHR: "Bahrain", DOM: "Dominican Republic", BMU: "Bermuda",
  BHS: "Bahamas", ARG: "Argentina", BRA: "Brazil",
};

/* No sports feed carries a continent, so derive one. Covers where golf
   actually goes; anything unrecognised is simply left blank rather than
   guessed at. */
const CONTINENTS = {
  "united states": "North America", canada: "North America", mexico: "North America",
  bermuda: "North America", bahamas: "North America", jamaica: "North America",
  "puerto rico": "North America", "dominican republic": "North America",
  "cayman islands": "North America", "costa rica": "North America",
  scotland: "Europe", england: "Europe", wales: "Europe",
  "northern ireland": "Europe", ireland: "Europe", "united kingdom": "Europe",
  spain: "Europe", portugal: "Europe", france: "Europe", italy: "Europe",
  germany: "Europe", netherlands: "Europe", belgium: "Europe",
  switzerland: "Europe", austria: "Europe", denmark: "Europe", sweden: "Europe",
  norway: "Europe", finland: "Europe", poland: "Europe", "czech republic": "Europe",
  czechia: "Europe", hungary: "Europe", greece: "Europe", turkey: "Europe",
  japan: "Asia", "south korea": "Asia", korea: "Asia", china: "Asia",
  "hong kong": "Asia", taiwan: "Asia", singapore: "Asia", malaysia: "Asia",
  thailand: "Asia", vietnam: "Asia", indonesia: "Asia", india: "Asia",
  "united arab emirates": "Asia", qatar: "Asia", "saudi arabia": "Asia",
  bahrain: "Asia", oman: "Asia", israel: "Asia",
  "south africa": "Africa", kenya: "Africa", morocco: "Africa", egypt: "Africa",
  mauritius: "Africa", tanzania: "Africa", zimbabwe: "Africa",
  australia: "Oceania", "new zealand": "Oceania", fiji: "Oceania",
  argentina: "South America", brazil: "South America", chile: "South America",
  colombia: "South America", peru: "South America", uruguay: "South America",
  ecuador: "South America",
};

function placeOf(ev, detail, comp) {
  const raw = pickCourse(ev, detail, comp);

  // "MI" -> "Michigan"
  let region = raw.region;
  if (region && region.length <= 3 && US_STATES[region.toUpperCase()]) {
    region = US_STATES[region.toUpperCase()];
  }

  // "USA" -> "United States"
  let country = raw.country;
  if (country && COUNTRY_NAMES[country.toUpperCase()]) {
    country = COUNTRY_NAMES[country.toUpperCase()];
  }
  // A US state with no country stated means the US.
  if (!country && raw.region && US_STATES[String(raw.region).toUpperCase()]) {
    country = "United States";
  }

  const continent = CONTINENTS[String(country).toLowerCase()] || "";

  return {
    course: raw.name,
    city: raw.city,
    region,
    country,
    continent,
    // pre-composed for display, skipping anything the feed didn't give us
    where: [raw.city, region, country, continent].filter(Boolean).join(" · "),
  };
}

/* The season calendar, trimmed to what's still to come. */
async function fetchSchedule() {
  if (schedCache.list && Date.now() - schedCache.at < SCHEDULE_CACHE_MS) {
    return schedCache.list;
  }
  const yr = new Date().getFullYear();
  const r = await fetch(`${BASE}/pga/scoreboard?dates=${yr}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`ESPN schedule responded ${r.status}`);
  const data = await r.json();
  const all = Array.isArray(data.events) ? data.events : [];

  const now = Date.now();
  const list = all
    .map((e) => ({
      id: String(e.id),
      name: e.name || e.shortName || "PGA Tour event",
      start: iso(e.date),
      end: iso(e.endDate) || iso(e.date),
      state: (e.status && e.status.type && e.status.type.state) || "pre",
      detail: (e.status && e.status.type && e.status.type.detail) || "",
    }))
    .filter((e) => e.start && Date.parse(e.end) >= now - 12 * 3600000)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, SCHEDULE_COUNT);

  if (!list.length) throw new Error("no upcoming tournaments in the calendar");
  schedCache = { at: Date.now(), list };
  return list;
}

/* The leaderboard endpoint is the only place courses and competitors live. */
async function fetchDetail(id) {
  const r = await fetch(`${BASE}/leaderboard?event=${id}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`leaderboard ${id} responded ${r.status}`);
  return r.json();
}

export default async function golfRoute(req, res) {
  try {
    if (cache.payload && Date.now() - cache.at < CACHE_MS) {
      return res.json(cache.payload);
    }

    const schedule = await fetchSchedule();

    /* Pull details for all of them at once. Failures are per-tournament: a
       row simply loses its course rather than taking the route down. */
    const details = await Promise.all(
      schedule.map((e) => fetchDetail(e.id).catch(() => null)),
    );

    const enriched = schedule.map((e, i) => {
      const lb = details[i];
      const detail = (lb && lb.events && lb.events[0]) || lb || {};
      const comp = (detail.competitions && detail.competitions[0]) || {};
      const field = Array.isArray(comp.competitors) ? comp.competitors : [];
      const place = placeOf(detail, detail, comp);
      return { ...e, place, field, comp, fieldSize: field.length };
    });

    // The one to show tee times for: in progress if any, else the next with a
    // published field, else simply the next.
    const active =
      enriched.find((e) => e.state === "in" && e.fieldSize > 0) ||
      enriched.find((e) => e.fieldSize > 0) ||
      enriched[0];

    const currentRound = num(active.comp.status && active.comp.status.period) || null;

    const teeTimes = [];
    for (const c of active.field) {
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
    teeTimes.sort((a, b) => Date.parse(a.teeTime) - Date.parse(b.teeTime));

    const rounds = [...new Set(teeTimes.map((t) => t.round).filter(Boolean))]
      .sort((a, b) => a - b);

    let ranks = { rankings: [], week: null };
    try {
      ranks = await fetchRankings();
    } catch (e) {
      console.error("[/api/golf] rankings unavailable:", e.message);
      if (rankCache.payload) ranks = rankCache.payload;
    }

    const payload = {
      enabled: true,
      fetchedAt: new Date().toISOString(),
      rankings: ranks.rankings,
      rankingsWeek: ranks.week,
      tournament: {
        id: active.id,
        name: active.name,
        state: active.state,
        detail: active.detail,
        start: active.start,
        end: active.end,
        currentRound,
        course: active.place.course,
        city: active.place.city,
        region: active.place.region,
        country: active.place.country,
        continent: active.place.continent,
        where: active.place.where,
        fieldSize: active.fieldSize,
        roundsPublished: rounds,
      },
      // everything still to come, including the active one
      schedule: enriched.map((e) => ({
        id: e.id,
        name: e.name,
        start: e.start,
        end: e.end,
        state: e.state,
        course: e.place.course,
        where: e.place.where,
        fieldSize: e.fieldSize,
        hasTeeTimes: e.id === active.id && teeTimes.length > 0,
      })),
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

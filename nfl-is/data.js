import { espnTry } from "../espn.js";
import { TEAMS, teamKey } from "./content.js";
import { loadHighlights, saveHighlight, storeEnabled } from "./store.js";
import { readFileSync } from "node:fs";

const SEED = (() => {
  try { return JSON.parse(readFileSync(new URL("./seed-highlights.json", import.meta.url), "utf8")); }
  catch { return {}; }
})();
/* ============================================================
   NFL á íslensku — live data.

   Unlike /api/nfl, this path KEEPS scores. It is a separate product
   staged on sportaclock.com, so nothing here is shared with the
   spoiler-free main site: its own fetches, its own caches.

   ESPN is shared with golf, the NFL tab and YNWA through espn.js,
   whose breaker pauses ALL of them after a few refusals. So:
     - every request from this module goes through one queue, spaced
       out, so a crawler walking 32 team pages can't fire a burst;
     - team pages read from the one season-wide scoreboard instead of
       a schedule call per team;
     - rosters and team details are cached for hours.
   Every getter serves stale data rather than nothing when ESPN
   refuses, and returns null only when it has never succeeded.
   ============================================================ */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const STANDINGS = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings";
const YT_FEED = "https://www.youtube.com/feeds/videos.xml?channel_id=UCDVYQ4Zhbm3S2dlz7P1GBDg"; // NFL

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/* ---------- one queue, spaced ---------- */
const GAP_MS = 400;
let chain = Promise.resolve();
function queued(url) {
  const run = chain.then(() => espnTry(url));
  chain = run.then(() => new Promise((r) => setTimeout(r, GAP_MS)), () => {});
  return run;
}

async function espnJson(url) {
  const r = await queued(url);
  if (!r.ok) throw new Error(r.note || `ESPN ${r.status}`);
  return r.data;
}

/* ---------- cache: TTL, in-flight dedupe, stale on error ---------- */
const FAIL_BACKOFF = 2 * MIN;
const store = new Map();
async function cached(key, ttl, load) {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && hit.value !== undefined && now - hit.at < (typeof ttl === "function" ? ttl(hit.value) : ttl)) {
    return hit.value;
  }
  if (hit?.pending) return hit.pending;
  if (hit?.failedAt && now - hit.failedAt < FAIL_BACKOFF) return null;
  const pending = load()
    .then((value) => {
      store.set(key, { at: Date.now(), value });
      return value;
    })
    .catch((err) => {
      console.error(`[nfl-is] ${key}: ${err.message}`);
      if (hit && hit.value !== undefined) {
        // Keep serving the old value, and don't retry for a minute.
        store.set(key, { at: Date.now() - (typeof ttl === "number" ? ttl : 0) + MIN, value: hit.value });
        return hit.value;
      }
      // Never succeeded: remember the failure too. Without this every
      // page view retried at once, and three in a row trip espn.js's
      // breaker, which silences golf, the NFL tab and YNWA with it.
      store.set(key, { failedAt: Date.now() });
      return null;
    });
  store.set(key, { ...(hit || {}), pending });
  return pending;
}

export function cacheStatus() {
  return [...store.entries()].map(([k, v]) => ({
    key: k,
    ageSec: v.at ? Math.round((Date.now() - v.at) / 1000) : null,
  }));
}

/* ---------- games ---------- */
const scoreOf = (s) => {
  if (s == null) return null;
  const v = typeof s === "object" ? s.value ?? s.displayValue : s;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const ABBR_BY_ID = Object.fromEntries(Object.entries(TEAMS).map(([ab, t]) => [t.id, ab]));

export function normaliseGame(ev) {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const type = Number(ev.season?.type ?? ev.seasonType?.id);
  if (type !== 2 && type !== 3) return null; // no preseason
  const week = Number(ev.week?.number);
  if (type === 3 && week === 4) return null; // Pro Bowl
  const side = (ha) => {
    const c = (comp.competitors || []).find((x) => x.homeAway === ha);
    const ab = c && (ABBR_BY_ID[c.team?.id] || null);
    if (!ab) return null;
    return { ab, score: scoreOf(c.score), winner: c.winner === true };
  };
  const home = side("home"), away = side("away");
  if (!home || !away) return null;
  const st = comp.status?.type || ev.status?.type || {};
  const state = st.state === "in" || st.state === "post" ? st.state : "pre";
  if (state === "pre") { home.score = null; away.score = null; }
  return {
    id: String(ev.id),
    date: ev.date,
    type, week,
    state,
    detail: state === "in" ? (comp.status?.type?.shortDetail || st.shortDetail || "") : "",
    neutral: comp.neutralSite === true,
    home, away,
    venue: comp.venue?.fullName || "",
  };
}

function seasonYear(now = new Date()) {
  // The NFL season is named after the year it starts. Jan–Feb belong
  // to the previous one; from March on we're looking at the next.
  return now.getUTCMonth() < 2 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

/* ESPN stopped answering date ranges (`dates=20260801-20270215`) in
   September 2026 with 400 "Failed to get events endpoint". What works is
   `dates=<year>&seasontype=<n>`, but <year> is the CALENDAR year, not the
   season: dates=2026 brings last season's January games along and leaves
   out this season's weeks 17–18, which fall in January 2027. So we ask for
   both calendar years and keep only events whose season.year is ours.
   Measured against 2026: 272 unique games, 13–16 per week, as it should be. */
export async function getSeason() {
  const y = seasonYear();
  const [reg, post] = await Promise.all([
    cached(`season:${y}:2`, 30 * MIN, () => seasonPart(y, 2, [y, y + 1], true)),
    cached(`season:${y}:3`, 30 * MIN, () => seasonPart(y, 3, [y + 1], false)),
  ]);
  if (!reg) return null;
  return [...reg, ...(post || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function seasonPart(y, type, years, required) {
  const byId = new Map();
  for (const cal of years) {
    const data = await espnJson(`${SITE}/scoreboard?dates=${cal}&seasontype=${type}&limit=1000`);
    for (const ev of data.events || []) {
      if (Number(ev.season?.year) === y) byId.set(String(ev.id), ev);
    }
  }
  const games = [...byId.values()].map(normaliseGame).filter(Boolean);
  if (required && !games.length) throw new Error(`season ${y}/${type}: no games`);
  return games;
}

const anyLive = (games) => games.some((g) => g.state === "in");

// ESPN's default scoreboard is "this week", and it's the fresh one.
export async function getCurrent() {
  return cached("current", (v) => (anyLive(v.games) ? 30 * 1000 : 5 * MIN), async () => {
    const data = await espnJson(`${SITE}/scoreboard`);
    const type = Number(data.season?.type);
    const week = Number(data.week?.number);
    const games = (data.events || []).map(normaliseGame).filter(Boolean);
    return { type, week, games };
  });
}

/* All games of the season with the current week's fresher copies laid
   over the top, so a live score never waits on the 30-minute sweep. */
export async function getGames() {
  const [season, current] = await Promise.all([getSeason(), getCurrent()]);
  const byId = new Map((season || []).map((g) => [g.id, g]));
  for (const g of current?.games || []) byId.set(g.id, g);
  return {
    games: [...byId.values()].sort((a, b) => new Date(a.date) - new Date(b.date)),
    current: current ? { type: current.type, week: current.week } : null,
  };
}

/* ---------- teams ---------- */
const hex = (s) => (/^[0-9a-f]{6}$/i.test(String(s || "")) ? `#${s}` : null);

const pickLogo = (logos, rel) =>
  (logos || []).find((l) => Array.isArray(l.rel) && l.rel.length === rel.length && rel.every((r) => l.rel.includes(r)))?.href || null;

export async function getTeamsMeta() {
  return cached("teams", 24 * HOUR, async () => {
    const data = await espnJson(`${SITE}/teams`);
    const out = {};
    for (const { team } of data.sports?.[0]?.leagues?.[0]?.teams || []) {
      const ab = ABBR_BY_ID[team.id];
      if (!ab) continue;
      out[ab] = {
        color: hex(team.color),
        alt: hex(team.alternateColor),
        // "default" for light backgrounds, "dark" for navy ones: the
        // Raiders' and Saints' marks vanish on dark blue otherwise.
        logo: pickLogo(team.logos, ["full", "default"]) || team.logos?.[0]?.href || null,
        logoDark: pickLogo(team.logos, ["full", "dark"]),
        location: team.location || "",
        nickname: team.name || "",
      };
    }
    if (Object.keys(out).length < 32) throw new Error("teams: fewer than 32");
    return out;
  });
}

export async function getTeamDetail(ab) {
  return cached(`team:${ab}`, 12 * HOUR, async () => {
    const data = await espnJson(`${SITE}/teams/${TEAMS[ab].id}`);
    const v = data.team?.franchise?.venue;
    return {
      venue: v?.fullName || "",
      city: v?.address?.city || "",
      state: v?.address?.state || "",
    };
  });
}

export async function getRoster(ab) {
  return cached(`roster:${ab}`, 12 * HOUR, async () => {
    const data = await espnJson(`${SITE}/teams/${TEAMS[ab].id}/roster`);
    const groups = {};
    for (const g of data.athletes || []) {
      groups[g.position] = (g.items || []).map((p) => ({
        id: /^\d{1,12}$/.test(String(p.id)) ? String(p.id) : null,
        slug: /^[a-z0-9-]{1,80}$/.test(p.slug || "") ? p.slug : "",
        name: p.displayName || p.fullName || "",
        jersey: p.jersey || "",
        pos: p.position?.abbreviation || "",
        age: p.age || null,
        college: p.college?.name || "",
        heightIn: Number(p.height) || null,
        weightLb: Number(p.weight) || null,
        born: p.dateOfBirth || null,
        birthPlace: [p.birthPlace?.city, p.birthPlace?.state, p.birthPlace?.country].filter(Boolean),
        expYears: Number.isFinite(p.experience?.years) ? p.experience.years : null,
        headshot: /^https:\/\/a\.espncdn\.com\//.test(p.headshot?.href || "") ? p.headshot.href : null,
      }));
    }
    const coach = data.coach?.[0];
    return { groups, coach: coach ? `${coach.firstName} ${coach.lastName}` : "" };
  });
}

/* ---------- players ----------
   Bio comes from the roster we already cache; this call adds only what
   the roster lacks: the season's headline stats (with league rank) and
   draft details. There are ~1,700 players, so a crawler walking every
   profile could otherwise queue that many ESPN calls, and a refusal
   streak trips the breaker golf and YNWA share. Hence a budget: past it,
   profiles render from the roster alone and say the stats will follow. */
const ATHLETE = "https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes";

export function findInCachedRosters(id) {
  for (const [key, entry] of store) {
    if (!key.startsWith("roster:") || !entry.value) continue;
    const player = Object.values(entry.value.groups || {}).flat().find((p) => p.id === id);
    if (player) return { ab: key.slice("roster:".length), player };
  }
  return null;
}
const BUDGET_PER_MIN = 20;
let budget = { minute: 0, used: 0 };

export async function getAthlete(id) {
  if (!/^\d{1,12}$/.test(String(id))) return null;
  const hit = store.get(`athlete:${id}`);
  const fresh = hit && hit.value !== undefined && Date.now() - hit.at < 6 * HOUR;
  if (!fresh && !hit?.pending) {
    const minute = Math.floor(Date.now() / MIN);
    if (budget.minute !== minute) budget = { minute, used: 0 };
    if (budget.used >= BUDGET_PER_MIN) return hit?.value ?? null;
    budget.used++;
  }
  return cached(`athlete:${id}`, 6 * HOUR, async () => {
    const a = (await espnJson(`${ATHLETE}/${id}`)).athlete;
    if (!a) throw new Error("athlete: empty");
    const d = /^(\d{4}): Rd (\d+), Pk (\d+) \(([A-Z]{2,3})\)$/.exec(a.displayDraft || "");
    return {
      team: ABBR_BY_ID[a.team?.id] || null,
      // "10th Season" or "Rookie". The roster has experience.years too, but
      // it disagreed with this by one for veterans, so this text wins.
      season: /^rookie$/i.test(a.displayExperience || "") ? 1 : Number((/^(\d+)(?:st|nd|rd|th) season$/i.exec(a.displayExperience || "") || [])[1]) || null,
      // Old codes like OAK or SD aren't current teams; keep them as text.
      draft: d ? { year: d[1], round: Number(d[2]), pick: Number(d[3]), team: teamKey(d[4]), code: d[4] } : null,
      statsTitle: a.statsSummary?.displayName || "",
      stats: (a.statsSummary?.statistics || []).map((s) => ({
        name: String(s.name || ""),
        value: String(s.displayValue ?? ""),
        rank: Number.isFinite(s.rank) ? s.rank : null,
      })),
    };
  });
}

/* ---------- standings ---------- */
export async function getStandings() {
  return cached("standings", 30 * MIN, async () => {
    const data = await espnJson(STANDINGS);
    const out = {};
    for (const conf of data.children || []) {
      for (const e of conf.standings?.entries || []) {
        const ab = ABBR_BY_ID[e.team?.id];
        if (!ab) continue;
        const stat = (n) => e.stats?.find((s) => s.name === n);
        out[ab] = {
          wins: Number(stat("wins")?.value) || 0,
          losses: Number(stat("losses")?.value) || 0,
          ties: Number(stat("ties")?.value) || 0,
          seed: Number(stat("playoffSeed")?.value) || 99,
          diff: stat("pointDifferential")?.displayValue || "",
          streak: stat("streak")?.displayValue || "",
        };
      }
    }
    if (Object.keys(out).length < 32) throw new Error("standings: fewer than 32");
    return out;
  });
}

/* ---------- highlights ----------
   The NFL channel uploads every game's highlights under one title
   pattern: "Indianapolis Colts vs Kansas City Chiefs Game Highlights |
   2026 NFL Season Week 2". Its RSS feed needs no key but only holds the
   latest 15 uploads, and the channel posts dozens a day, so we poll it
   and remember every match we've ever seen. That memory is per-process:
   after a redeploy, older games fall back to a YouTube search link until
   a proper store is added. */
const FULL_NAME_TO_AB = Object.fromEntries(
  Object.entries(TEAMS).map(([ab, t]) => [t.name.toLowerCase(), ab]),
);
const seenVideos = new Map(); // pairKey -> [{ videoId, week, published }]
const pairKey = (a, b) => [a, b].sort().join("-");

const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function parseHighlightTitle(title) {
  const m = /^(.+?)\s+vs\.?\s+(.+?)\s+(?:game\s+)?highlights\b(.*)$/i.exec(title.trim());
  if (!m) return null;
  const a = FULL_NAME_TO_AB[m[1].trim().toLowerCase()];
  const b = FULL_NAME_TO_AB[m[2].trim().toLowerCase()];
  if (!a || !b || a === b) return null;
  const wk = /\bweek\s+(\d{1,2})\b/i.exec(m[3]);
  return { a, b, week: wk ? Number(wk[1]) : null };
}

export function parseFeed(xml) {
  const out = [];
  for (const chunk of String(xml).split("<entry>").slice(1)) {
    const id = /<yt:videoId>([\w-]{6,20})<\/yt:videoId>/.exec(chunk)?.[1];
    const title = /<title>([^<]*)<\/title>/.exec(chunk)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(chunk)?.[1];
    if (id && title) out.push({ videoId: id, title: decode(title), published: published || null });
  }
  return out;
}

// Returns the videos that were new, so the caller can persist just those.
export function rememberVideos(entries) {
  const added = [];
  for (const e of entries) {
    const p = parseHighlightTitle(e.title);
    if (!p) continue;
    if (addVideo(e.videoId, { a: p.a, b: p.b, week: p.week, published: e.published })) {
      added.push({ videoId: e.videoId, entry: { a: p.a, b: p.b, week: p.week, published: e.published } });
    }
  }
  return added;
}

function addVideo(videoId, { a, b, week, published }) {
  if (!TEAMS[a] || !TEAMS[b]) return false;
  const key = pairKey(a, b);
  const list = seenVideos.get(key) || [];
  if (list.some((x) => x.videoId === videoId)) return false;
  list.push({ videoId, week: week ?? null, published: published || null });
  seenVideos.set(key, list);
  return true;
}

/* Polled on a timer, not on page views: the feed holds only the latest
   15 uploads and the channel posts dozens on a Sunday, so waiting for a
   visitor let games scroll out unseen. Every 5 minutes is far faster
   than the channel can post 15 videos. These calls go to YouTube, not
   ESPN, so the shared breaker is not involved. */
const POLL_MS = 5 * MIN;
const hl = { ready: null, lastPollAt: null, lastError: null, saved: 0 };

export function highlightsReady() {
  if (!hl.ready) {
    hl.ready = loadHighlights()
      .then(async (saved) => {
        for (const [videoId, entry] of Object.entries(saved)) addVideo(videoId, entry);
        hl.saved = Object.keys(saved).length;
        if (storeEnabled()) console.log(`[nfl-is] restored ${hl.saved} highlight videos`);
        // Weeks 1-2 of 2026 were matched before this store existed and lost
        // on redeploys; they were recovered from NFL's week playlists into
        // seed-highlights.json. Anything there not yet stored is added once.
        for (const [videoId, entry] of Object.entries(SEED)) {
          if (saved[videoId]) continue;
          addVideo(videoId, entry);
          await saveHighlight(videoId, entry).catch(() => {});
        }
      })
      .catch((err) => {
        hl.lastError = `restore: ${err.message}`;
        console.error(`[nfl-is] highlights ${hl.lastError}`);
      });
  }
  return hl.ready;
}

export async function pollHighlights() {
  return cached("youtube", POLL_MS - 30 * 1000, async () => {
    await highlightsReady();
    const r = await fetch(YT_FEED);
    if (!r.ok) throw new Error(`YouTube ${r.status}`);
    const added = rememberVideos(parseFeed(await r.text()));
    hl.lastPollAt = new Date().toISOString();
    for (const { videoId, entry } of added) {
      // One failed write shouldn't stop the rest, or the poll.
      await saveHighlight(videoId, entry).catch((err) => {
        hl.lastError = `save: ${err.message}`;
        console.error(`[nfl-is] highlights ${hl.lastError}`);
      });
    }
    return added.length;
  });
}

let timer = null;
export function startHighlightPoller() {
  if (timer) return;
  pollHighlights().catch(() => {});
  timer = setInterval(() => pollHighlights().catch(() => {}), POLL_MS);
  timer.unref?.(); // never keep the process alive on its own
}

export function highlightStatus() {
  return {
    videos: [...seenVideos.values()].reduce((n, l) => n + l.length, 0),
    persisted: storeEnabled(),
    restoredAtBoot: hl.saved,
    lastPollAt: hl.lastPollAt,
    lastError: hl.lastError,
  };
}

// A game's own video: same two teams, and either the same week number in
// the title or (for playoff titles without one) published within four
// days of kickoff. The same two teams can meet twice in a season.
export function videoFor(game) {
  if (game.state !== "post") return null;
  const list = seenVideos.get(pairKey(game.home.ab, game.away.ab)) || [];
  const kick = new Date(game.date).getTime();
  const hit = list.find((v) => {
    if (game.type === 2 && v.week != null) return v.week === game.week;
    const pub = v.published ? new Date(v.published).getTime() : NaN;
    return pub >= kick && pub - kick < 4 * 24 * HOUR;
  });
  return hit ? hit.videoId : null;
}

export function searchUrl(game) {
  const q = `${TEAMS[game.away.ab].name} vs ${TEAMS[game.home.ab].name} game highlights ${new Date(game.date).getUTCFullYear()}`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

// Tests only.
export function _resetForTests() {
  store.clear();
  seenVideos.clear();
  hl.ready = null; hl.saved = 0; hl.lastPollAt = null; hl.lastError = null;
}

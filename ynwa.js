import { espnTry, espnStatus } from "./espn.js";
/* ============================================================
   YNWA — Liverpool live feed in Icelandic
   A self-contained experiment living at /ynwa on sportaclock.com.
   Touches nothing else: one file, two routes, no build step.

   HOW IT WORKS
   ESPN's soccer summary endpoint carries a full commentary array
   sourced from Stats Perform ("SA.ENVOY"), and every entry pairs
   the English prose with the structured fields behind it:

     type:         { type: "shot-on-target" }
     team:         { displayName: "AS Monaco" }
     clock:        { displayValue: "56'" }
     participants: [ shooter, assister ]

   So nothing here is translated. The Icelandic is generated from
   the structured fields through a lookup table, which means the
   grammar is right every time instead of being at the mercy of
   machine translation.

   Wiring in server.js — BEFORE the app.get("*") catch-all:
     import { ynwaApi, ynwaPage } from "./ynwa.js";
     app.get("/api/ynwa", ynwaApi);
     app.get("/ynwa", ynwaPage);
   ============================================================ */

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LIVERPOOL = "364";

/* Liverpool's season spans several competitions and each has its own
   slug, so the fixture hunt checks all of them. */
const SLUGS = [
  "club.friendly",
  "eng.1",
  "uefa.champions",
  "eng.fa",
  "eng.league_cup",
  "uefa.europa",
  "uefa.super_cup",
  "fifa.cwc",
];

/* ESPN rate-limits, and refuses everything for a while once you cross the
   line. The first version swept eight competition scoreboards WITHOUT
   stopping at the match it had just found, then discarded the answer five
   minutes later and did it again — about 120 requests an hour to re-learn
   a fixture that doesn't change. Hence: stop at the first hit, remember it
   for hours, and back off hard when refused. */
const FIXTURE_TTL = 6 * 60 * 60 * 1000;
const BACKOFF_BASE = 2 * 60 * 1000;
const BACKOFF_MAX = 30 * 60 * 1000;

/* A known fixture to fall back on when ESPN won't talk and we have nothing
   cached — a cold start during a rate limit would otherwise show an error
   instead of the match and its countdown. Harmless once it's in the past;
   delete it whenever. Found by the hunt itself on 12 Aug. */
const SEED = {
  id: "401886535",
  name: "Como at Liverpool",
  date: "2026-08-16T11:00Z",
  state: "pre",
  league: "Club Friendly",
  source: "seed",
};

let known = null;       // the last match we successfully identified
let knownAt = 0;
let refusals = 0;
let backoffUntil = 0;
const LIVE_TTL = 15 * 1000;   // while the ball is rolling
const IDLE_TTL = 5 * 60 * 1000; // before kickoff / after full time

/* Event IDs are global across ESPN's soccer competitions — probing a
   club.friendly match through the eng.1 slug returns it fine. So the
   slug in a summary URL is decorative and we never have to guess it. */
const ANY_SLUG = "eng.1";

let fixtureCache = { at: 0, data: null };
let feedCache = { at: 0, key: "", payload: null, ttl: 0 };

const yyyymmdd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

/* How long this payload may be reused.

   Keying off the cached state alone meant the five-minute idle cache
   could survive kickoff — the feed would start up to five minutes late
   at the one moment anyone is watching. So: live is always fast, the
   quarter-hour before kickoff is fast, and before that the cache is
   capped so it expires exactly as that window opens. */
function ttlFor(payload) {
  const st = payload.header && payload.header.state;
  if (st === "in") return LIVE_TTL;
  if (st === "post") return IDLE_TTL; // full time — nothing more is coming

  const ko = payload.kickoffIso ? Date.parse(payload.kickoffIso) : NaN;
  if (Number.isFinite(ko)) {
    const now = Date.now();
    const opens = ko - 15 * 60 * 1000;
    if (now >= opens && now < ko + 4 * 3600 * 1000) return LIVE_TTL;
    if (now < opens) return Math.max(5000, Math.min(IDLE_TTL, opens - now));
  }
  return IDLE_TTL;
}

/* Reports what happened instead of throwing it away. The first version
   wrapped every attempt in a bare catch, so a 403 and "no fixtures" were
   indistinguishable — which is exactly why the page said "no match found"
   without saying why. */
async function tryJson(url) {
  // Goes through the shared client so a refusal here also quietens golf
  // and the NFL, instead of three features hammering independently.
  const r = await espnTry(url);
  return r.ok
    ? { ok: true, status: 200, data: r.data }
    : { ok: false, status: r.status, note: r.note || `HTTP ${r.status}` };
}

async function getJson(url) {
  const r = await tryJson(url);
  if (!r.ok) throw new Error(r.note);
  return r.data;
}

const isLiverpool = (c) =>
  String(c && c.id) === LIVERPOOL || String(c && c.team && c.team.id) === LIVERPOOL;

function normalise(ev, sourceLabel) {
  const comp = (ev.competitions && ev.competitions[0]) || {};
  const st = (ev.status && ev.status.type) || (comp.status && comp.status.type) || {};
  return {
    id: String(ev.id),
    name: ev.name || ev.shortName || "",
    date: ev.date || comp.date || null,
    state: st.state || "pre",
    league: (ev.league && ev.league.name) || (ev.season && ev.season.slug) || sourceLabel,
    source: sourceLabel,
  };
}

/* ---------- find the match ----------
   Two routes. The team fixture list is one request and spans every
   competition Liverpool play in, so it goes first. The per-slug
   scoreboard sweep is the backup. */
async function findMatch(debug) {
  const now = Date.now();
  const stillRelevant = (m) => {
    const t = m && m.date ? Date.parse(m.date) : NaN;
    return Number.isFinite(t) && now < t + 4 * 3600 * 1000;
  };

  // Already know the answer? A fixture doesn't move, and one we've found
  // stays right until it's several hours old.
  if (known && !debug && (stillRelevant(known) || now - knownAt < FIXTURE_TTL)) {
    return { match: known, diag: [{ step: "cached", note: "þekktur leikur" }] };
  }

  // Refused recently — asking again immediately is what got us blocked.
  if (now < backoffUntil) {
    const waitS = Math.round((backoffUntil - now) / 1000);
    const diag = [{ step: "backoff", status: 0, note: `bíð í ${waitS}s eftir 403 frá ESPN` }];
    if (known) return { match: known, diag };
    const t = Date.parse(SEED.date);
    if (Number.isFinite(t) && now < t + 4 * 3600 * 1000) {
      diag.push({ step: "seed", status: 0, note: "nota þekktan leik úr stillingum" });
      return { match: { ...SEED }, diag };
    }
    throw Object.assign(
      new Error(`ESPN takmarkar fyrirspurnir — reyni aftur eftir ${waitS}s`), { diag });
  }

  const diag = [];
  let match = null;
  let sawSuccess = false;

  /* Sweep the competitions, but STOP at the first Liverpool fixture.
     Continuing through the remaining seven was pure waste. */
  const from = new Date(now - 36 * 3600 * 1000);
  const to = new Date(now + 21 * 24 * 3600 * 1000);
  const range = `${yyyymmdd(from)}-${yyyymmdd(to)}`;

  outer:
  for (const slug of SLUGS) {
    const r = await tryJson(`${SITE}/${slug}/scoreboard?dates=${range}`);

    /* A 403 is about us, not about this competition — grinding through the
       other seven only digs the hole deeper. Stop at the first refusal. */
    if (!r.ok) {
      diag.push({ step: "scoreboard", slug, status: r.status, events: 0,
        liverpool: 0, note: (r.note || "") + " — hætti að spyrja" });
      break outer;
    }
    sawSuccess = true;
    const evs = Array.isArray(r.data.events) ? r.data.events : [];
    const mine = [];
    for (const ev of evs) {
      const comp = (ev.competitions && ev.competitions[0]) || {};
      if ((comp.competitors || []).some(isLiverpool)) mine.push(normalise(ev, slug));
    }
    diag.push({ step: "scoreboard", slug, status: r.status, events: evs.length,
      liverpool: mine.length, note: r.note || "" });

    if (mine.length) {
      const ms = (f) => (f.date ? Date.parse(f.date) : NaN);
      const live = mine.filter((f) => f.state === "in");
      const done = mine.filter((f) => f.state === "post" && ms(f) > now - 4 * 3600 * 1000)
        .sort((a, b) => ms(b) - ms(a));
      const next = mine.filter((f) => f.state !== "post" && ms(f) > now - 4 * 3600 * 1000)
        .sort((a, b) => ms(a) - ms(b));
      match = live[0] || done[0] || next[0] || null;
      if (match) break outer;
    }
  }

  if (match) {
    known = match; knownAt = now; refusals = 0; backoffUntil = 0;
    return { match, diag };
  }

  // Nothing found. If ESPN answered, the calendar really is empty; if it
  // refused, back off — and keep serving whatever we already knew.
  if (!sawSuccess) {
    refusals++;
    backoffUntil = now + Math.min(BACKOFF_MAX, BACKOFF_BASE * Math.pow(2, refusals - 1));
    diag.push({ step: "backoff", status: 0,
      note: `sett í bið í ${Math.round((backoffUntil - now) / 1000)}s` });
  }
  if (known) return { match: known, diag };

  /* Fall back to the seed only when ESPN never answered. If it DID answer
     and had no Liverpool fixture, believe it — a hardcoded guess shouldn't
     override a live source that's working. */
  const seedT = Date.parse(SEED.date);
  if (!sawSuccess && Number.isFinite(seedT) && now < seedT + 4 * 3600 * 1000) {
    diag.push({ step: "seed", status: 0, note: "nota þekktan leik úr stillingum" });
    return { match: { ...SEED }, diag };
  }

  throw Object.assign(
    new Error(sawSuccess
      ? "Náði í ESPN en fann engan leik hjá Liverpool framundan"
      : "ESPN takmarkar fyrirspurnir — reyni aftur sjálfkrafa"),
    { diag },
  );
}

/* ============================================================
   ICELANDIC
   One entry per ESPN event type. Names are left uninflected,
   which is how Icelandic football coverage handles foreign
   players anyway — so no case endings to get wrong.
   ============================================================ */
/* toLocaleString("is-IS", ...) fell back to English in the browser and
   printed "Sunday, August 16 at 11:00 AM" — wrong language, wrong clock.
   Same lesson as the commentary: don't rely on locale data, generate it.
   Weekdays are in the accusative, which is what Icelandic uses for dates:
   "hefst sunnudaginn 16. ágúst". */
const DAYS_IS = ["sunnudaginn", "mánudaginn", "þriðjudaginn", "miðvikudaginn",
  "fimmtudaginn", "föstudaginn", "laugardaginn"];
const MONTHS_IS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní",
  "júlí", "ágúst", "september", "október", "nóvember", "desember"];

const pad2 = (n) => String(n).padStart(2, "0");

export function kickoffDayIs(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${DAYS_IS[d.getDay()]} ${d.getDate()}. ${MONTHS_IS[d.getMonth()]}`;
}

export function kickoffTextIs(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${DAYS_IS[d.getDay()]} ${d.getDate()}. ${MONTHS_IS[d.getMonth()]}`
    + ` kl. ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const TEAM_IS = {
  Liverpool: "Liverpool",
  "AS Monaco": "Monaco",
  "Manchester United": "Man Utd",
  "Manchester City": "Man City",
  "Newcastle United": "Newcastle",
  "Tottenham Hotspur": "Tottenham",
  "Nottingham Forest": "Forest",
  "Wolverhampton Wanderers": "Wolves",
};
const team = (ev) => {
  const n = (ev.team && ev.team.displayName) || "";
  return TEAM_IS[n] || n;
};
const who = (ev, i = 0) => {
  const p = (ev.participants || [])[i];
  return (p && p.athlete && p.athlete.displayName) || "";
};

// "Goal! Liverpool 1, Monaco 0. ..." → "1–0"
function scoreFrom(text) {
  const m = /^Goal!\s+.+?\s(\d+),\s+.+?\s(\d+)\./.exec(text || "");
  return m ? `${m[1]}–${m[2]}` : "";
}

// the keeper only exists in the prose, so lift it out when it's there
function keeperFrom(text) {
  const m = /saved(?:\s+in[^,]*?)?\s+by\s+([^(]+?)\s*\(/i.exec(text || "");
  return m ? m[1].trim() : "";
}

const TEMPLATES = {
  kickoff: () => "Leikurinn er hafinn.",
  halftime: () => "Hálfleikur.",
  "start-2nd-half": () => "Síðari hálfleikur hafinn.",
  "end-regular-time": () => "Venjulegum leiktíma lokið.",
  "end-2nd-half": () => "Leik lokið.",
  "full-time": () => "Leik lokið.",

  goal: (ev) => {
    const s = scoreFrom(ev.text);
    const a = who(ev, 1);
    return `MARK! ${who(ev)} (${team(ev)})${s ? ` — ${s}` : ""}.` +
      (a ? ` Stoðsending: ${a}.` : "");
  },
  "goal---header": (ev) => {
    const s = scoreFrom(ev.text);
    const a = who(ev, 1);
    return `MARK MEÐ SKALLA! ${who(ev)} (${team(ev)})${s ? ` — ${s}` : ""}.` +
      (a ? ` Stoðsending: ${a}.` : "");
  },
  "penalty---scored": (ev) => {
    const s = scoreFrom(ev.text);
    return `MARK ÚR VÍTASPYRNU! ${who(ev)} (${team(ev)})${s ? ` — ${s}` : ""}.`;
  },
  "penalty---missed": (ev) => `Víti klikkar — ${who(ev)} (${team(ev)}).`,
  "own-goal": (ev) => `SJÁLFSMARK — ${who(ev)} (${team(ev)}).`,

  "shot-on-target": (ev) => {
    const k = keeperFrom(ev.text);
    return `Skot á markið — ${who(ev)} (${team(ev)}).` +
      (k ? ` ${k} ver.` : " Markvörðurinn ver.");
  },
  "shot-off-target": (ev) => `Skot framhjá — ${who(ev)} (${team(ev)}).`,
  "shot-blocked": (ev) => `Skot í varnarmann — ${who(ev)} (${team(ev)}).`,
  "shot-woodwork": (ev) => `Í stöngina! ${who(ev)} (${team(ev)}).`,

  foul: (ev) => `Brot — ${who(ev)} (${team(ev)}).`,
  offside: (ev) => `Rangstaða — ${team(ev)}.`,
  "corner-awarded": (ev) => `Horn — ${team(ev)}.`,
  "yellow-card": (ev) => `Gult spjald — ${who(ev)} (${team(ev)}).`,
  "red-card": (ev) => `RAUTT SPJALD — ${who(ev)} (${team(ev)}).`,
  "second-yellow": (ev) => `Rautt spjald (annað gult) — ${who(ev)} (${team(ev)}).`,

  // participants are [kemur inn á, fer út af]
  substitution: (ev) =>
    `Skipting hjá ${team(ev)}: ${who(ev)} kemur inn á fyrir ${who(ev, 1)}.`,

  "start-delay": (ev) => `Töf á leiknum${team(ev) ? ` — ${team(ev)}` : ""}.`,
  "end-delay": () => "Leikur hefst að nýju.",
  var: (ev) => `VAR-skoðun — ${team(ev)}.`,
};

/* Lines with no event attached — ESPN writes these as plain prose.
   A few recur every match and are worth catching. */
const LOOSE = [
  [/^Lineups are announced/i, "Byrjunarliðin tilkynnt, leikmenn hita upp."],
  [/^Match ends,/i, "Leik lokið."],
  [/^Second Half begins/i, "Síðari hálfleikur hafinn."],
  [/^First Half begins/i, "Fyrri hálfleikur hafinn."],
  [/announced (\d+) minutes of added time/i, (m) =>
    `Uppbótartími: ${m[1]} mínútur.`],
  /* Added after watching the first real live match (Como, 16 Aug): these
     four all arrived as plain text with no play object attached at all —
     something the historical, fully-settled Monaco data never showed,
     since by full time everything's back-filled. Live, in-progress
     commentary is evidently less complete in the moment than finished
     data is, so text-pattern matching has to cover what play.id can't. */
  [/^Foul by ([^(]+?)\s*\(([^)]+)\)\.?$/i, (m) => `Brot — ${m[1].trim()} (${m[2].trim()}).`],
  // The other half of a foul pair, same shape as the duplicate-foul lines
  // dedup already drops when a play.id IS present. No play.id here to key
  // off, but it's pure restatement of the Foul-by line above — return
  // nothing rather than show a near-duplicate.
  [/wins a free kick in the (?:defensive|attacking|midfield) half\.?$/i, ""],
  [/^Delay over\. They are ready to continue\.?$/i, "Leikur hefst að nýju."],
  [/^Delay in match because of an injury [^(]+?\(([^)]+)\)\.?$/i, (m) =>
    `Töf á leiknum — ${m[1].trim()}.`],
  // Same phenomenon as the four above, different event: this substitution
  // phrasing is identical to the one the structured template already
  // handles ("Substitution, Como. X replaces Y.") — just arriving without
  // a play object this time. Runs the team name through the same TEAM_IS
  // shortening the templated path uses, so it stays consistent even for
  // a team not yet seen in either path.
  [/^Substitution, ([^.]+)\.\s*(.+?) replaces (.+?)\.?$/i, (m) =>
    `Skipting hjá ${TEAM_IS[m[1].trim()] || m[1].trim()}: ${m[2].trim()} kemur inn á fyrir ${m[3].trim()}.`],
];

export function toIcelandic(entry) {
  const play = entry.play;
  if (play && play.type) {
    const fn = TEMPLATES[play.type.type];
    if (fn) return { is: fn(play), kind: play.type.type, known: true };
  }
  for (const [re, out] of LOOSE) {
    const m = re.exec(entry.text || "");
    if (m) return { is: typeof out === "function" ? out(m) : out, kind: "info", known: true };
  }
  // Nothing matched — show the English so a gap is visible rather than silent
  return { is: entry.text || "", kind: (play && play.type && play.type.type) || "annad", known: false };
}

/* ---------- build the feed ---------- */
function buildFeed(summary) {
  const seen = new Set();
  const out = [];

  for (const entry of summary.commentary || []) {
    // Fouls arrive as two entries sharing one play.id ("Foul by X" and
    // "Y wins a free kick"). Keep the first, drop the echo.
    const pid = entry.play && entry.play.id;
    if (pid) {
      if (seen.has(pid)) continue;
      seen.add(pid);
    }
    const { is, kind, known } = toIcelandic(entry);
    if (!is) continue;
    out.push({
      seq: entry.sequence,
      clock: (entry.time && entry.time.displayValue) || "",
      wallclock: (entry.play && entry.play.wallclock) || null,
      is,
      en: entry.text || "",
      kind,
      known,
      big: /^MARK|^RAUTT/.test(is),
    });
  }
  return out.reverse(); // newest first
}

/* Enough of a header to render the fixture and its countdown when the
   commentary endpoint is refused. Knowing WHEN the match is beats showing
   an error, and ESPN names events "Away at Home". */
function headerFromMatch(m) {
  const n = String(m.name || "");
  let home = "", away = "";
  if (n.includes(" at ")) { const [a, h] = n.split(" at "); away = a.trim(); home = h.trim(); }
  else if (n.includes(" vs ")) { const [h, a] = n.split(" vs "); home = h.trim(); away = a.trim(); }
  const side = (name) => ({
    name, short: name, logo: "", score: "",
    isLiverpool: /liverpool/i.test(name),
  });
  return {
    home: side(home || "Liverpool"),
    away: side(away || "—"),
    state: m.state || "pre",
    detail: "",
    kickoff: m.date || null,
    venue: "",
    league: m.league || "",
  };
}

function headerOf(summary) {
  const comp = (summary.header && summary.header.competitions && summary.header.competitions[0]) || {};
  const cs = comp.competitors || [];
  const side = (ha) => {
    const c = cs.find((x) => x.homeAway === ha) || {};
    return {
      name: (c.team && c.team.displayName) || "",
      short: (c.team && c.team.shortDisplayName) || "",
      logo: (c.team && c.team.logos && c.team.logos[0] && c.team.logos[0].href) || "",
      score: c.score != null ? String(c.score) : "",
      isLiverpool: String(c.id) === LIVERPOOL,
    };
  };
  const st = (comp.status && comp.status.type) || {};
  return {
    home: side("home"),
    away: side("away"),
    state: st.state || "pre",
    detail: st.detail || "",
    kickoff: comp.date || null,
    venue: (summary.gameInfo && summary.gameInfo.venue && summary.gameInfo.venue.fullName) || "",
    league: (summary.header && summary.header.league && summary.header.league.name) || "",
  };
}

/* ---------- routes ---------- */
export async function ynwaApi(req, res) {
  const debug = req.query.debug === "1";
  let diag = [];
  try {
    const forced = String(req.query.event || "").replace(/\D/g, "");
    let match;
    if (forced) {
      match = { id: forced, name: "", date: null, state: "", league: "", source: "forced" };
    } else {
      const r = await findMatch(debug);
      match = r.match;
      diag = r.diag;
    }

    const slug = String(req.query.slug || "") || ANY_SLUG;
    const cacheKey = match.id;

    // The TTL is decided when a payload is stored (see ttlFor), so a cold
    // cache can't accidentally pick the slow one.
    if (!debug && feedCache.payload && feedCache.key === cacheKey
        && Date.now() - feedCache.at < feedCache.ttl) {
      return res.json(feedCache.payload);
    }

    const sum = await tryJson(`${SITE}/${slug}/summary?event=${match.id}`);
    if (!sum.ok) {
      // Serve the last good feed rather than blanking the page over one refusal.
      if (feedCache.payload && feedCache.key === cacheKey) {
        const stale = { ...feedCache.payload, stale: true, staleReason: sum.note };
        if (debug) stale.diag = diag;
        return res.json(stale);
      }
      // Nothing cached either — still show the fixture and its countdown.
      const limited = {
        ok: true, limited: true, limitedReason: sum.note,
        fetchedAt: new Date().toISOString(),
        eventId: match.id, slug, matchName: match.name, via: match.source,
        kickoffIso: match.date || null,
        kickoffText: kickoffTextIs(match.date),
        kickoffDay: kickoffDayIs(match.date),
        header: headerFromMatch(match),
        lagSec: null, untranslated: 0, feed: [],
      };
      if (debug) limited.diag = diag;
      // Brief cache: a refused summary shouldn't be retried on every reload,
      // but should recover quickly once ESPN relents.
      if (!debug) feedCache = { at: Date.now(), key: cacheKey, payload: limited, ttl: 60000 };
      return res.json(limited);
    }
    const summary = sum.data;
    const header = headerOf(summary);
    const feed = buildFeed(summary);

    /* How far behind real time is the feed? Every event carries the
       wall-clock moment it happened, so this is measurable rather than
       guessed. Only meaningful while the match is live. */
    let lagSec = null;
    const newest = feed.find((f) => f.wallclock);
    if (newest && header.state === "in") {
      lagSec = Math.round((Date.now() - Date.parse(newest.wallclock)) / 1000);
    }

    const payload = {
      ok: true,
      fetchedAt: new Date().toISOString(),
      eventId: match.id,
      slug,
      matchName: match.name,
      via: match.source,
      kickoffIso: header.kickoff,
      kickoffText: kickoffTextIs(header.kickoff),
      kickoffDay: kickoffDayIs(header.kickoff),
      header,
      lagSec,
      untranslated: feed.filter((f) => !f.known).length,
      feed,
    };
    payload.cacheTtlMs = ttlFor(payload);
    if (debug) payload.diag = diag;
    if (!debug) {
      feedCache = { at: Date.now(), key: cacheKey, payload, ttl: payload.cacheTtlMs };
    }
    res.json(payload);
  } catch (err) {
    console.error("[/api/ynwa]", err.message);
    res.json({
      ok: false,
      reason: err.message,
      // ?debug=1 shows every endpoint tried, its status and what came back
      diag: err.diag || diag,
    });
  }
}

/* ============================================================
   /api/ynwa/probe — throwaway diagnostic.

   ESPN answers a browser in Iceland but returned 403 to Railway for
   a soccer summary, while the golf and NFL routes were working. That
   could mean any of: the whole IP is blocked, only soccer is blocked,
   only that host is blocked, or the request shape matters.

   Guessing costs a deploy each time. This asks all of them at once,
   from the server's own address, and reports what came back.
   ============================================================ */
const PROBE_EVENT = "401886533"; // Liverpool 2-3 Monaco

const PROBES = [
  ["soccer summary (current path)",
    `${SITE}/eng.1/summary?event=${PROBE_EVENT}`],
  ["soccer scoreboard",
    `${SITE}/eng.1/scoreboard`],
  ["soccer team schedule",
    `${SITE}/eng.1/teams/${LIVERPOOL}/schedule`],
  ["golf scoreboard (does the working route still work?)",
    "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard"],
  ["nfl scoreboard (the other ESPN caller)",
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"],
  ["soccer via site.web.api host",
    `https://site.web.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=${PROBE_EVENT}`],
  ["soccer via cdn.espn.com core",
    `https://cdn.espn.com/core/soccer/commentary?xhr=1&gameId=${PROBE_EVENT}`],
  ["soccer via cdn.espn.com match",
    `https://cdn.espn.com/core/soccer/match?xhr=1&gameId=${PROBE_EVENT}`],
  ["fauxcast sync feed (from the payload's meta.syncUrl)",
    `https://client.espncdn.com/fauxcast/stats/19834/${PROBE_EVENT}/en/us/`],
];

const BROWSERISH = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.espn.com/",
};

async function probeOne(label, url, headers) {
  const started = Date.now();
  try {
    const r = await fetch(url, headers ? { headers } : undefined);
    const body = await r.text();
    let shape = "";
    try {
      const j = JSON.parse(body);
      const keys = Object.keys(j);
      shape = keys.slice(0, 8).join(",");
      if (Array.isArray(j.events)) shape += `  events:${j.events.length}`;
      if (Array.isArray(j.commentary)) shape += `  commentary:${j.commentary.length}`;
      if (j.gamepackageJSON) shape += "  (gamepackageJSON present)";
    } catch {
      shape = "not JSON — " + body.slice(0, 60).replace(/\s+/g, " ");
    }
    return {
      label, url: url.slice(0, 96),
      headers: headers ? "browser-ish" : "none",
      status: r.status, ms: Date.now() - started,
      bytes: body.length, shape,
    };
  } catch (e) {
    return { label, url: url.slice(0, 96), headers: headers ? "browser-ish" : "none",
      status: 0, ms: Date.now() - started, bytes: 0, shape: "ERR " + e.message.slice(0, 60) };
  }
}

export async function ynwaProbe(req, res) {
  const st = espnStatus();
  if (st.open) {
    return res.set("Content-Type", "text/plain; charset=utf-8").send(
      "ESPN traffic is paused by the shared circuit breaker.\n" +
      `Reopens in ${st.reopensInSec}s (tripped at ${st.since}).\n\n` +
      `ok:${st.totals.ok}  refused:${st.totals.refused}  skipped:${st.totals.skipped}\n\n` +
      "Probing now would only extend it. Try again after that.\n",
    );
  }
  const out = [];
  for (const [label, url] of PROBES) out.push(await probeOne(label, url, null));
  // and the current path again, this time pretending to be a browser
  out.push(await probeOne("soccer summary + browser headers",
    `${SITE}/eng.1/summary?event=${PROBE_EVENT}`, BROWSERISH));

  const ok = out.filter((o) => o.status === 200);
  res.set("Content-Type", "text/plain; charset=utf-8").send(
    "ESPN reachability from this server\n" +
    "=================================\n" +
    new Date().toISOString() + "\n\n" +
    out.map((o) =>
      `${String(o.status).padStart(3)}  ${o.ms}ms  ${String(o.bytes).padStart(7)}b  ` +
      `[${o.headers}]  ${o.label}\n     ${o.url}\n     ${o.shape}\n`
    ).join("\n") +
    `\n${ok.length} of ${out.length} returned 200.\n` +
    (ok.length ? "WORKING:\n" + ok.map((o) => "  - " + o.label).join("\n") + "\n"
               : "Nothing got through — the whole IP looks blocked.\n"),
  );
}

export function ynwaPage(req, res) {
  res.set("Content-Type", "text/html; charset=utf-8").send(PAGE);
}

/* ------------------------------------------------------------
   The page. Deliberately one static string with no build step,
   so this whole experiment is a single file that can be deleted
   in one commit, or lifted onto ynwa.is unchanged.
   ------------------------------------------------------------ */
const PAGE = `<!doctype html>
<html lang="is">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>YNWA — Liverpool í beinni</title>
<meta name="description" content="Beint textalýsing frá leikjum Liverpool á íslensku." />
<meta name="theme-color" content="#0B0B0D" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
<style>
:root{
  --bg:#0B0B0D; --panel:#141417; --line:#242429; --line2:#33333A;
  --text:#F2F2F4; --muted:#A2A2AC; --dim:#74747E; --faint:#4A4A53;
  --red:#C8102E; --redbright:#FF2D48; --gold:#F6EB61;
  --mono:'IBM Plex Mono',ui-monospace,Menlo,monospace;
  --sans:'Archivo',system-ui,-apple-system,sans-serif;
}
html{font-size:17.5px} /* every size on the page is in rem, so this one line
  nudges everything up together — a little bigger everywhere, no per-element hunting */
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);
  background-image:radial-gradient(ellipse 70% 40% at 50% -8%,rgba(200,16,46,.18),transparent 70%)}
.wrap{max-width:760px;margin:0 auto;padding:0 16px 72px}
a{color:inherit}

header{padding:26px 0 14px;border-bottom:1px solid var(--line2)}
.brand{display:flex;align-items:center;gap:11px}
.mark{width:20px;height:3px;background:var(--red);border-radius:1px}
.eyebrow{font-size:.66rem;letter-spacing:.26em;text-transform:uppercase;color:var(--muted);font-weight:700}
h1{font-weight:900;font-size:clamp(1.8rem,7vw,2.7rem);margin:9px 0 2px;letter-spacing:-.02em}
.tag{font-weight:700;font-size:.9rem;color:var(--muted)}
.tag b{color:var(--red)}

.score{margin-top:16px;padding:18px 16px;background:var(--panel);border:1px solid var(--line2);
  border-radius:12px;display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center}
.side{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.side img{width:44px;height:44px;object-fit:contain}
.side .nm{font-weight:700;font-size:.9rem}
.nums{font-family:var(--mono);font-weight:600;font-size:clamp(1.9rem,9vw,3rem);
  font-variant-numeric:tabular-nums;letter-spacing:.02em;white-space:nowrap}
.nums--time{font-size:clamp(1.7rem,7vw,2.4rem);color:var(--text)}
.state{text-align:center;font-size:.64rem;letter-spacing:.18em;text-transform:uppercase;
  color:var(--muted);margin-top:6px}
.state.live{color:var(--redbright);font-weight:900;animation:pulse 1.6s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.meta{margin-top:10px;color:var(--dim);font-size:.76rem;text-align:center;line-height:1.6}
.until{margin-top:4px;text-align:center;font-family:var(--mono);font-size:.9rem;color:var(--text);font-variant-numeric:tabular-nums}

.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:16px 0 4px}
.btn{padding:6px 12px;border-radius:20px;font-size:.72rem;font-weight:600;cursor:pointer;
  background:transparent;border:1px solid var(--line2);color:var(--dim);font-family:inherit}
.btn:hover{color:var(--text)}
.btn.on{background:rgba(200,16,46,.14);border-color:var(--red);color:var(--text)}
.note{font-size:.7rem;color:var(--faint);margin-top:6px;line-height:1.6}

.feed{margin-top:14px;display:flex;flex-direction:column;gap:8px}
.row{display:grid;grid-template-columns:52px 1fr;gap:14px;padding:12px 14px;
  background:var(--panel);border:1px solid var(--line);border-left:3px solid transparent;
  border-radius:9px}
.row.big{border-left-color:var(--red);background:#1A1216}
.row.info{opacity:.72}
.row.unknown{border-left-color:var(--gold)}
.min{font-family:var(--mono);font-weight:600;font-size:1rem;color:var(--muted);
  font-variant-numeric:tabular-nums}
.txt{font-size:.95rem;line-height:1.5}
.row.big .txt{font-weight:700}
.en{margin-top:5px;font-size:.76rem;color:var(--faint);line-height:1.45;display:none}
body.show-en .en{display:block}
.kind{font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-top:4px}
.diag{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);text-align:left;font-family:var(--mono);font-size:.68rem;color:var(--faint);line-height:1.9}
.diag code{color:var(--muted)}
.empty{padding:22px 16px;text-align:center;color:var(--dim);font-size:.9rem;line-height:1.6;
  background:var(--panel);border:1px solid var(--line);border-radius:10px}

/* ---------- comments ---------- */
.commentToggle{margin-top:8px;padding:5px 10px;border:1px solid var(--line2);border-radius:16px;
  background:none;color:var(--muted);font-size:.72rem;font-family:var(--sans);cursor:pointer}
.commentToggle:hover{border-color:var(--red);color:var(--text)}
.thread{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line2)}
.comment{padding:8px 10px;background:var(--panel);border:1px solid var(--line);border-radius:8px;
  margin-bottom:6px}
.comment.reply{margin-left:20px;background:#1A1A1E}
.cMeta{display:flex;align-items:center;gap:7px;font-size:.66rem;color:var(--dim);margin-bottom:3px}
.cMeta b{color:var(--text);flex:1}
.avatar{width:20px;height:20px;border-radius:50%;object-fit:cover;flex:none;background:var(--line)}
.comment p{font-size:.82rem;line-height:1.42;margin:0}
.replyBtn{margin-top:4px;background:none;border:none;color:var(--red);font-size:.68rem;
  cursor:pointer;padding:0;font-family:var(--sans)}
.replyBox{display:none;flex-direction:column;gap:6px;margin-top:8px}
.replyBox--open{display:flex}
.composer{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.composerIdentity{display:flex;gap:6px;flex-wrap:wrap}
.composerIdentity input{flex:1;min-width:110px}
.composer button, .replyBox button{align-self:flex-end;padding:7px 14px;border-radius:7px;border:none;
  background:var(--red);color:#fff;font-size:.78rem;cursor:pointer;font-family:var(--sans)}
.input{padding:7px 9px;border-radius:7px;background:var(--bg);border:1px solid var(--line);
  color:var(--text);font-size:16px;font-family:var(--sans)}
.input::placeholder{color:var(--faint)}
.textarea{width:100%;resize:vertical;min-height:64px;line-height:1.4;font-size:16px}
.textarea--reply{min-height:44px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.botCheck{display:flex;align-items:center;gap:6px;font-size:.76rem;color:var(--dim);cursor:pointer}
.botCheck input{accent-color:var(--red)}
.adminDelete{color:var(--faint)}
.adminDelete:hover{color:var(--red)}
.adminWipe{display:block;margin-bottom:10px;padding:5px 10px;border:1px solid #4A1420;
  border-radius:6px;color:var(--red);font-size:.68rem;font-family:var(--sans);background:none;cursor:pointer}
.adminWipe:hover{background:rgba(200,16,46,.1)}
#chat{margin-top:20px;padding-top:16px;border-top:1px solid var(--line2)}
#chat .colHead{font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);margin-bottom:8px}
.chatEmpty{color:var(--faint);font-size:.82rem;padding:6px 0}

/* One "show everything" control under the 5-event preview, so the live
   ticker stays short without hiding the match history. */
.showAllBtn{display:none;width:100%;margin-top:8px;padding:9px;border-radius:8px;
  border:1px dashed var(--line2);background:none;color:var(--muted);
  font-size:.78rem;font-family:var(--sans);cursor:pointer}
.showAllBtn:hover{border-color:var(--red);color:var(--text)}

/* The composer only exists when opened, so it gets a clear frame to
   show it's a distinct, temporary thing rather than page furniture. */
.newCommentBtn{width:100%;padding:10px;margin-bottom:10px;border-radius:8px;
  border:1px solid var(--line2);background:var(--panel);color:var(--text);
  font-size:.82rem;font-weight:600;font-family:var(--sans);cursor:pointer}
.newCommentBtn:hover{border-color:var(--red)}
.composer{border:1px solid var(--red);border-radius:9px;padding:10px;margin-bottom:12px;
  background:var(--panel);display:flex;flex-direction:column;gap:6px}
.composerTag{font-size:.7rem;color:var(--red);font-weight:600;padding-bottom:2px}
.composerActions{display:flex;gap:8px;justify-content:flex-end;align-items:center}
.btnGhostSmall{padding:7px 12px;border-radius:7px;border:1px solid var(--line2);
  background:none;color:var(--muted);font-size:.78rem;font-family:var(--sans);cursor:pointer}
.btnGhostSmall:hover{color:var(--text)}
/* A comment keeps a visible link to the moment it was about, even
   though it no longer lives inside the feed. */
.commentEventTag{font-size:.68rem;color:var(--dim);border-left:2px solid var(--red);
  padding-left:6px;margin-bottom:5px;line-height:1.3}
footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);
  color:var(--faint);font-size:.68rem;line-height:1.7}
@media (max-width:520px){.row{grid-template-columns:44px 1fr;gap:10px}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><span class="mark"></span>
      <span class="eyebrow">Liverpool í beinni · á íslensku</span></div>
    <h1>YNWA</h1>
    <p class="tag">You'll <b>Never</b> Walk Alone</p>
  </header>

  <div id="score"></div>

  <div class="bar">
    <button class="btn" id="toggleEn">Sýna enska textann</button>
    <button class="btn" id="toggleChat">Spjall</button>
    <button class="btn" id="refresh">Uppfæra núna</button>
    <span class="note" id="status"></span>
  </div>
  <p class="note" id="diag"></p>

  <div class="feed" id="feed"></div>
  <button class="showAllBtn" id="showAll"></button>
  <div id="chat"></div>

  <footer>
    <p><strong>YNWA</strong> — tilraun. Lýsingin er búin til sjálfvirkt úr
    atburðaskrá ESPN (gögn frá Stats Perform) og þýdd með sniðmátum, ekki
    vélþýðingu — þess vegna er íslenskan alltaf málfræðilega rétt.</p>
    <p>Uppfærist sjálfkrafa á 20 sekúndna fresti meðan á leik stendur.</p>
  </footer>
</div>

<script>
const qs = new URLSearchParams(location.search);
const api = "/api/ynwa" + (qs.toString() ? "?" + qs.toString() : "");
let timer = null;

const p2 = function(n){ return String(n).padStart(2,"0"); };
const clock24 = function(d){ return p2(d.getHours())+":"+p2(d.getMinutes())+":"+p2(d.getSeconds()); };

// "eftir 21 klst 36 mín" — generated, not localised, for the same reason
// the commentary is.
function untilIs(ms){
  if (ms <= 0) return "";
  var m = Math.floor(ms/60000), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d > 0) return "eftir " + d + (d === 1 ? " dag " : " daga ") + (h % 24) + " klst";
  if (h > 0) return "eftir " + h + " klst " + (m % 60) + " mín";
  if (m > 0) return "eftir " + m + " mín";
  return "eftir augnablik";
}

function stateLabel(h, d){
  if (h.state === "in") return { text:"í beinni · " + (h.detail||""), live:true };
  if (h.state === "post") return { text:"leik lokið", live:false };
  return { text:"hefst " + (d.kickoffDay || d.kickoffText || "síðar"), live:false };
}

// Every poll — every 20s while a match is live — rebuilds the feed's whole
// innerHTML, which would otherwise silently wipe anything someone's
// mid-typing into an open thread's composer. This snapshots every
// composer-related field (name/email/text/checkbox/hidden bot-guard
// fields) before a rebuild and restores it after, so an in-progress
// comment survives a poll landing at the wrong moment — and just as
// importantly, the ORIGINAL render timestamp is restored too, so someone
// who's been typing for 10 seconds doesn't get flagged as submitting
// impossibly fast just because a poll happened to reset the clock under
// them mid-sentence.
//
// Restoring the VALUE isn't enough on its own, though — innerHTML
// replacement destroys the actual DOM node, so even with the text
// carried over, the cursor and focus are gone, and typing stops dead
// until the person taps back into the box. So this also remembers WHICH
// field had focus and exactly where the cursor was, and puts both back
// after the rebuild — the whole point being that a poll landing
// mid-sentence should be invisible, not just non-destructive.
function snapshotComposers(){
  var snap = {};
  document.querySelectorAll(
    ".composer input, .composer textarea, .replyBox input, .replyBox textarea, .botCheckbox"
  ).forEach(function(el){
    if (!el.id) return;
    snap[el.id] = (el.type === "checkbox") ? el.checked : el.value;
  });
  var active = document.activeElement;
  if (active && active.id && snap.hasOwnProperty(active.id)){
    snap.__focusId = active.id;
    if (typeof active.selectionStart === "number"){
      snap.__selStart = active.selectionStart;
      snap.__selEnd = active.selectionEnd;
    }
  }
  return snap;
}
function restoreComposers(snap){
  Object.keys(snap).forEach(function(id){
    if (id.indexOf("__") === 0) return;
    var el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") el.checked = snap[id];
    else el.value = snap[id];
  });
  if (snap.__focusId){
    var focusEl = document.getElementById(snap.__focusId);
    if (focusEl){
      focusEl.focus();
      if (typeof snap.__selStart === "number" && focusEl.setSelectionRange){
        try { focusEl.setSelectionRange(snap.__selStart, snap.__selEnd); } catch(e){}
      }
    }
  }
  // The Send button's enabled state is derived from the checkbox, not
  // stored on the button — so restoring the checkbox alone would leave
  // Send stuck disabled after a poll. Re-derive it here.
  var cb = document.getElementById("c-bot");
  var sendBtn = document.getElementById("send-x");
  if (cb && sendBtn) sendBtn.disabled = !cb.checked;
}

function render(d){
  lastData = d;
  var composerSnapshot = snapshotComposers();
  try {
  const scoreEl = document.getElementById("score");
  const feedEl = document.getElementById("feed");
  const statusEl = document.getElementById("status");
  const diagEl = document.getElementById("diag");

  if (!d.ok){
    scoreEl.innerHTML = "";
    var help = '<div class="empty">Enginn leikur fannst.<br>'
      + '<span style="color:#4A4A53">' + esc(d.reason||"") + '</span>';
    if (d.diag && d.diag.length){
      help += '<div class="diag"><b>Hvað var reynt:</b><br>' + d.diag.map(function(x){
        return esc((x.step||"") + (x.slug ? " " + x.slug : "")) + " — HTTP " + x.status
          + " · " + (x.events||0) + " leikir"
          + (x.liverpool != null ? " · " + x.liverpool + " með Liverpool" : "")
          + (x.note ? " · " + esc(x.note) : "");
      }).join("<br>") + "</div>";
    } else {
      help += '<div class="diag">Bættu við <code>?debug=1</code> við slóðina '
        + 'til að sjá hvað var reynt.</div>';
    }
    feedEl.innerHTML = help + "</div>";
    statusEl.textContent = "";
    diagEl.textContent = "";
    return;
  }

  const h = d.header, s = stateLabel(h, d);
  // Before kickoff there is no score to show, so the middle carries the
  // start time instead of three meaningless dashes.
  var middle;
  if (h.state === "pre" && h.kickoff){
    var k = new Date(h.kickoff);
    middle = '<div class="nums nums--time">'+p2(k.getHours())+':'+p2(k.getMinutes())+'</div>';
  } else {
    middle = '<div class="nums">'+(h.home.score||"0")+' – '+(h.away.score||"0")+'</div>';
  }
  scoreEl.innerHTML =
    '<div class="score">'
    + '<div class="side">' + (h.home.logo ? '<img src="'+h.home.logo+'" alt="">' : "")
      + '<span class="nm">'+h.home.short+'</span></div>'
    + '<div>' + middle
      + '<div class="state'+(s.live?" live":"")+'">'+s.text+'</div></div>'
    + '<div class="side">' + (h.away.logo ? '<img src="'+h.away.logo+'" alt="">' : "")
      + '<span class="nm">'+h.away.short+'</span></div>'
    + '</div>'
    + '<p class="meta">' + [h.league, h.venue].filter(Boolean).join(" · ") + '</p>'
    + (h.state === "pre" && d.kickoffIso
        ? '<p class="until" id="until"></p>' : "");

  startCountdown(h.state === "pre" ? d.kickoffIso : null);

  if (!d.feed.length){
    feedEl.innerHTML = d.limited
      ? '<div class="empty">Næ ekki í lýsinguna frá ESPN í augnablikinu.'
        + '<br><span style="color:#4A4A53">Reyni sjálfkrafa aftur — leikurinn sjálfur er réttur.</span></div>'
      : '<div class="empty">Lýsingin byrjar þegar flautað er til leiks.'
        + '<br><span style="color:#4A4A53">Atburðir birtast hér sjálfkrafa.</span></div>';
  } else {
    feedEl.innerHTML = d.feed.map(renderFeedRow).join("");
  }

  const t = clock24(new Date(d.fetchedAt));
  statusEl.textContent = (d.stale ? "síðast uppfært " : "uppfært ") + t;
  const bits = ["atburðir: " + d.feed.length];
  if (d.lagSec != null) bits.push("seinkun frá vellinum: ~" + d.lagSec + "s");
  if (d.untranslated) bits.push("óþýddar gerðir: " + d.untranslated);
  bits.push("leikur " + d.eventId + " (" + d.slug + ")");
  if (d.stale) bits.push("ESPN svaraði ekki — sýni síðustu gögn");
  if (d.limited) bits.push("ESPN takmarkar fyrirspurnir (" + (d.limitedReason||"") + ")");
  diagEl.textContent = bits.join("  ·  ");

  // 20s live; 30s from a quarter-hour before kickoff so the first whistle
  // isn't missed by two minutes; 2 min otherwise.
  const ko = h.kickoff ? Date.parse(h.kickoff) : null;
  const soon = ko != null && Date.now() > ko - 15 * 60000 && Date.now() < ko + 4 * 3600000;
  const wait = h.state === "in" ? 20000 : (soon ? 30000 : 120000);
  clearTimeout(timer);
  timer = setTimeout(load, wait);
  } finally {
    restoreComposers(composerSnapshot);
  }
}

var tickTimer = null;
function startCountdown(iso){
  clearInterval(tickTimer);
  var el = document.getElementById("until");
  if (!iso || !el) return;
  var ko = Date.parse(iso);
  var draw = function(){
    var left = ko - Date.now();
    if (left <= 0){ el.textContent = "hefst núna"; clearInterval(tickTimer); return; }
    el.textContent = untilIs(left);
  };
  draw();
  tickTimer = setInterval(draw, 1000);
}

function esc(s){ return String(s==null?"":s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

/* ---------- comments ----------
   One flat list from the server; a comment's eventId links it to a
   feed line by that line's own "seq" (ESPN's own stable sequence
   number), and parentId links a reply to another comment. Both
   nullable, so general chat / event-linked comments / threaded
   replies all come out of the same list without three data shapes.

   matchId (sent as the "event" the whole page is fetching) is really
   just an opaque content id as far as storage is concerned — nothing
   here assumes it's specifically an ESPN match. Whenever there's a
   real article/match-report feature, giving it its own comment thread
   is just passing that content's own id through the same functions
   below — no rework, just a different id going into the same shape. */
var comments = [];
var lastData = null;
// A secret key of the admin's own choosing (set as ADMIN_KEY on the
// server), attached only when THEY open the page with it. Nobody else
// can produce delete buttons just by viewing the page — this value
// isn't validated client-side, only used to attempt a delete, which the
// server checks for real. Never share a URL that has this attached.
var adminKey = new URLSearchParams(location.search).get("admin") || "";

function commentsForEvent(seq){ return comments.filter(function(c){ return c.eventId === String(seq); }); }
function repliesTo(id){ return comments.filter(function(c){ return c.parentId === id; }); }
function topLevel(list){ return list.filter(function(c){ return c.parentId == null; }); }

// Which comment/event the on-demand composer is currently aimed at.
// null target = a general comment; a seq = tagged to that feed moment;
// replyTo = a reply to another comment. Only ONE composer exists at a
// time anywhere on the page, which is what keeps the chat clean by
// default rather than showing a box under every single item.
var composer = null; // { eventId, parentId } or null when closed
var showAllEvents = false;
var chatOpen = true;
try { chatOpen = localStorage.getItem("ynwa:chat") !== "off"; } catch(e){}

var FEED_PREVIEW_COUNT = 5;

// No accounts — so a name+email typed once is remembered on THIS browser
// only, and quietly refilled next time, rather than asking regulars to
// retype it every single comment.
function rememberedIdentity(){
  try { var raw = localStorage.getItem("ynwa:me"); if (raw) return JSON.parse(raw); } catch(e){}
  return { name:"", email:"" };
}
function rememberIdentity(name, email){
  try { localStorage.setItem("ynwa:me", JSON.stringify({ name: name||"", email: email||"" })); } catch(e){}
}

// A real Gravatar-registered photo if the person has one; otherwise a
// stable, distinct pattern generated from their name — nobody gets a
// blank space just for not having an account.
function avatarHtml(c){
  if (!c.avatarHash) return "";
  var url = "https://www.gravatar.com/avatar/"+c.avatarHash+"?d="+(c.avatarFallback||"identicon")+"&s=64";
  return '<img class="avatar" src="'+url+'" alt="">';
}

/* Bot guard: three cheap layers, none needing a third-party service.
   (1) A checkbox — the thing that actually gets clicked, matching what
       was asked for, though on its own it stops nothing scripted.
   (2) A honeypot field, hidden off-screen (not display:none — some bots
       specifically skip anything with that) rather than visually gone,
       so a script that blindly fills every input trips it while no
       human ever sees or touches it.
   (3) A rendered-at timestamp — a submission within ~1.5s of the page
       rendering is almost certainly a script, not someone reading and
       typing.
   All three are re-checked server-side, since anything client-side-only
   is trivially bypassed by posting to the API directly. */
function botGuardHtml(){
  return '<input type="text" class="hp" id="hp-x" tabindex="-1" autocomplete="off">'
    + '<input type="hidden" id="ra-x" value="'+Date.now()+'">'
    + '<label class="botCheck"><input type="checkbox" class="botCheckbox" id="c-bot"> Ég er ekki vélmenni</label>';
}

// Finds the feed line a comment is tagged to, so the chat can show WHICH
// moment someone was reacting to even though the comment no longer lives
// inside the feed itself.
function eventLabelFor(eventId){
  if (eventId == null || !lastData || !lastData.feed) return "";
  for (var i=0;i<lastData.feed.length;i++){
    if (String(lastData.feed[i].seq) === String(eventId)){
      var f = lastData.feed[i];
      return (f.clock ? f.clock + " · " : "") + f.is;
    }
  }
  return "";
}

// The single on-demand composer. Opens where it's needed, closes after
// posting — so nothing sits on screen taking up space by default.
function composerHtml(){
  if (!composer) return "";
  var me = rememberedIdentity();
  var tag = "";
  if (composer.parentId){
    var parent = comments.find(function(c){ return c.id === composer.parentId; });
    if (parent) tag = '<div class="composerTag">Svar við: ' + esc(parent.name) + '</div>';
  } else if (composer.eventId != null){
    var lbl = eventLabelFor(composer.eventId);
    if (lbl) tag = '<div class="composerTag">Um: ' + esc(lbl) + '</div>';
  }
  return '<div class="composer" id="composerBox">'
    + tag
    + '<div class="composerIdentity">'
      + '<input class="input" placeholder="Nafn" id="c-name" value="'+esc(me.name)+'">'
      + '<input class="input" placeholder="Netfang (valfrjálst — birtist ekki, notað fyrir mynd)" id="c-email" value="'+esc(me.email)+'">'
    + '</div>'
    + '<textarea class="input textarea" placeholder="Skrifaðu athugasemd…" id="c-text" rows="3"></textarea>'
    + botGuardHtml()
    + '<div class="composerActions">'
      + '<button class="btnGhostSmall" data-cancel-composer="1">Hætta við</button>'
      + '<button id="send-x" data-send="1" disabled>Senda</button>'
    + '</div></div>';
}

function commentHtml(c, depth){
  var lbl = depth === 0 ? eventLabelFor(c.eventId) : "";
  return '<div class="comment'+(depth?' reply':'')+'">'
    + (lbl ? '<div class="commentEventTag">'+esc(lbl)+'</div>' : '')
    + '<div class="cMeta">'+avatarHtml(c)+'<b>'+esc(c.name)+'</b><span>'+clock24(new Date(c.at))+'</span></div>'
    + '<p>'+esc(c.text)+'</p>'
    + '<button class="replyBtn" data-reply="'+c.id+'">svara</button>'
    + (adminKey ? ' <button class="replyBtn adminDelete" data-delete-comment="'+c.id+'">eyða</button>' : '')
    + (composer && composer.parentId === c.id ? composerHtml() : '')
    + repliesTo(c.id).map(function(r){ return commentHtml(r, depth+1); }).join("")
    + '</div>';
}

function renderFeedRow(f){
  var cls = "row" + (f.big?" big":"") + (f.kind==="info"?" info":"") + (f.known?"":" unknown");
  var seq = f.seq, count = commentsForEvent(seq).length;
  return '<div class="'+cls+'">'
    + '<div class="min">'+(f.clock||"")+'</div>'
    + '<div><div class="txt">'+esc(f.is)+'</div>'
    + (f.known ? "" : '<div class="kind">óþýtt: '+esc(f.kind)+'</div>')
    + '<div class="en">'+esc(f.en)+'</div>'
    + '<button class="commentToggle" data-comment-on="'+seq+'">💬 '+(count||"Skrifa")+'</button>'
    + '</div></div>';
}

function renderFeed(){
  var el = document.getElementById("feed");
  var btn = document.getElementById("showAll");
  if (!el || !lastData || !lastData.ok || !lastData.feed) return;
  var all = lastData.feed;
  var shown = showAllEvents ? all : all.slice(0, FEED_PREVIEW_COUNT);
  el.innerHTML = shown.map(renderFeedRow).join("");
  if (btn){
    if (all.length > FEED_PREVIEW_COUNT){
      btn.style.display = "block";
      btn.textContent = showAllEvents
        ? "Sýna færri atburði"
        : "Sjá alla atburði (" + all.length + ")";
    } else {
      btn.style.display = "none";
    }
  }
}

// One unified chat: general comments AND event-tagged ones together,
// newest first, each tagged with the moment it was about. The composer
// only exists when opened, and sits directly above the newest comment.
function renderChat(){
  var el = document.getElementById("chat");
  if (!el) return;
  if (!chatOpen){ el.innerHTML = ""; el.style.display = "none"; return; }
  el.style.display = "block";

  var label = "Spjall";
  if (lastData && lastData.header) {
    label = "Spjall um " + lastData.header.home.short + " – " + lastData.header.away.short;
  }
  var top = topLevel(comments).slice().sort(function(a,b){
    return new Date(b.at) - new Date(a.at); // newest first
  });

  el.innerHTML = '<h3 class="colHead">'+esc(label)+'</h3>'
    + (adminKey ? '<button class="adminWipe" data-delete-all="1">eyða öllu spjalli fyrir þennan leik</button>' : '')
    + (composer && !composer.parentId ? composerHtml()
        : '<button class="newCommentBtn" data-open-composer="general">Skrifa athugasemd</button>')
    + (top.length ? top.map(function(c){ return commentHtml(c, 0); }).join("")
        : '<p class="chatEmpty">Engar athugasemdir ennþá.</p>');
}

function reRenderAll(){
  var snap = snapshotComposers();
  renderFeed();
  renderChat();
  restoreComposers(snap);
}

async function loadComments(){
  if (!lastData || !lastData.ok) return;
  const el = document.getElementById("chat");
  try{
    const r = await fetch("/api/ynwa/comments?event="+encodeURIComponent(lastData.eventId), { cache:"no-store" });
    const j = await r.json();
    if (j.ok){ comments = j.comments; reRenderAll(); }
    else if (el) el.innerHTML = commentsErrorHtml(j.reason || "óþekkt villa");
  } catch(e){ if (el) el.innerHTML = commentsErrorHtml(e.message); }
}

// Comments failing used to fail SILENTLY — nothing rendered, no way to tell
// why. That made this exact problem undiagnosable from a screenshot. Now a
// failure says so, with the actual reason (a misconfigured Upstash token
// shows up here directly, rather than as an empty div).
function commentsErrorHtml(reason){
  var label = "Spjall";
  if (lastData && lastData.header) {
    label = "Spjall um " + lastData.header.home.short + " – " + lastData.header.away.short;
  }
  return '<h3 class="colHead">'+esc(label)+'</h3>'
    + '<p style="color:#4A4A53;font-size:.8rem">Næ ekki í athugasemdir í augnablikinu'
    + (reason ? ' — ' + esc(reason) : '') + '.</p>';
}

async function deleteComment(id){
  if (!lastData || !lastData.ok || !adminKey) return;
  if (!confirm("Eyða þessari athugasemd (og svörum við henni)?")) return;
  try{
    await fetch("/api/ynwa/comments?event="+encodeURIComponent(lastData.eventId)+"&id="+encodeURIComponent(id)+"&key="+encodeURIComponent(adminKey), { method:"DELETE" });
  } catch(e){ /* best effort */ }
  await loadComments();
}

async function deleteAllComments(){
  if (!lastData || !lastData.ok || !adminKey) return;
  if (!confirm("Eyða ÖLLU spjalli fyrir þennan leik? Þetta er ekki hægt að afturkalla.")) return;
  try{
    await fetch("/api/ynwa/comments?event="+encodeURIComponent(lastData.eventId)+"&key="+encodeURIComponent(adminKey), { method:"DELETE" });
  } catch(e){ /* best effort */ }
  await loadComments();
}

async function postComment(){
  if (!composer || !lastData || !lastData.ok) return;
  var textEl = document.getElementById("c-text");
  var text = textEl ? textEl.value : "";
  if (!text || !text.trim()) return;
  var name = (document.getElementById("c-name")||{}).value || "";
  var email = (document.getElementById("c-email")||{}).value || "";
  var website = (document.getElementById("hp-x")||{}).value || "";
  var renderedAt = (document.getElementById("ra-x")||{}).value || "";
  rememberIdentity(name, email);
  var ok = false;
  try{
    var res = await fetch("/api/ynwa/comments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: lastData.eventId, eventId: composer.eventId,
        parentId: composer.parentId, name: name, email: email, text: text,
        website: website, renderedAt: renderedAt }),
    });
    var j = await res.json();
    ok = !!(j && j.ok);
  } catch(e){ /* best effort */ }
  // Close the composer only on a confirmed success — if it was rejected
  // (rate limit, bot check, dropped connection) keep it open with what
  // they wrote still in it, so nothing is lost.
  if (ok) composer = null;
  await loadComments();
}

document.addEventListener("change", function(e){
  if (e.target.classList && e.target.classList.contains("botCheckbox")){
    var btn = document.getElementById("send-x");
    if (btn) btn.disabled = !e.target.checked;
  }
});

// Opens the single composer aimed at a target, then scrolls to it — the
// point of moving comments out of the feed was that clicking 💬 on a
// moment should take you to the conversation, not grow the feed.
function openComposer(eventId, parentId){
  composer = { eventId: eventId != null ? String(eventId) : null,
               parentId: parentId != null ? String(parentId) : null };
  if (!chatOpen){ chatOpen = true; try { localStorage.setItem("ynwa:chat","on"); } catch(e){} syncChatBtn(); }
  reRenderAll();
  var box = document.getElementById("composerBox");
  if (box && box.scrollIntoView) box.scrollIntoView({ behavior:"smooth", block:"center" });
  var ta = document.getElementById("c-text");
  if (ta) ta.focus();
}

document.addEventListener("click", function(e){
  var t = e.target;
  if (t.dataset.commentOn){
    openComposer(t.dataset.commentOn, null);
  } else if (t.dataset.openComposer){
    openComposer(null, null);
  } else if (t.dataset.reply){
    openComposer(null, t.dataset.reply);
  } else if (t.dataset.cancelComposer){
    composer = null;
    reRenderAll();
  } else if (t.dataset.send){
    postComment();
  } else if (t.dataset.deleteComment){
    deleteComment(t.dataset.deleteComment);
  } else if (t.dataset.deleteAll){
    deleteAllComments();
  }
});

async function load(){
  try{
    const r = await fetch(api, { cache:"no-store" });
    render(await r.json());
    loadComments();
  } catch(e){
    document.getElementById("status").textContent = "tenging brást — reyni aftur";
    clearTimeout(timer); timer = setTimeout(load, 15000);
  }
}

document.getElementById("toggleEn").addEventListener("click", function(){
  document.body.classList.toggle("show-en");
  this.classList.toggle("on");
  this.textContent = document.body.classList.contains("show-en")
    ? "Fela enska textann" : "Sýna enska textann";
});
function syncChatBtn(){
  var b = document.getElementById("toggleChat");
  if (!b) return;
  b.classList.toggle("on", chatOpen);
  b.textContent = chatOpen ? "Fela spjall" : "Spjall";
}
document.getElementById("toggleChat").addEventListener("click", function(){
  chatOpen = !chatOpen;
  try { localStorage.setItem("ynwa:chat", chatOpen ? "on" : "off"); } catch(e){}
  syncChatBtn();
  renderChat();
});
document.getElementById("showAll").addEventListener("click", function(){
  showAllEvents = !showAllEvents;
  renderFeed();
});
syncChatBtn();

document.getElementById("refresh").addEventListener("click", load);
load();
</script>
</body>
</html>`;

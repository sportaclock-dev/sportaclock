import React, {
  useState, useEffect, useMemo, useRef, useSyncExternalStore,
} from "react";

/* ============================================================
   SPORTACLOCK — Ready. Tick. Kick.
   ⚽ Football (Iceland · Premier League · Champions League)
   🏎 Formula 1  ·  🏈 NFL

   Design note: the kickoff time is the whole point of the site,
   so every row is built like a departure board — the local start
   time gets its own column in big mono type, and the amber
   countdown is the only thing that ticks. Fixed facts read white,
   moving numbers read amber.

   All start times are stored in UTC and converted in the browser.
   ============================================================ */

/* ------------------------------------------------------------
   PALETTE
   "sline" — graphite and aluminium with the red used only as a
   small mark, the way Audi badges an S line: monochrome body,
   one sharp accent. "classic" is the original navy / green /
   amber, kept intact. Change this one word to switch.
   ------------------------------------------------------------ */
const THEME = "sline"; // "sline" | "classic"

/* ---------- FORMULA 1 2026 — every session of every round ---------- */
const F1_STAGE = {
  "Practice 1": "Practice", "Practice 2": "Practice", "Practice 3": "Practice",
  "Sprint Qualifying": "Sprint", "Sprint": "Sprint",
  "Qualifying": "Qualifying", "Race": "Race",
};
const F1_DUR = { // minutes, incl. a small buffer
  "Practice 1": 75, "Practice 2": 75, "Practice 3": 75,
  "Sprint Qualifying": 60, "Sprint": 60, "Qualifying": 75, "Race": 165,
};
const W = (round, name, venue, city, sessions, note = "") =>
  sessions.map(([t, kind]) => ({
    t,
    title: `${name} — ${kind}`,
    venue, city,
    tag: kind,
    stage: F1_STAGE[kind],
    dur: F1_DUR[kind],
    sub: [`Round ${round}`, note].filter(Boolean).join(" · "),
  }));

const F1_RACES = [
  ...W(9, "British GP", "Silverstone Circuit", "United Kingdom", [
    ["2026-07-03T10:30:00Z", "Practice 1"], ["2026-07-03T14:30:00Z", "Sprint Qualifying"],
    ["2026-07-04T10:00:00Z", "Sprint"], ["2026-07-04T14:00:00Z", "Qualifying"],
    ["2026-07-05T14:00:00Z", "Race"],
  ], "Sprint weekend"),
  ...W(10, "Belgian GP", "Spa-Francorchamps", "Belgium", [
    ["2026-07-17T11:30:00Z", "Practice 1"], ["2026-07-17T15:00:00Z", "Practice 2"],
    ["2026-07-18T10:30:00Z", "Practice 3"], ["2026-07-18T14:00:00Z", "Qualifying"],
    ["2026-07-19T13:00:00Z", "Race"],
  ]),
  ...W(11, "Hungarian GP", "Hungaroring", "Budapest", [
    ["2026-07-24T11:30:00Z", "Practice 1"], ["2026-07-24T15:00:00Z", "Practice 2"],
    ["2026-07-25T10:30:00Z", "Practice 3"], ["2026-07-25T14:00:00Z", "Qualifying"],
    ["2026-07-26T13:00:00Z", "Race"],
  ], "Last round before the summer break"),
  ...W(12, "Dutch GP", "Circuit Zandvoort", "Netherlands", [
    ["2026-08-21T10:30:00Z", "Practice 1"], ["2026-08-21T14:30:00Z", "Sprint Qualifying"],
    ["2026-08-22T10:00:00Z", "Sprint"], ["2026-08-22T14:00:00Z", "Qualifying"],
    ["2026-08-23T13:00:00Z", "Race"],
  ], "Sprint weekend · Zandvoort's final year"),
  ...W(13, "Italian GP", "Autodromo Nazionale Monza", "Monza", [
    ["2026-09-04T10:30:00Z", "Practice 1"], ["2026-09-04T14:00:00Z", "Practice 2"],
    ["2026-09-05T10:30:00Z", "Practice 3"], ["2026-09-05T14:00:00Z", "Qualifying"],
    ["2026-09-06T13:00:00Z", "Race"],
  ]),
  ...W(14, "Spanish GP", "Madring", "Madrid", [
    ["2026-09-11T11:30:00Z", "Practice 1"], ["2026-09-11T15:00:00Z", "Practice 2"],
    ["2026-09-12T10:30:00Z", "Practice 3"], ["2026-09-12T14:00:00Z", "Qualifying"],
    ["2026-09-13T13:00:00Z", "Race"],
  ], "Madrid's debut race"),
  ...W(15, "Azerbaijan GP", "Baku City Circuit", "Baku", [
    ["2026-09-24T08:30:00Z", "Practice 1"], ["2026-09-24T12:00:00Z", "Practice 2"],
    ["2026-09-25T08:30:00Z", "Practice 3"], ["2026-09-25T12:00:00Z", "Qualifying"],
    ["2026-09-26T11:00:00Z", "Race"],
  ], "Thu–Sat schedule, Saturday race"),
  ...W(16, "Singapore GP", "Marina Bay Street Circuit", "Singapore", [
    ["2026-10-09T09:30:00Z", "Practice 1"], ["2026-10-09T13:30:00Z", "Sprint Qualifying"],
    ["2026-10-10T09:30:00Z", "Sprint"], ["2026-10-10T13:00:00Z", "Qualifying"],
    ["2026-10-11T12:00:00Z", "Race"],
  ], "Sprint weekend · night race"),
  ...W(17, "United States GP", "Circuit of the Americas", "Austin", [
    ["2026-10-23T17:30:00Z", "Practice 1"], ["2026-10-23T21:00:00Z", "Practice 2"],
    ["2026-10-24T17:30:00Z", "Practice 3"], ["2026-10-24T21:00:00Z", "Qualifying"],
    ["2026-10-25T19:00:00Z", "Race"],
  ]),
  ...W(18, "Mexico City GP", "Autódromo Hermanos Rodríguez", "Mexico City", [
    ["2026-10-30T18:30:00Z", "Practice 1"], ["2026-10-30T22:00:00Z", "Practice 2"],
    ["2026-10-31T17:30:00Z", "Practice 3"], ["2026-10-31T21:00:00Z", "Qualifying"],
    ["2026-11-01T20:00:00Z", "Race"],
  ]),
  ...W(19, "São Paulo GP", "Interlagos", "São Paulo", [
    ["2026-11-06T14:30:00Z", "Practice 1"], ["2026-11-06T18:00:00Z", "Practice 2"],
    ["2026-11-07T14:30:00Z", "Practice 3"], ["2026-11-07T18:00:00Z", "Qualifying"],
    ["2026-11-08T17:00:00Z", "Race"],
  ]),
  ...W(20, "Las Vegas GP", "Las Vegas Strip Circuit", "Las Vegas", [
    ["2026-11-20T00:30:00Z", "Practice 1"], ["2026-11-20T04:00:00Z", "Practice 2"],
    ["2026-11-21T00:30:00Z", "Practice 3"], ["2026-11-21T04:00:00Z", "Qualifying"],
    ["2026-11-22T04:00:00Z", "Race"],
  ], "Saturday night race, local time"),
  ...W(21, "Qatar GP", "Lusail International Circuit", "Lusail", [
    ["2026-11-27T13:30:00Z", "Practice 1"], ["2026-11-27T17:00:00Z", "Practice 2"],
    ["2026-11-28T13:30:00Z", "Practice 3"], ["2026-11-28T17:00:00Z", "Qualifying"],
    ["2026-11-29T16:00:00Z", "Race"],
  ]),
  ...W(22, "Abu Dhabi GP", "Yas Marina Circuit", "Abu Dhabi", [
    ["2026-12-04T09:30:00Z", "Practice 1"], ["2026-12-04T13:00:00Z", "Practice 2"],
    ["2026-12-05T10:30:00Z", "Practice 3"], ["2026-12-05T14:00:00Z", "Qualifying"],
    ["2026-12-06T13:00:00Z", "Race"],
  ], "Season finale"),
];

/* ---------- NFL 2026 — fallback list if /api/nfl is unreachable ---------- */
const NF = (t, title, venue, city, tag = "Regular season", sub = "") =>
  ({ t, title, venue, city, tag, sub, stage: tag });

const NFL_EVENTS = [
  NF("2026-08-07T00:00:00Z", "Panthers vs Cardinals", "Tom Benson HOF Stadium", "Canton", "Preseason", "Hall of Fame Game — preseason begins"),
  NF("2026-09-10T00:20:00Z", "Seahawks vs Patriots", "Lumen Field", "Seattle", "Regular season", "NFL Kickoff Game — Super Bowl LX rematch"),
  NF("2026-09-13T02:30:00Z", "Rams vs 49ers", "Melbourne", "Australia", "Regular season", "First-ever NFL game in Australia (kickoff time provisional)"),
  NF("2026-09-14T00:20:00Z", "Giants vs Cowboys", "MetLife Stadium", "East Rutherford", "Regular season", "Sunday Night Football — Week 1"),
  NF("2026-09-15T00:15:00Z", "Chiefs vs Broncos", "Arrowhead Stadium", "Kansas City", "Regular season", "Monday Night Football — Week 1"),
  NF("2026-10-26T00:20:00Z", "Seahawks vs Chiefs", "Lumen Field", "Seattle", "Regular season", "Kenneth Walker III returns to Seattle — SNF"),
  NF("2026-11-26T18:00:00Z", "Lions vs Bears", "Ford Field", "Detroit", "Regular season", "Thanksgiving Day — early game"),
  NF("2026-11-26T21:30:00Z", "Cowboys vs Eagles", "AT&T Stadium", "Arlington", "Regular season", "Thanksgiving Day — afternoon game"),
  NF("2026-11-27T01:20:00Z", "Bills vs Chiefs", "Highmark Stadium", "Orchard Park", "Regular season", "Thanksgiving night — Allen vs Mahomes"),
  NF("2026-12-25T18:00:00Z", "Packers vs Bears", "Christmas tripleheader", "kickoff time TBC", "Regular season", "Christmas Day game 1"),
  NF("2026-12-25T21:30:00Z", "Bills vs Broncos", "Christmas tripleheader", "kickoff time TBC", "Regular season", "Christmas Day game 2"),
  NF("2026-12-26T01:15:00Z", "Rams vs Seahawks", "Christmas tripleheader", "kickoff time TBC", "Regular season", "Christmas Day game 3"),
  NF("2027-01-10T18:00:00Z", "Week 18 — final Sunday", "League-wide", "all division games", "Regular season", "Regular season ends today"),
  NF("2027-01-16T18:00:00Z", "Wild Card weekend begins", "League-wide", "", "Playoffs", "The road to the Super Bowl starts here"),
  NF("2027-02-14T23:30:00Z", "Super Bowl LXI", "SoFi Stadium", "Inglewood", "Super Bowl", "Valentine's Day Super Bowl"),
];

/* ---------- SPORT CONFIG ---------- */
const SPORTS = {
  football: {
    icon: "⚽", label: "Football",
    eyebrow: "Football · pick your competition",
    nextLabel: "Next kickoff", clockLabel: "to kickoff",
    durationMin: 135,
    stages: ["All"],
  },
  f1: {
    icon: "🏎", label: "F1",
    eyebrow: "Formula 1 2026 · 22 rounds · every session",
    nextLabel: "Next on track", clockLabel: "to lights out",
    durationMin: 165,
    stages: ["All", "Race", "Qualifying", "Sprint", "Practice"],
    replays: [
      { name: "F1 TV", url: "https://f1tv.formula1.com" },
      { name: "Sky Sports F1 (UK)", url: "https://www.skysports.com/watch/sky-sports-f1" },
    ],
  },
  nfl: {
    icon: "🏈", label: "NFL",
    eyebrow: "NFL 2026 · 107th season · every game",
    nextLabel: "Next kickoff", clockLabel: "to kickoff",
    durationMin: 210,
    stages: ["All", "Preseason", "Regular season", "Playoffs", "Super Bowl"],
    replays: [
      { name: "NFL Game Pass (DAZN)", url: "https://www.dazn.com/en-IS/l/nfl-game-pass" },
      { name: "NFL+", url: "https://www.nfl.com/plus/" },
    ],
  },
  golf: {
    icon: "⛳", label: "Golf",
    eyebrow: "PGA Tour · tee times for the players you follow",
    nextLabel: "Next off the tee", clockLabel: "to tee off",
    durationMin: 300, // roughly a round on the course
    stages: ["All"], // replaced at runtime by the rounds actually published
    replays: [
      { name: "Sky Sports Golf (UK)", url: "https://www.skysports.com/golf" },
      { name: "PGA Tour", url: "https://www.pgatour.com" },
    ],
  },
};

// Static schedules. Football is entirely API-driven, so it has no entry here.
const STATIC_EVENTS = { f1: F1_RACES, nfl: NFL_EVENTS };

/* ---------- FOOTBALL LEAGUES (inside the ⚽ tab) ---------- */
const LEAGUES = {
  pl: {
    label: "Premier League", comp: "PL",
    eyebrow: "Premier League 2026\u201327 \u00b7 every match, live schedule",
    stages: ["All"],
  },
  cl: {
    label: "Champions League", comp: "CL",
    eyebrow: "UEFA Champions League 2026\u201327 \u00b7 live schedule",
    stages: ["All", "League Phase", "Playoffs", "R16", "QF", "SF", "Final"],
  },
  is: {
    label: "Iceland", comp: "IS",
    eyebrow: "Besta deildin 2026 \u00b7 Iceland's top flight \u00b7 live schedule",
    stages: ["All"],
  },
};

/* The owner's teams sit first in the crest bar; everyone else alphabetical.
   Matched as a substring, so "Liverpool FC" and "Philadelphia Eagles" both hit. */
const PINNED_TEAM = { pl: "Liverpool", cl: "Liverpool", nfl: "Eagles" };

/* ------------------------------------------------------------
   GOLF WATCHLIST
   ESPN has no working golf rankings endpoint (/pga/rankings
   500s, /golf/rankings 404s, /pga/standings comes back empty),
   so the top 10 is maintained here by hand. It barely moves
   week to week — edit the list and redeploy.

   Your two are listed first and stay pinned to the top of each
   day, the same way Liverpool and the Eagles do.
   Names are matched loosely: accents are stripped and any
   substring counts, so "Ludvig Aberg" still finds "Ludvig Åberg".
   ------------------------------------------------------------ */
const GOLF_PINNED = ["Rory McIlroy", "Scottie Scheffler"];

/* How many of the world top N to follow. */
const GOLF_TOP_N = 10;

/* Fallback only — used when OWGR can't be reached. Correct as of the week of
   26 July 2026, straight from the ranking. The live list from /api/golf takes
   precedence whenever it's available, so this rarely gets used. */
const GOLF_TOP10_FALLBACK = [
  "Scottie Scheffler",
  "Rory McIlroy",
  "Cameron Young",
  "Matt Fitzpatrick",
  "Russell Henley",
  "Tommy Fleetwood",
  "Chris Gotterup",
  "Collin Morikawa",
  "Wyndham Clark",
  "Sam Burns",
];

/* Your two, then the world top N — live from OWGR when we have it, the
   built-in list when we don't. */
function buildWatchlist(rankings) {
  const top = (rankings || []).slice(0, GOLF_TOP_N).map((r) => r.player);
  return [...new Set([...GOLF_PINNED, ...(top.length ? top : GOLF_TOP10_FALLBACK)])];
}

// strip accents so "Åberg" and "Aberg" compare equal
const norm = (str) =>
  String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/* Three sources disagree about spelling: your hand-written pinned list
   ("McIlroy"), OWGR ("Cameron Young") and ESPN ("Cam Young"). One rule for
   all of them — exact, then substring either way, then surname plus first
   initial, which is what rescues Cam against Cameron. */
const nameKey = (str) => {
  const parts = norm(str).split(/\s+/).filter(Boolean);
  return parts.length ? `${parts[parts.length - 1]}|${parts[0][0]}` : "";
};

function samePlayer(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  return nameKey(a) === nameKey(b);
}

const onList = (player, list) => list.some((n) => samePlayer(player, n));

/* Round 1 and 2 tee times are drawn at random — harmless.
   Rounds 3 and 4 are ordered by score, so a late Sunday time
   tells you someone is in contention. That's a spoiler on a
   spoiler-free site, so the weekend stays behind an opt-in. */
const WEEKEND_ROUNDS = [3, 4];

const golfVisible = (ev, scope, showWeekend, watchlist) => {
  if (!showWeekend && WEEKEND_ROUNDS.includes(ev.round)) return false;
  if (scope === "field") return true;
  return onList(ev.player, scope === "mine" ? GOLF_PINNED : watchlist);
};

/* rankings arrive sorted, so the first match is the best-ranked one */
function findRank(player, rankings) {
  const hit = (rankings || []).find((r) => samePlayer(player, r.player));
  return hit ? hit.rank : null;
}

const ordinal = (n) => {
  if (!n) return "";
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
};

// football-data.org stage codes → friendly Champions League labels
const CL_STAGE = {
  LEAGUE_STAGE: "League Phase",
  PLAYOFFS: "Playoffs",
  LAST_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  FINAL: "Final",
};

const LEAGUE_REPLAYS = {
  pl: [
    { name: "Sky Sports (UK)", url: "https://www.skysports.com/premier-league" },
    { name: "Peacock (US)", url: "https://www.peacocktv.com/sports/premier-league" },
  ],
  cl: [
    { name: "TNT Sports (UK)", url: "https://www.tntsports.co.uk/football/champions-league" },
    { name: "Paramount+ (US)", url: "https://www.paramountplus.com" },
  ],
  is: [
    { name: "Vodafone Sport (IS)", url: "https://www.vodafone.is/sjonvarp/sport/" },
    { name: "RÚV dagskrá (IS)", url: "https://www.ruv.is/sjonvarp/dagskra/ruv" },
  ],
};

/* ============================================================
   STATUS HANDLING
   Statuses come from football-data.org, TheSportsDB, and ESPN.
   Anything we don't recognise falls through to the clock, so a
   fixture can never vanish from both tabs the way it used to.
   ============================================================ */
const LIVE_STATUS = new Set(["IN_PLAY", "PAUSED"]);
const DONE_STATUS = new Set(["FINISHED", "AWARDED"]);
const OFF_STATUS = new Set(["POSTPONED", "SUSPENDED", "CANCELLED"]);

function classify(ev, now) {
  const st = ev.apiStatus;
  if (st) {
    if (LIVE_STATUS.has(st)) return "live";
    if (DONE_STATUS.has(st)) return "finished";
    if (OFF_STATUS.has(st)) return "off";
  }
  if (now >= ev.kickoff + ev.durationMs) return "finished";
  if (now >= ev.kickoff) return "live";
  return "upcoming";
}

const OFF_LABEL = { POSTPONED: "Postponed", SUSPENDED: "Suspended", CANCELLED: "Cancelled" };

/* ============================================================
   CLOCKS
   One interval per cadence for the whole page. Only components
   that subscribe re-render, so the 272-game NFL list doesn't
   redraw every second just because a countdown moved.
   Rows more than a day out ride the slow clock — seconds are
   meaningless at that range anyway.
   ============================================================ */
function makeClock(interval) {
  const listeners = new Set();
  let value = Date.now();
  let id = null;
  const tick = () => { value = Date.now(); listeners.forEach((fn) => fn()); };
  return {
    subscribe(fn) {
      listeners.add(fn);
      if (id === null) id = setInterval(tick, interval);
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0 && id !== null) { clearInterval(id); id = null; }
      };
    },
    snapshot: () => value,
    resync: tick,
  };
}

const CLOCKS = { fast: makeClock(1000), slow: makeClock(30000) };

// Browsers throttle timers in hidden tabs, so catch up the instant we're back.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { CLOCKS.fast.resync(); CLOCKS.slow.resync(); }
  });
}

function useTick(kind) {
  const clock = CLOCKS[kind];
  return useSyncExternalStore(clock.subscribe, clock.snapshot, clock.snapshot);
}

/* ---------- helpers ---------- */
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, "0");

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtWeekdayShort = (ts) =>
  new Date(ts).toLocaleDateString([], { weekday: "short" });
const fmtDateHeading = (ts) =>
  new Date(ts).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Events that land between 23:00 and 07:00 local time — the ones you sleep through.
function isNightOwl(ts) {
  const h = new Date(ts).getHours();
  return h >= 23 || h < 7;
}

function spokenCountdown(ms) {
  const { d, h, m } = parts(ms);
  if (d > 0) return `${d} days ${h} hours away`;
  if (h > 0) return `${h} hours ${m} minutes away`;
  return `${m} minutes away`;
}

/* ---------- components ---------- */

function EventName({ ev, className = "ev-name" }) {
  const sep = <span className="ev-vs">vs</span>;
  if (ev.home) {
    return <span className={className}>{ev.home} {sep} {ev.away}</span>;
  }
  const [a, b] = String(ev.title || "").split(" vs ");
  return <span className={className}>{a}{b && <> {sep} {b}</>}</span>;
}

/* Row countdowns run to the minute, never the second. Only the hero ticks
   once a second, so a 300-row tee sheet costs almost nothing: every row here
   rides the 30-second clock instead. */
const Countdown = React.memo(function Countdown({ to }) {
  const now = useTick("slow");
  const ms = Math.max(0, to - now);
  const { d, h, m } = parts(ms);
  return (
    <span className="cd" aria-label={spokenCountdown(ms)}>
      {d > 0 ? <>{d}<i>d</i>{" "}{pad(h)}<i>h</i></>
        : h > 0 ? <>{pad(h)}<i>h</i>{" "}{pad(m)}<i>m</i></>
        : ms >= 60000 ? <>{m}<i>m</i></>
        : <i>under a minute</i>}
    </span>
  );
});

// Big hero countdown.
function HeroClock({ to }) {
  const now = useTick("fast");
  const ms = Math.max(0, to - now);
  const { d, h, m, s } = parts(ms);
  const cells = d > 0
    ? [[d, "days"], [h, "hrs"], [m, "min"], [s, "sec"]]
    : [[h, "hrs"], [m, "min"], [s, "sec"]];
  return (
    <div className="hero-clock" role="timer" aria-label={spokenCountdown(ms)}>
      {cells.map(([v, label], i) => (
        <React.Fragment key={label}>
          {i > 0 && <div className="hero-colon" aria-hidden="true">:</div>}
          <div className="hero-cell">
            <div className="hero-num">{pad(v)}</div>
            <div className="hero-unit">{label}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// How long a live event has been running. Minutes only, so it rides the
// 30-second clock. This is wall-clock time since the start — deliberately not
// dressed up as a match minute, which stoppages and half-time would break.
function Elapsed({ from }) {
  const now = useTick("slow");
  const ms = Math.max(0, now - from);
  const { d, h, m } = parts(ms);
  if (d > 0) return null; // a stale "live" status; the number would be nonsense
  return (
    <span className="elapsed">
      started {h > 0 ? `${h}h ${pad(m)}m` : `${m} min`} ago
    </span>
  );
}

function StagePill({ ev }) {
  if (!ev.tag) return null;
  return <span className="pill">{ev.tag}</span>;
}

/* A clickable departure-board row — used for the golf drill-down.
   role/tabIndex/keydown so it works from the keyboard too, not just a mouse. */
function TapRow({ className = "", onOpen, label, children }) {
  return (
    <article
      className={`row row--tap ${className}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
    >
      {children}
      <span className="row-go" aria-hidden="true">›</span>
    </article>
  );
}

/* The departure-board row. Memoised so the parent can re-render freely. */
const EventRow = React.memo(function EventRow({ ev, clockLabel, off }) {
  const owl = !off && isNightOwl(ev.kickoff);
  return (
    <article className={`row${owl ? " row--owl" : ""}${off ? " row--off" : ""}` +
      `${ev.mine ? " row--mine" : ""}`}>
      <div className="row-time">
        {off ? (
          // The old kickoff time no longer means anything — don't imply it does.
          <>
            <span className="row-hhmm row-hhmm--tbd">--:--</span>
            <span className="row-dow">tbd</span>
          </>
        ) : (
          <>
            <time dateTime={ev.t} className="row-hhmm">{fmtTime(ev.kickoff)}</time>
            <span className="row-dow">{fmtWeekdayShort(ev.kickoff)}</span>
          </>
        )}
      </div>

      <div className="row-main">
        <div className="row-meta">
          {ev.rank && <span className="rank" title={`World number ${ev.rank}`}>#{ev.rank}</span>}
          <StagePill ev={ev} />
          {owl && <span className="owl">🌙 night owl</span>}
        </div>
        <EventName ev={ev} />
        {(ev.venue || ev.city) && (
          <div className="row-where">
            {[ev.venue, ev.city].filter(Boolean).join(" · ")}
          </div>
        )}
        {off
          ? <div className="row-sub">Was set for {fmtDateHeading(ev.kickoff)}</div>
          : ev.sub && <div className="row-sub">{ev.sub}</div>}
      </div>

      <div className="row-clock">
        {off ? (
          <span className="off-badge">{OFF_LABEL[ev.apiStatus] || "Rescheduled"}</span>
        ) : (
          <>
            <Countdown to={ev.kickoff} />
            <span className="row-clock-label">{clockLabel}</span>
          </>
        )}
      </div>
    </article>
  );
});

/* ============================================================
   EVENT BUILDING
   Pure function, so the same code can build the list on screen
   and scan every other competition to find the soonest event.
   ============================================================ */
function buildEvents(sport, league, football, nflApi, golfApi) {
  const mins = (n) => n * 60000;

  if (sport === "football") {
    const src = football[league];
    if (!src || !src.enabled) return [];
    return (src.matches || [])
      .filter((m) => m.home && m.away)
      .map((m) => {
        const stageLbl = league === "cl"
          ? (CL_STAGE[m.stage] || "League Phase")
          : "Regular season";
        const tag = league === "cl"
          ? (stageLbl === "League Phase" && m.matchday
            ? `League Phase · MD${m.matchday}` : stageLbl)
          : (m.matchday ? `Matchday ${m.matchday}` : LEAGUES[league].label);
        return {
          id: `${league}-${m.utcDate}-${m.home}-${m.away}`,
          t: m.utcDate,
          kickoff: new Date(m.utcDate).getTime(),
          durationMs: mins(SPORTS.football.durationMin),
          home: m.home, away: m.away,
          homeCrest: m.homeCrest, awayCrest: m.awayCrest,
          venue: "", city: "",
          tag, stage: stageLbl, sub: "",
          apiStatus: m.status || undefined,
        };
      })
      .sort((a, b) => a.kickoff - b.kickoff);
  }

  // Golf's unit is one player's tee time on one day, which drops straight
  // onto the same departure board as everything else.
  if (sport === "golf") {
    if (!golfApi || !golfApi.enabled) return [];
    const t = golfApi.tournament || {};
    const ranks = golfApi.rankings || [];
    return (golfApi.teeTimes || [])
      .filter((x) => x.teeTime && x.player)
      .map((x) => ({
        id: `golf-${x.id}`,
        t: x.teeTime,
        kickoff: new Date(x.teeTime).getTime(),
        durationMs: mins(SPORTS.golf.durationMin),
        title: x.player,
        player: x.player,
        round: x.round,
        venue: t.course || "",
        city: t.where || t.city || "",
        tag: x.round ? `Round ${x.round}` : "Tee time",
        stage: x.round ? `Round ${x.round}` : "Tee time",
        sub: x.startHole ? `${ordinal(x.startHole)} tee` : "",
        mine: onList(x.player, GOLF_PINNED),
        rank: findRank(x.player, ranks),
      }))
      .sort((a, b) => a.kickoff - b.kickoff);
  }

  if (sport === "nfl" && nflApi.enabled) {
    return nflApi.events
      .map((e) => ({
        id: `nfl-${e.id}`,
        t: e.date,
        kickoff: new Date(e.date).getTime(),
        durationMs: mins(SPORTS.nfl.durationMin),
        home: e.home, away: e.away,
        homeCrest: e.homeLogo, awayCrest: e.awayLogo,
        venue: e.venue, city: e.city,
        tag: e.tag, stage: e.tag, sub: e.label,
        apiStatus: e.state === "in" ? "IN_PLAY"
          : e.state === "post" ? "FINISHED" : undefined,
      }))
      .sort((a, b) => a.kickoff - b.kickoff);
  }

  return (STATIC_EVENTS[sport] || [])
    .map((m, i) => ({
      ...m,
      id: `${sport}-${i}-${m.t}`,
      kickoff: new Date(m.t).getTime(),
      durationMs: mins(m.dur || SPORTS[sport].durationMin),
    }))
    .sort((a, b) => a.kickoff - b.kickoff);
}

/* What each sport puts forward when the site decides where to open.

   Golf competes as a ROUND, not as 147 separate tee times. Once the first
   group is out, the round stops being "upcoming" — so a golfer teeing off at
   17:13 on a Thursday afternoon can no longer outrank a football match at
   19:00 that evening. The next thing golf offers is tomorrow's first tee.

   Golf only enters the running at all if someone on your watchlist is in the
   field, and weekend rounds sit out because they're shielded by default —
   opening on a round you've chosen not to see would be odd. */
function landingCandidates(sport, league, football, nflApi, golfApi, watchlist) {
  const evs = buildEvents(sport, league, football, nflApi, golfApi);
  if (sport !== "golf") return evs;
  if (!evs.some((ev) => onList(ev.player, watchlist))) return [];

  const firstOfRound = new Map();
  for (const ev of evs) {
    if (!ev.round || WEEKEND_ROUNDS.includes(ev.round)) continue;
    const held = firstOfRound.get(ev.round);
    if (!held || ev.kickoff < held.kickoff) firstOfRound.set(ev.round, ev);
  }
  return [...firstOfRound.values()];
}

// Every competition the auto-jump considers, in tie-break order.
const ALL_VIEWS = [
  ["football", "pl"], ["football", "cl"], ["football", "is"],
  ["f1", null], ["nfl", null], ["golf", null],
];

/* ============================================================ */

export default function App() {
  const [sport, setSport] = useState("football");
  const [league, setLeague] = useState("pl");
  const [tab, setTab] = useState("upcoming");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("All");
  const [teamFilter, setTeamFilter] = useState(null);
  const [revealYT, setRevealYT] = useState(false);
  const [jumped, setJumped] = useState(null);

  const [football, setFootball] = useState({
    pl: { enabled: false, matches: [] },
    cl: { enabled: false, matches: [] },
    is: { enabled: false, matches: [] },
  });
  const [nflApi, setNflApi] = useState({ enabled: false, events: [] });
  const [golfApi, setGolfApi] = useState({
    enabled: false, teeTimes: [], tournament: null,
    rankings: [], rankingsWeek: null, schedule: [],
  });
  const [golfScope, setGolfScope] = useState("watchlist"); // mine | watchlist | field
  // Live top N when OWGR answered, the built-in list when it didn't.
  const golfWatchlist = useMemo(
    () => buildWatchlist(golfApi.rankings), [golfApi.rankings],
  );
  const ranksAreLive = (golfApi.rankings || []).length > 0;
  // null = tournament overview, a number = that round's tee sheet, "all" = every round
  const [golfRound, setGolfRound] = useState(null);
  const [showWeekend, setShowWeekend] = useState(false);
  const [loaded, setLoaded] = useState({ football: false, nfl: false, golf: false });
  const [autoDone, setAutoDone] = useState(false);
  const pinned = useRef(false); // set once the visitor picks something themselves

  /* ---- live fixture data (scores already stripped server-side) ---- */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (const [key, cfg] of Object.entries(LEAGUES)) {
        try {
          const r = await fetch(`/api/football/${cfg.comp}`);
          const data = await r.json();
          if (!alive || !data.enabled) continue;
          setFootball((prev) => ({
            ...prev, [key]: { enabled: true, matches: data.matches },
          }));
        } catch { /* the page keeps working with whatever it already has */ }
      }
      if (alive) setLoaded((p) => (p.football ? p : { ...p, football: true }));
    };
    load();
    const id = setInterval(load, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/nfl");
        const data = await r.json();
        if (alive && data.enabled && data.events?.length) {
          setNflApi({ enabled: true, events: data.events });
        }
      } catch { /* fallback schedule takes over */ }
      if (alive) setLoaded((p) => (p.nfl ? p : { ...p, nfl: true }));
    };
    load();
    const id = setInterval(load, 60 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/golf");
        const data = await r.json();
        // Between tournaments there are no tee times yet, but the payload still
        // carries the next tournament, its venue and the rest of the season.
        // Requiring teeTimes here used to blank the whole tab for days.
        if (alive && data.enabled) {
          setGolfApi({
            enabled: true,
            teeTimes: data.teeTimes || [],
            tournament: data.tournament || null,
            rankings: data.rankings || [],
            rankingsWeek: data.rankingsWeek || null,
            schedule: data.schedule || [],
          });
        }
      } catch { /* golf tab shows an empty state */ }
      if (alive) setLoaded((p) => (p.golf ? p : { ...p, golf: true }));
    };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Never wait on a slow feed for more than four seconds before deciding.
  useEffect(() => {
    const id = setTimeout(
      () => setLoaded({ football: true, nfl: true, golf: true }), 4000);
    return () => clearTimeout(id);
  }, []);

  /* ---- open on whatever happens next, across every sport ---- */
  useEffect(() => {
    if (autoDone || pinned.current) return;
    if (!loaded.football || !loaded.nfl || !loaded.golf) return;

    const now = Date.now();
    let bestLive = null, bestNext = null;
    for (const [s, l] of ALL_VIEWS) {
      for (const ev of landingCandidates(s, l, football, nflApi, golfApi, golfWatchlist)) {
        const kind = classify(ev, now);
        if (kind === "live" && (!bestLive || ev.kickoff < bestLive.ev.kickoff)) {
          bestLive = { s, l, ev };
        }
        if (kind === "upcoming" && (!bestNext || ev.kickoff < bestNext.ev.kickoff)) {
          bestNext = { s, l, ev };
        }
      }
    }

    setAutoDone(true);
    // Soonest kickoff wins. A live event only takes over when nothing at all
    // is upcoming — otherwise a live Friday practice session would beat a
    // match kicking off in ten minutes.
    const pick = bestNext || bestLive;
    if (!pick) return;
    if (pick.s !== sport || (pick.l && pick.l !== league)) {
      setSport(pick.s);
      if (pick.l) setLeague(pick.l);
      setStage("All");
    }
    setJumped(
      pick.s === "golf"
        ? [golfApi.tournament?.name || "the next tournament",
           pick.ev.round ? `Round ${pick.ev.round}` : null].filter(Boolean).join(" — ")
        : pick.ev.home ? `${pick.ev.home} vs ${pick.ev.away}` : pick.ev.title,
    );
  }, [loaded, football, nflApi, golfApi, golfWatchlist, autoDone, sport, league]);

  const cfg = SPORTS[sport];
  const leagueCfg = sport === "football" ? LEAGUES[league] : null;
  const golfTourn = golfApi.tournament;
  const stages = useMemo(() => {
    if (sport !== "golf") return leagueCfg ? leagueCfg.stages : cfg.stages;
    return ["All"]; // golf gets dedicated round chips inside the tee sheet
  }, [sport, leagueCfg, cfg]);

  /* Everything else on the calendar. ESPN publishes a field only during
     tournament week, so these rows carry dates and venue but no tee times —
     they fill in on their own a few days out. */
  const laterTournaments = useMemo(() => {
    if (sport !== "golf") return [];
    return (golfApi.schedule || [])
      .filter((t) => t.id !== golfApi.tournament?.id && t.start)
      .map((t) => ({ ...t, startMs: Date.parse(t.start), endMs: Date.parse(t.end) }))
      .filter((t) => Number.isFinite(t.startMs))
      .sort((a, b) => a.startMs - b.startMs);
  }, [sport, golfApi]);

  // which of your two are actually in this week's field
  const golfPinnedIn = useMemo(() => {
    if (sport !== "golf" || !golfApi.enabled) return [];
    return GOLF_PINNED.filter((n) =>
      golfApi.teeTimes.some((t) => samePlayer(t.player, n)));
  }, [sport, golfApi]);

  const fieldPublished = (golfTourn?.fieldSize || 0) > 0;
  const weekendAvailable = (golfTourn?.roundsPublished || [])
    .some((r) => WEEKEND_ROUNDS.includes(r));
  const eyebrow = leagueCfg ? leagueCfg.eyebrow : cfg.eyebrow;
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const events = useMemo(
    () => buildEvents(sport, league, football, nflApi, golfApi),
    [sport, league, football, nflApi, golfApi],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (sport === "golf") {
        if (!golfVisible(ev, golfScope, showWeekend, golfWatchlist)) return false;
        if (typeof golfRound === "number" && ev.round !== golfRound) return false;
      }
      if (stage !== "All" && ev.stage !== stage) return false;
      if (teamFilter && ev.home !== teamFilter && ev.away !== teamFilter) return false;
      if (!q) return true;
      return [ev.home, ev.away, ev.title, ev.player, ev.sub, ev.venue, ev.city]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [events, query, stage, teamFilter, sport, golfScope, showWeekend, golfRound,
      golfWatchlist]);

  /* ---- re-bucket exactly when something starts or ends, not every second ---- */
  const [boundary, setBoundary] = useState(() => Date.now());
  useEffect(() => {
    const now = Date.now();
    let next = Infinity;
    for (const ev of events) {
      if (ev.kickoff > now && ev.kickoff < next) next = ev.kickoff;
      const done = ev.kickoff + ev.durationMs;
      if (done > now && done < next) next = done;
    }
    const delay = Math.min(Number.isFinite(next) ? next - now + 500 : 60000, 60000);
    const id = setTimeout(() => setBoundary(Date.now()), Math.max(delay, 1000));
    return () => clearTimeout(id);
  }, [events, boundary]);

  /* One entry per published round: when the first and last groups go out, and
     how many are in it. Deliberately NOT scope-filtered — the overview should
     describe the actual tee sheet, not your watchlist. */
  const golfRounds = useMemo(() => {
    if (sport !== "golf") return [];
    const byRound = new Map();
    for (const ev of events) {
      if (!ev.round) continue;
      if (!showWeekend && WEEKEND_ROUNDS.includes(ev.round)) continue;
      if (!byRound.has(ev.round)) byRound.set(ev.round, []);
      byRound.get(ev.round).push(ev);
    }
    return [...byRound.entries()]
      .map(([round, list]) => {
        list.sort((a, b) => a.kickoff - b.kickoff);
        const first = list[0].kickoff;
        const last = list[list.length - 1].kickoff;
        // the last group needs about five hours to get round
        const closes = last + 5 * 3600000;
        return {
          round, first, last,
          count: list.length,
          mine: list.filter((e) => e.mine).length,
          state: boundary < first ? "upcoming" : boundary < closes ? "underway" : "done",
        };
      })
      .sort((a, b) => a.round - b.round);
  }, [sport, events, showWeekend, boundary]);

  /* Two different ideas, which were conflated and mislabelled a round already
     in progress as "next up":
       focusRound  — what deserves the accent rail: the round under way if
                     there is one, otherwise the next to start.
       nextToStart — the earliest round that hasn't begun. This is the only
                     one that gets a "next up" label. */
  const focusRound = useMemo(
    () => golfRounds.find((r) => r.state === "underway")
      || golfRounds.find((r) => r.state === "upcoming")
      || golfRounds[golfRounds.length - 1] || null,
    [golfRounds],
  );
  const nextToStart = useMemo(
    () => golfRounds.find((r) => r.state === "upcoming") || null,
    [golfRounds],
  );

  const buckets = useMemo(() => {
    const live = [], upcoming = [], finished = [], off = [];
    for (const ev of filtered) {
      const kind = classify(ev, boundary);
      if (kind === "live") live.push(ev);
      else if (kind === "upcoming") upcoming.push(ev);
      else if (kind === "off") off.push(ev);
      else finished.push(ev);
    }
    finished.sort((a, b) => b.kickoff - a.kickoff);
    off.sort((a, b) => a.kickoff - b.kickoff);
    // Postponed and suspended fixtures used to fall through every filter and
    // vanish from both tabs. They now get their own block, because their old
    // kickoff date is meaningless and would otherwise head up the schedule.
    return { live, upcoming, finished, off };
  }, [filtered, boundary]);

  const nextEvent = buckets.upcoming[0];
  const comingUpCount = buckets.upcoming.length + buckets.off.length;

  const days = useMemo(() => {
    const out = [];
    let key = null;
    for (const ev of buckets.upcoming) {
      const k = dateKey(ev.kickoff);
      if (k !== key) { key = k; out.push({ key: k, ts: ev.kickoff, items: [] }); }
      out[out.length - 1].items.push(ev);
    }
    return out;
  }, [buckets.upcoming]);

  /* ---- clickable crest bar, wherever crests are available ---- */
  const teamBar = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      if (ev.home && ev.homeCrest && !map.has(ev.home)) map.set(ev.home, ev.homeCrest);
      if (ev.away && ev.awayCrest && !map.has(ev.away)) map.set(ev.away, ev.awayCrest);
    }
    if (map.size < 2 || map.size > 40) return [];
    const teams = [...map.entries()]
      .map(([name, crest]) => ({ name, crest }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const pin = sport === "football" ? PINNED_TEAM[league] : PINNED_TEAM[sport];
    if (pin) {
      const i = teams.findIndex((t) => t.name.includes(pin));
      if (i > 0) teams.unshift(...teams.splice(i, 1));
      if (i >= 0) teams[0].mine = true;
    }
    return teams;
  }, [events, sport, league]);

  const replays = sport === "football"
    ? (LEAGUE_REPLAYS[league] || [])
    : (cfg.replays || []);

  /* Whether the visitor has actually narrowed anything. Without this the empty
     state blamed a filter that wasn't set — which is what "Nothing matches
     that filter" was doing on a league with no upcoming fixtures. */
  const filtersActive = Boolean(query.trim()) || Boolean(teamFilter)
    || stage !== "All" || (sport === "golf" && golfScope !== "watchlist");

  const clearFilters = () => {
    setStage("All"); setQuery(""); setTeamFilter(null);
    setGolfScope("watchlist");
  };
  const openGolfRound = (r) => setGolfRound(r);
  const switchSport = (s) => {
    pinned.current = true; setJumped(null); setSport(s); setGolfRound(null); clearFilters();
  };
  const switchLeague = (l) => { pinned.current = true; setJumped(null); setLeague(l); clearFilters(); };

  const ytQuery = (ev) => {
    const matchup = ev.home ? `${ev.home} vs ${ev.away}` : ev.title;
    const context = sport === "football"
      ? (league === "pl" ? "premier league" : league === "cl" ? "champions league" : "besta deildin")
      : sport === "nfl" ? "NFL 2026"
      : sport === "golf" ? `${golfTourn?.name || "PGA Tour"} 2026` : "F1 2026";
    return `https://www.youtube.com/results?search_query=${
      encodeURIComponent(`${matchup} ${context} highlights`)}`;
  };

  // true while the golf tab is showing the round list rather than a tee sheet
  const golfOverview = sport === "golf" && golfRound === null && tab === "upcoming";

  const feedLive = sport === "football"
    ? !!football[league]?.enabled
    : sport === "nfl" ? nflApi.enabled
    : sport === "golf" ? golfApi.enabled : false;

  return (
    <div className={`page theme-${THEME}`}>
      <Styles />
      <div className="wrap">

        {/* ---------- header ---------- */}
        <header className="head">
          <p className="eyebrow"><span className="mark" aria-hidden="true" />{eyebrow}</p>
          <h1 className="logo">SPORTACLOCK</h1>
          <p className="tagline">
            <span>Ready.</span> <span className="t-tick">Tick.</span> <span className="t-kick">Kick.</span>
          </p>
          <p className="lede">
            Every start counted down in your time, plus a spoiler-free catch-up
            for the ones you slept through.
          </p>
          <p className="tzline">
            Times shown in {tz}
            {feedLive && <span className="feed"> · live schedule</span>}
          </p>
        </header>

        {/* ---------- navigation ---------- */}
        <div className="nav">
          <nav className="sports" aria-label="Sport">
            {Object.entries(SPORTS).map(([id, s]) => (
              <button
                key={id}
                className={`sport${sport === id ? " is-on" : ""}`}
                aria-pressed={sport === id}
                onClick={() => switchSport(id)}
              >
                <span aria-hidden="true">{s.icon}</span> {s.label}
              </button>
            ))}
          </nav>

          {sport === "football" && (
            <div className="chips" role="group" aria-label="Competition">
              {Object.entries(LEAGUES).map(([id, l]) => (
                <button
                  key={id}
                  className={`chip${league === id ? " is-on" : ""}`}
                  aria-pressed={league === id}
                  onClick={() => switchLeague(id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {jumped && (
          <p className="jumped">
            Opened on the next event anywhere on the site — <strong>{jumped}</strong>.
          </p>
        )}

        {/* ---------- golf: tournament header (always) ---------- */}
        {sport === "golf" && golfTourn && (
          <section className={`tourn${golfRound !== null ? " tourn--slim" : ""}`}
                   aria-label="Tournament">
            {golfRound !== null && (
              <button className="back" onClick={() => setGolfRound(null)}>
                ‹ All rounds
              </button>
            )}
            <p className="tourn-eyebrow">
              {golfTourn.state === "in"
                ? `On the course now${golfTourn.currentRound ? ` · Round ${golfTourn.currentRound}` : ""}`
                : golfTourn.state === "post" ? "Finished"
                : golfTourn.detail || "Starts soon"}
            </p>
            <h2 className="tourn-name">{golfTourn.name}</h2>
            {golfTourn.course && <p className="tourn-course">{golfTourn.course}</p>}
            {golfTourn.where && <p className="tourn-where">{golfTourn.where}</p>}
            {golfRound === null && (
              <>
                {fieldPublished ? (
                  <p className="tourn-field">
                    {golfTourn.fieldSize} in the field
                    {golfTourn.roundsPublished?.length > 0 && (
                      <> · tee times out for round{golfTourn.roundsPublished.length > 1 ? "s" : ""}{" "}
                        {golfTourn.roundsPublished.join(" and ")}</>
                    )}
                  </p>
                ) : (
                  <div className="tourn-wait">
                    <div>
                      <p className="tourn-field">
                        The field is announced a few days before play, and tee times
                        appear here as soon as it is.
                      </p>
                    </div>
                    {golfTourn.start && (
                      <div className="row-clock">
                        <Countdown to={Date.parse(golfTourn.start)} />
                        <span className="row-clock-label">to first round</span>
                      </div>
                    )}
                  </div>
                )}
                {!fieldPublished ? null
                  : golfPinnedIn.length === GOLF_PINNED.length ? (
                  <p className="tourn-yes">
                    Both {GOLF_PINNED.map((n) => n.split(" ").pop()).join(" and ")} are playing.
                  </p>
                ) : golfPinnedIn.length > 0 ? (
                  <p className="tourn-yes">
                    {golfPinnedIn.map((n) => n.split(" ").pop()).join(" and ")} is playing.{" "}
                    {GOLF_PINNED.filter((n) => !golfPinnedIn.includes(n))
                      .map((n) => n.split(" ").pop()).join(" and ")} is not.
                  </p>
                ) : (
                  <p className="tourn-no">
                    Neither {GOLF_PINNED.map((n) => n.split(" ").pop()).join(" nor ")} is in
                    this field — your watchlist is shown instead.
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {/* The weekend shield belongs here, not in the filters — it decides which
            rounds exist at all, so it has to be reachable from the overview. */}
        {sport === "golf" && golfApi.enabled && golfRounds.length > 0 && (
          weekendAvailable ? (
            <label className="toggle toggle--weekend">
              <input
                type="checkbox"
                checked={showWeekend}
                onChange={(e) => setShowWeekend(e.target.checked)}
              />
              <span>
                Show rounds 3 and 4 — weekend tee times are ordered by score, so a late
                Sunday slot hints at who's in contention
              </span>
            </label>
          ) : (
            <p className="filternote filternote--golf">
              Rounds 3 and 4 aren't drawn yet — those tee times are set after the cut.
            </p>
          )
        )}

        {/* ---------- golf overview: a row per round, tap to open ---------- */}
        {sport === "golf" && golfRound === null && tab === "upcoming" && (
          <section aria-label="Rounds">
            {golfRounds.length === 0 && !golfTourn && (
              <div className="empty">
                No tournaments on the calendar right now — the tab fills back in
                when the tour returns.
              </div>
            )}
            {golfRounds.map((r) => (
              <TapRow
                key={r.round}
                className={`${focusRound?.round === r.round ? "row--mine" : ""}` +
                  `${r.state === "done" ? " row--off" : ""}`}
                label={`Round ${r.round} tee times`}
                onOpen={() => setGolfRound(r.round)}
              >
                <div className="row-time">
                  <time dateTime={new Date(r.first).toISOString()} className="row-hhmm">
                    {fmtTime(r.first)}
                  </time>
                  <span className="row-dow">{fmtWeekdayShort(r.first)}</span>
                </div>
                <div className="row-main">
                  <div className="row-meta">
                    <span className="pill">Round {r.round}</span>
                    {nextToStart?.round === r.round && (
                      <span className="owl">next up</span>
                    )}
                    {r.state === "underway" && (
                      <span className="owl">in progress</span>
                    )}
                  </div>
                  <span className="ev-name">{fmtDateHeading(r.first)}</span>
                  <div className="row-where">
                    {r.count} tee times · first off {fmtTime(r.first)}, last {fmtTime(r.last)}
                  </div>
                  {r.mine > 0 && (
                    <div className="row-sub">
                      {GOLF_PINNED.map((n) => n.split(" ").pop()).join(" and ")} out this round
                    </div>
                  )}
                </div>
                <div className="row-clock">
                  {r.state === "upcoming" ? (
                    <>
                      <Countdown to={r.first} />
                      <span className="row-clock-label">to first tee</span>
                    </>
                  ) : r.state === "underway" ? (
                    <>
                      <span className="livetag">● Under way</span>
                      <span className="row-clock-label">since {fmtTime(r.first)}</span>
                    </>
                  ) : (
                    <>
                      <span className="done">Finished</span>
                      <span className="row-clock-label">
                        {fmtTime(r.first)}–{fmtTime(r.last)}
                      </span>
                    </>
                  )}
                </div>
              </TapRow>
            ))}
            {golfRounds.length > 0 && (
              <button className="link seeall" onClick={() => setGolfRound("all")}>
                Or see every round in one list
              </button>
            )}

            {laterTournaments.length > 0 && (
              <div className="day later">
                <h3 className="dayhead">Later this season</h3>
                {laterTournaments.map((t) => (
                  <article key={t.id} className="row row--sched">
                    <div className="row-time">
                      <time dateTime={t.start} className="row-hhmm row-hhmm--date">
                        {new Date(t.startMs).toLocaleDateString([],
                          { day: "numeric", month: "short" })}
                      </time>
                      <span className="row-dow">{fmtWeekdayShort(t.startMs)}</span>
                    </div>
                    <div className="row-main">
                      <span className="ev-name">{t.name}</span>
                      {t.course && <div className="row-where">{t.course}</div>}
                      {t.where && <div className="row-place">{t.where}</div>}
                      {!t.course && !t.where && (
                        <div className="row-sub">Venue confirmed nearer the week</div>
                      )}
                    </div>
                    <div className="row-clock">
                      <Countdown to={t.startMs} />
                      <span className="row-clock-label">to first round</span>
                    </div>
                  </article>
                ))}
                <p className="filternote">
                  Tee times appear here automatically once the field is published,
                  usually two or three days before play starts.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ---------- hero: the next event ---------- */}
        {tab === "upcoming" && nextEvent && !golfOverview && (
          <section className="hero" aria-label={cfg.nextLabel}>
            <p className="hero-eyebrow">{cfg.nextLabel}</p>
            <h2 className="hero-name"><EventName ev={nextEvent} className="hero-ev" /></h2>
            <p className="hero-meta">
              {nextEvent.rank && (
                <span className="rank" title={`World number ${nextEvent.rank}`}>
                  #{nextEvent.rank}
                </span>
              )}
              <StagePill ev={nextEvent} />
              {(nextEvent.venue || nextEvent.city) && (
                <span>{[nextEvent.venue, nextEvent.city].filter(Boolean).join(" · ")}</span>
              )}
            </p>

            {/* the site's whole point: when it starts, where you are */}
            <div className="hero-when">
              <time dateTime={nextEvent.t} className="hero-hhmm">{fmtTime(nextEvent.kickoff)}</time>
              <span className="hero-date">{fmtDateHeading(nextEvent.kickoff)}</span>
              {isNightOwl(nextEvent.kickoff) && <span className="owl">🌙 night owl</span>}
            </div>

            <HeroClock to={nextEvent.kickoff} />
            {nextEvent.sub && <p className="hero-sub">{nextEvent.sub}</p>}
          </section>
        )}

        {/* ---------- live now ---------- */}
        {buckets.live.length > 0 && (
          <section className="livewrap" aria-label="Live now">
            {buckets.live.map((ev) => (
              <article key={ev.id} className="row row--live">
                <div className="row-time">
                  <time dateTime={ev.t} className="row-hhmm">{fmtTime(ev.kickoff)}</time>
                  <span className="row-dow">started</span>
                </div>
                <div className="row-main">
                  <div className="row-meta">
                    <StagePill ev={ev} />
                  </div>
                  <EventName ev={ev} />
                  {(ev.venue || ev.city) && (
                    <div className="row-where">
                      {[ev.venue, ev.city].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <div className="row-clock">
                  <span className="livetag">● Live</span>
                  <Elapsed from={ev.kickoff} />
                </div>
              </article>
            ))}
          </section>
        )}

        {/* ---------- tabs ---------- */}
        <nav className="tabs" aria-label="View">
          <button
            className={`tab${tab === "upcoming" ? " is-on" : ""}`}
            aria-pressed={tab === "upcoming"}
            onClick={() => setTab("upcoming")}
          >
            Coming up <span className="count">{comingUpCount}</span>
          </button>
          <button
            className={`tab${tab === "catchup" ? " is-on" : ""}`}
            aria-pressed={tab === "catchup"}
            onClick={() => setTab("catchup")}
          >
            🛡 Catch up <span className="count">{buckets.finished.length}</span>
          </button>
        </nav>

        {/* ---------- filters ---------- */}
        <div className="filters" hidden={golfOverview}>
          <input
            className="search"
            type="search"
            aria-label="Filter events"
            placeholder={sport === "football"
              ? "Filter by team…"
              : "Filter by event, venue, or city…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {sport === "golf" && golfApi.enabled && golfRounds.length > 0 && (
            <div className="chips" role="group" aria-label="Round">
              <button
                className={`chip${golfRound === "all" ? " is-on" : ""}`}
                aria-pressed={golfRound === "all"}
                onClick={() => setGolfRound("all")}
              >
                All rounds
              </button>
              {golfRounds.map((r) => (
                <button
                  key={r.round}
                  className={`chip${golfRound === r.round ? " is-on" : ""}`}
                  aria-pressed={golfRound === r.round}
                  onClick={() => setGolfRound(r.round)}
                >
                  Round {r.round}
                </button>
              ))}
            </div>
          )}
          {sport === "golf" && golfApi.enabled && (
            <>
              <div className="chips" role="group" aria-label="Which players">
                {[
                  ["mine", GOLF_PINNED.map((n) => n.split(" ").pop()).join(" & ")],
                  ["watchlist", `Top ${GOLF_TOP_N}`],
                  ["field", "Whole field"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`chip${golfScope === id ? " is-on" : ""}`}
                    aria-pressed={golfScope === id}
                    onClick={() => setGolfScope(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="filternote">
                {ranksAreLive
                  ? <>World ranking live from OWGR{golfApi.rankingsWeek
                      ? `, week ending ${fmtDateHeading(Date.parse(golfApi.rankingsWeek))}` : ""}.</>
                  : <>World ranking unavailable right now — using the built-in list, which
                      may be out of date.</>}
              </p>
            </>
          )}
          {stages.length > 1 && (
            <div className="chips" role="group" aria-label="Stage">
              {stages.map((s) => (
                <button
                  key={s}
                  className={`chip${stage === s ? " is-on" : ""}`}
                  aria-pressed={stage === s}
                  onClick={() => setStage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {teamBar.length > 0 && (
            <div className="crests" role="group" aria-label="Filter by team">
              {teamBar.map((t) => {
                const on = teamFilter === t.name;
                return (
                  <button
                    key={t.name}
                    className={`crest${t.mine ? " crest--mine" : ""}${on ? " is-on" : ""}${teamFilter && !on ? " is-off" : ""}`}
                    aria-pressed={on}
                    title={t.mine ? `${t.name} — your club` : t.name}
                    onClick={() => setTeamFilter(on ? null : t.name)}
                  >
                    <img src={t.crest} alt={t.name} loading="lazy" width="26" height="26" />
                  </button>
                );
              })}
            </div>
          )}
          {teamFilter && (
            <p className="filternote">
              Showing {teamFilter} only.{" "}
              <button className="link" onClick={() => setTeamFilter(null)}>Show everyone</button>
            </p>
          )}
        </div>

        {/* ---------- COMING UP ---------- */}
        {tab === "upcoming" && !golfOverview && (
          <section>
            {comingUpCount === 0 && (
              <div className="empty">
                {filtersActive
                  ? (sport === "golf" && golfScope === "mine"
                    ? "Neither of your two is in this field. Try the top 10 or the whole field."
                    : "Nothing matches that filter.")
                  : sport === "football" && !football[league]?.enabled
                  ? "This league's schedule hasn't loaded. It appears here as soon as the feed responds."
                  : events.length > 0
                  // the feed worked; there simply is nothing still to come
                  ? `Every ${sport === "football" ? "fixture" : "event"} we have for this competition has already been played. The schedule fills back in when the next round is published — until then, Catch up has them.`
                  : "Nothing scheduled here yet. This fills in as soon as the fixtures are published."}
                {filtersActive && (
                  <>
                    {" "}
                    <button className="link" onClick={clearFilters}>Clear filters</button>
                  </>
                )}
              </div>
            )}

            {buckets.off.length > 0 && (
              <div className="day">
                <h3 className="dayhead dayhead--off">Waiting on a new date</h3>
                {buckets.off.map((ev) => (
                  <EventRow key={ev.id} ev={ev} clockLabel={cfg.clockLabel} off />
                ))}
              </div>
            )}

            {days.map((day) => (
              <div key={day.key} className="day">
                <h3 className="dayhead">{fmtDateHeading(day.ts)}</h3>
                {day.items.map((ev) => (
                  <EventRow key={ev.id} ev={ev} clockLabel={cfg.clockLabel} />
                ))}
              </div>
            ))}
          </section>
        )}

        {/* ---------- CATCH UP ---------- */}
        {tab === "catchup" && (
          <section>
            <div className="shield">
              <p className="shield-title">🛡 Spoiler shield is on</p>
              <p className="shield-body">
                No results shown — only which events have finished. Scores are stripped
                on the server, so nothing that reaches this page can spoil a match.
                Replay availability depends on broadcast rights where you are.
              </p>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={revealYT}
                  onChange={(e) => setRevealYT(e.target.checked)}
                />
                <span>Show YouTube highlight links — thumbnails and titles can spoil results</span>
              </label>
            </div>

            {buckets.finished.length === 0 && (
              <div className="empty">Nothing to catch up on yet. Sleep easy. 🌙</div>
            )}

            {buckets.finished.map((ev) => (
              <article key={ev.id} className="row row--done">
                <div className="row-time">
                  <time dateTime={ev.t} className="row-hhmm">{fmtTime(ev.kickoff)}</time>
                  <span className="row-dow">{fmtWeekdayShort(ev.kickoff)}</span>
                </div>
                <div className="row-main">
                  <div className="row-meta">
                    <StagePill ev={ev} />
                    <span className="done">Finished · {fmtDateHeading(ev.kickoff)}</span>
                  </div>
                  <EventName ev={ev} />
                  <div className="replays">
                    {replays.map((l) => (
                      <a
                        key={l.name}
                        className="replay"
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ▶ Watch on {l.name}
                      </a>
                    ))}
                    {revealYT && (
                      <a
                        className="replay replay--warn"
                        href={ytQuery(ev)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ⚠ YouTube highlights
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        <footer className="foot">
          <p>
            <strong>Sportaclock</strong> — Ready. Tick. Kick. All times convert to your
            device's timezone automatically.
          </p>
          <p>
            <strong>Football:</strong> Premier League and Champions League fixtures come from
            football-data.org, Besta deildin from TheSportsDB. Scores are stripped
            server-side and schedules refresh every 15 minutes, so rescheduled games stay
            current. Postponed fixtures stay listed with a badge rather than vanishing.
          </p>
          <p>
            <strong>F1:</strong> the 2026 FIA calendar with every session — practice, sprint
            qualifying, sprint, qualifying and race. Session times for later rounds follow the
            standard weekend format and are provisional until confirmed.
          </p>
          <p>
            <strong>Golf:</strong> PGA Tour tee times from ESPN, refreshed every ten
            minutes, with world rankings from the Official World Golf Ranking (cached
            twelve hours, since it only moves on Sundays). Rounds 1 and 2 are drawn before play starts; rounds 3 and 4 are
            ordered by score after the cut, so they sit behind an opt-in — a late Sunday
            tee time would otherwise tell you who is leading. Scores, positions and
            round totals never leave the server.
          </p>
          <p>
            <strong>NFL:</strong> the full 272-game schedule loads from ESPN through our own
            server, scores stripped, refreshed hourly so flexed games stay accurate. If the
            feed is unavailable a built-in marquee schedule takes over.
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   STYLES
   A real stylesheet rather than inline objects: no style objects
   rebuilt on every render, and hover / focus / media queries work.

   Colour roles, so a theme swap touches nothing but the two
   blocks at the top:
     --accent   the mark. Used sparingly and never for large areas.
     --metal    fixed instrument readings — the kickoff times.
     --clock    the numbers that move — the countdowns.
     --live     in progress, and only that.
   ============================================================ */
function Styles() {
  return (
    <style>{`
/* graphite body, aluminium readouts, one red mark */
.theme-sline {
  --bg:#0C0D10; --panel:#14161A; --panel-2:#0F1114;
  --line:#23262C; --line-2:#33373F;
  --text:#F2F3F5; --muted:#A0A6AF; --dim:#767D87; --faint:#464C55;
  --accent:#E10A24; --accent-soft:#F08A96; --accent-wash:rgba(225,10,36,0.08);
  --accent-glow:rgba(225,10,36,0.10);
  --metal:#C9CED6; --clock:#F2F3F5; --live:#FF3B4A;
  --on-accent:#FFFFFF;
}
/* the original navy, green and amber */
.theme-classic {
  --bg:#0B1220; --panel:#121C2E; --panel-2:#0E1626;
  --line:#1E2B42; --line-2:#2A3A57;
  --text:#E8EDF4; --muted:#9FB0C6; --dim:#7C8BA1; --faint:#3A4A63;
  --accent:#2F9E68; --accent-soft:#8FB89F; --accent-wash:rgba(47,158,104,0.10);
  --accent-glow:rgba(255,209,102,0.10);
  --metal:#E8EDF4; --clock:#FFD166; --live:#E25C5C;
  --on-accent:#0B1220;
}

:root {
  --mono:'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --sans:'Archivo', system-ui, -apple-system, sans-serif;
}
* { box-sizing:border-box }
.page {
  min-height:100vh; background:var(--bg); color:var(--text);
  font-family:var(--sans);
  background-image:radial-gradient(ellipse 70% 38% at 50% -6%, var(--accent-glow), transparent 72%);
}
.wrap { max-width:880px; margin:0 auto; padding:0 16px 80px }
p { margin:0 }
button { font-family:inherit; cursor:pointer }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px }

/* ---------- header ---------- */
.head { padding:34px 0 18px; border-bottom:1px solid var(--line-2) }
.eyebrow {
  display:flex; align-items:center;
  font-size:0.68rem; letter-spacing:0.26em; text-transform:uppercase;
  color:var(--muted); font-weight:700;
}
/* the badge: the one place the accent appears at full strength up top */
.mark {
  flex:none; width:20px; height:3px; background:var(--accent);
  margin-right:10px; border-radius:1px;
}
.logo {
  font-weight:900; font-size:clamp(1.9rem,7vw,3rem); margin:10px 0 4px;
  letter-spacing:-0.025em;
}
.tagline { font-weight:700; font-size:1rem; letter-spacing:0.06em; margin-bottom:8px }
.t-tick { color:var(--accent); font-family:var(--mono) }
.t-kick { color:var(--metal) }
.lede { color:var(--dim); font-size:0.85rem; max-width:52ch; line-height:1.55 }
.tzline { color:var(--faint); font-size:0.72rem; margin-top:8px }
.feed { color:var(--accent-soft) }

/* ---------- sticky nav ---------- */
.nav {
  position:sticky; top:0; z-index:20;
  padding:12px 0 10px; background:color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter:blur(10px); border-bottom:1px solid var(--line);
}
@supports not (background:color-mix(in srgb, red 50%, transparent)) {
  .nav { background:var(--bg) }
}
.sports { display:flex; gap:8px }
.sport {
  flex:1; padding:11px 6px; border-radius:7px; white-space:nowrap;
  background:transparent; border:1px solid var(--line); color:var(--dim);
  font-weight:700; font-size:0.82rem; letter-spacing:0.04em;
  transition:border-color .16s, color .16s, background .16s;
}
.sport:hover { color:var(--text); border-color:var(--line-2) }
.sport.is-on {
  background:var(--panel); border-color:var(--line-2); color:var(--text);
  box-shadow:inset 0 -2px 0 var(--accent);
}
.chips { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none }
.chips::-webkit-scrollbar { display:none }
.nav .chips { margin-top:8px }
.chip {
  padding:5px 12px; border-radius:20px; font-size:0.72rem; font-weight:600;
  white-space:nowrap; background:transparent;
  border:1px solid var(--line); color:var(--dim);
  transition:border-color .16s, color .16s, background .16s;
}
.chip:hover { color:var(--text) }
.chip.is-on { background:var(--accent-wash); border-color:var(--accent); color:var(--text) }

.jumped {
  margin-top:12px; font-size:0.74rem; color:var(--dim);
  border-left:2px solid var(--accent); padding-left:10px;
}
.jumped strong { color:var(--text); font-weight:600 }

/* ---------- hero ---------- */
.hero {
  margin-top:16px; padding:26px 18px 22px; text-align:center;
  background:var(--panel); border:1px solid var(--line-2); border-radius:12px;
}
.hero-eyebrow {
  font-size:0.65rem; letter-spacing:0.24em; text-transform:uppercase;
  color:var(--dim); margin-bottom:12px;
}
.hero-name { margin:0 0 8px }
.hero-ev { font-weight:700; font-size:clamp(1.2rem,5vw,1.75rem) }
.hero-meta {
  display:flex; gap:10px; align-items:center; justify-content:center;
  flex-wrap:wrap; color:var(--muted); font-size:0.85rem;
}
/* the signature: kickoff time as an instrument readout */
.hero-when {
  display:inline-flex; align-items:baseline; gap:12px; flex-wrap:wrap;
  justify-content:center; margin:18px 0 4px; padding:11px 20px;
  background:var(--panel-2); border:1px solid var(--line);
  border-left:3px solid var(--accent); border-radius:7px;
}
.hero-hhmm {
  font-family:var(--mono); font-weight:600; font-variant-numeric:tabular-nums;
  font-size:clamp(1.85rem,7vw,2.55rem); line-height:1; letter-spacing:0.01em;
  color:var(--metal);
}
.hero-date { color:var(--muted); font-size:0.85rem; font-weight:600 }
.hero-clock { display:flex; gap:14px; align-items:flex-end; justify-content:center; margin-top:16px }
.hero-cell { text-align:center }
.hero-num {
  font-family:var(--mono); font-variant-numeric:tabular-nums; font-weight:600;
  font-size:clamp(2.1rem,8.5vw,3.9rem); line-height:1; color:var(--clock);
  letter-spacing:0.02em;
}
.hero-unit {
  font-size:0.6rem; letter-spacing:0.15em; color:var(--dim);
  text-transform:uppercase; margin-top:7px;
}
.hero-colon {
  color:var(--accent); font-weight:600; font-family:var(--mono);
  font-size:clamp(1.5rem,6vw,2.8rem); padding-bottom:20px;
  animation:blink 1s steps(1) infinite;
}
.hero-sub { color:var(--accent-soft); font-size:0.82rem; margin-top:14px }

/* ---------- tabs ---------- */
.tabs { display:flex; gap:8px; margin:18px 0 14px }
.tab {
  flex:1; padding:12px 8px; border-radius:7px;
  background:transparent; border:1px solid var(--line); color:var(--dim);
  font-weight:700; font-size:0.85rem; letter-spacing:0.03em;
  transition:border-color .16s, color .16s, background .16s;
}
.tab:hover { color:var(--text) }
.tab.is-on {
  background:var(--panel); border-color:var(--line-2); color:var(--text);
  box-shadow:inset 0 -2px 0 var(--accent);
}
.count {
  display:inline-block; margin-left:6px; padding:1px 7px; border-radius:10px;
  background:var(--line); color:var(--muted); font-size:0.72rem;
  font-family:var(--mono); font-variant-numeric:tabular-nums;
}
.tab.is-on .count { background:var(--accent-wash); color:var(--text) }

/* ---------- filters ---------- */
.filters { display:flex; flex-direction:column; gap:10px; margin-bottom:18px }
.search {
  width:100%; padding:10px 12px; border-radius:7px;
  background:var(--panel-2); border:1px solid var(--line); color:var(--text);
  font-family:inherit; font-size:0.9rem; outline:none;
}
.search::placeholder { color:var(--faint) }
.search:focus { border-color:var(--line-2) }
.crests { display:flex; flex-wrap:wrap; gap:6px }
.crest {
  padding:5px; border-radius:7px; line-height:0;
  background:transparent; border:1px solid var(--line);
  transition:border-color .16s, opacity .16s;
}
.crest img { width:26px; height:26px; object-fit:contain; display:block }
.crest:hover { border-color:var(--line-2) }
/* your club, held at the front of the bar */
.crest--mine { border-bottom:2px solid var(--accent) }
.crest.is-on { background:var(--accent-wash); border-color:var(--accent) }
.crest.is-off { opacity:0.4 }
.filternote { font-size:0.74rem; color:var(--dim) }
.link {
  background:none; border:none; padding:0; color:var(--accent-soft);
  font-size:inherit; font-weight:600; text-decoration:underline;
}

/* ---------- day groups ---------- */
.day { margin-bottom:22px }
.dayhead {
  font-size:0.7rem; letter-spacing:0.2em; text-transform:uppercase;
  color:var(--muted); font-weight:700; margin:0 0 8px;
  border-bottom:1px solid var(--line); padding-bottom:6px;
}
.dayhead--off { color:var(--dim) }

/* ---------- the departure-board row ---------- */
.row {
  display:grid; grid-template-columns:78px 1fr auto;
  gap:16px; align-items:center;
  padding:13px 16px 13px 13px; margin-bottom:8px;
  background:var(--panel); border:1px solid var(--line);
  border-left:3px solid transparent; border-radius:9px;
  transition:border-color .16s, background .16s;
}
.row:hover {
  border-color:var(--line-2);
  background:var(--panel-2);
  background:color-mix(in srgb, var(--panel) 88%, var(--text));
}
.row--owl { border-left-color:var(--accent) }
.row--off { opacity:0.66 }
.row--live { border-color:var(--live); border-left-color:var(--live) }
.row--done { border-left-color:var(--line-2) }
/* one of your players — golf tee sheets stay chronological, so the rail
   is how you spot them rather than reordering the board */
.row--mine { border-left-color:var(--accent) }
/* a future tournament: informational, nothing to open yet */
.row--sched { border-left-color:var(--line) }
.row-hhmm--date { font-size:1.05rem; letter-spacing:0 }
.later { margin-top:26px }
.row--mine .ev-name { color:var(--text) }

.row-time { text-align:left }
.row-hhmm {
  display:block; font-family:var(--mono); font-weight:600;
  font-variant-numeric:tabular-nums; font-size:1.5rem; line-height:1.05;
  letter-spacing:0.01em; color:var(--metal);
}
.row-hhmm--tbd { color:var(--faint) }
.row-dow {
  display:block; font-size:0.6rem; letter-spacing:0.16em; text-transform:uppercase;
  color:var(--dim); margin-top:4px;
}
.row-main { min-width:0 }
.row-meta { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:4px }
.row-where { color:var(--muted); font-size:0.82rem; margin-top:3px }
.row-sub { color:var(--accent-soft); font-size:0.8rem; margin-top:3px }
/* a place name is context, not a highlight — quieter than the course above it */
.row-place { color:var(--dim); font-size:0.78rem; margin-top:2px }
.ev-name { font-weight:700; font-size:0.98rem }
.ev-vs { color:var(--faint); font-weight:500 }

.row-clock { display:flex; flex-direction:column; align-items:flex-end; flex-shrink:0; gap:3px }
.cd {
  font-family:var(--mono); font-variant-numeric:tabular-nums; font-weight:600;
  font-size:1rem; color:var(--clock); white-space:nowrap;
}
.cd i { color:var(--accent); font-style:normal; font-weight:500 }
.row-clock-label {
  font-size:0.58rem; letter-spacing:0.12em; text-transform:uppercase;
  color:var(--faint);
}
.off-badge {
  font-size:0.62rem; letter-spacing:0.12em; text-transform:uppercase;
  font-weight:700; color:var(--muted); border:1px solid var(--line-2);
  border-radius:4px; padding:3px 8px; white-space:nowrap;
}

.pill {
  font-size:0.62rem; letter-spacing:0.13em; text-transform:uppercase;
  color:var(--muted); border:1px solid var(--line-2); border-radius:3px;
  padding:2px 7px; white-space:nowrap;
}
.rank {
  font-family:var(--mono); font-size:0.62rem; font-weight:600;
  color:var(--accent); border:1px solid var(--accent); border-radius:3px;
  padding:2px 5px; white-space:nowrap; font-variant-numeric:tabular-nums;
}
.owl { font-size:0.62rem; letter-spacing:0.1em; color:var(--accent); text-transform:uppercase }
.done { font-size:0.62rem; letter-spacing:0.1em; color:var(--dim); text-transform:uppercase }

/* ---------- golf tournament banner ---------- */
.tourn {
  margin-top:16px; padding:16px 18px;
  background:var(--panel-2); border:1px solid var(--line);
  border-left:3px solid var(--accent); border-radius:9px;
}
.tourn-eyebrow {
  font-size:0.64rem; letter-spacing:0.2em; text-transform:uppercase;
  color:var(--accent-soft); font-weight:700; margin-bottom:6px;
}
.tourn-name { margin:0 0 4px; font-size:1.15rem; font-weight:700 }
.tourn-course { color:var(--text); font-size:0.9rem; font-weight:600; margin-top:2px }
.tourn-where { color:var(--muted); font-size:0.8rem; margin-top:3px }
.tourn-field { color:var(--dim); font-size:0.76rem; margin-top:4px }
.tourn-yes { color:var(--accent-soft); font-size:0.8rem; margin-top:8px; font-weight:600 }
.tourn-no { color:var(--muted); font-size:0.8rem; margin-top:8px; line-height:1.5 }
.tourn-wait {
  display:flex; gap:16px; align-items:center; justify-content:space-between;
  flex-wrap:wrap; margin-top:6px;
}
.tourn-wait .row-clock { align-items:flex-end }
.toggle--weekend {
  margin:12px 0 4px; padding:11px 14px; border-radius:9px;
  background:var(--panel); border:1px solid var(--line);
}
.filternote--golf { margin:12px 0 4px }
.tourn--slim { padding:13px 16px }
.back {
  background:none; border:none; padding:0 0 8px; color:var(--accent-soft);
  font-size:0.74rem; font-weight:700; letter-spacing:0.04em;
}
.back:hover { color:var(--text) }
.seeall { margin-top:4px; font-size:0.76rem }

/* tappable rows for the golf drill-down */
.row--tap { cursor:pointer; position:relative; padding-right:34px }
.row--tap:hover { border-color:var(--accent) }
.row-go {
  position:absolute; right:14px; top:50%; transform:translateY(-50%);
  color:var(--faint); font-size:1.3rem; line-height:1;
}
.row--tap:hover .row-go { color:var(--accent) }

/* ---------- live ---------- */
.livewrap { margin-top:16px }
.livetag {
  color:var(--live); font-weight:900; font-size:0.72rem; letter-spacing:0.18em;
  white-space:nowrap; animation:pulse 1.6s infinite;
}
.elapsed {
  font-family:var(--mono); font-size:0.72rem; color:var(--muted);
  font-variant-numeric:tabular-nums; white-space:nowrap;
}

/* ---------- catch up ---------- */
.shield {
  padding:15px 16px; margin-bottom:16px; border-radius:9px;
  background:var(--panel); border:1px solid var(--line);
  border-left:3px solid var(--accent);
}
.shield-title { font-weight:700; font-size:0.85rem; margin-bottom:5px }
.shield-body { color:var(--muted); font-size:0.78rem; line-height:1.6; max-width:64ch }
.toggle {
  display:flex; gap:8px; align-items:flex-start; margin-top:12px;
  font-size:0.74rem; color:var(--dim); cursor:pointer; line-height:1.45;
}
.toggle input { margin-top:2px; accent-color:var(--accent) }
.replays { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px }
.replay {
  font-size:0.74rem; font-weight:700; text-decoration:none; border-radius:5px;
  padding:7px 12px; color:var(--on-accent); background:var(--accent);
  border:1px solid var(--accent);
}
.replay:hover { filter:brightness(1.12) }
.replay--warn { color:var(--muted); background:transparent; border-color:var(--line-2) }

.empty {
  padding:20px 16px; text-align:center; color:var(--dim); font-size:0.86rem;
  line-height:1.55; background:var(--panel); border:1px solid var(--line);
  border-radius:9px;
}

/* ---------- footer ---------- */
.foot {
  margin-top:44px; padding-top:16px; border-top:1px solid var(--line);
  color:var(--faint); font-size:0.68rem; line-height:1.7;
  display:flex; flex-direction:column; gap:8px;
}
.foot strong { color:var(--dim) }

@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
@keyframes blink { 0%,49% { opacity:1 } 50%,100% { opacity:0.22 } }
::selection { background:var(--accent); color:var(--on-accent) }

/* ---------- mobile ---------- */
@media (max-width:560px) {
  .row { grid-template-columns:62px 1fr; row-gap:10px; padding:13px }
  .row--tap { padding-right:30px }
  .row-hhmm { font-size:1.3rem }
  .row-clock { grid-column:2; align-items:flex-start }
  .sport { font-size:0.76rem; padding:10px 4px }
  .hero-when { gap:8px; padding:10px 14px }
}
@media (prefers-reduced-motion:reduce) {
  * { animation:none !important; transition:none !important }
}
    `}</style>
  );
}

# Sportaclock

**Ready. Tick. Kick.** — [www.sportaclock.com](https://www.sportaclock.com)

Every football kickoff, F1 session and NFL game counted down in your own
timezone, plus a spoiler-free catch-up zone for the ones you slept through.

## What it covers

| Sport | Competitions | Source |
| --- | --- | --- |
| ⚽ Football | Premier League, Champions League | football-data.org |
| ⚽ Football | Besta deildin (Iceland) | TheSportsDB |
| 🏎 Formula 1 | All 22 rounds, every session | Built-in 2026 FIA calendar |
| ⛳ Golf | PGA Tour tee times, current tournament | ESPN (public endpoint) |
| ⛳ Golf | World rankings | OWGR (undocumented endpoint) |
| 🏈 NFL | Full 272-game season + playoffs | ESPN (public endpoint) |

## The spoiler shield

This is the core design constraint: **scores are stripped on the server, not in
the browser.** `footballHandler`, `tsdbEventToMatch` and `mapEvent` copy only
kickoff time, team names, crests, venue and status into the response. No score
field is ever forwarded, so no frontend bug — and no one poking at the network
tab — can spoil a result.

The catch-up tab shows only *which* events have finished, with links straight to
a replay. YouTube highlight links are behind an opt-in checkbox, because
thumbnails and video titles give results away.

## How it's put together

```
index.html        page shell, meta tags, fonts
src/main.jsx      React entry point
src/App.jsx       the entire UI, plus schedules for F1 and the NFL fallback
server.js         Express: static hosting + football API proxies and caching
nfl.js            Express handler for /api/nfl (ESPN, whole season in one call)
```

### API routes

| Route | Returns |
| --- | --- |
| `GET /api/football/PL` | Premier League fixtures (15 min cache) |
| `GET /api/football/CL` | Champions League fixtures (15 min cache) |
| `GET /api/football/IS` | Besta deildin fixtures (30 min background rebuild) |
| `GET /api/golf` | Current PGA tournament + tee sheet (10 min cache) |
| `GET /api/nfl` | Full NFL season (60 min cache) |

Every route answers `{ enabled: false, reason }` rather than an error status when
a feed is unavailable, and serves stale cache in preference to nothing. The
frontend degrades to an empty-state message or a built-in fallback schedule.

### Notes on golf

Golf works differently from the other sports: the unit is **one player's tee
time on one day**, not one fixture. That drops straight onto the same
departure board, so a tee sheet reuses all the existing countdown, grouping
and night-owl machinery.

The tab has two levels. The overview leads with the current tournament, then
one tappable row per round, then **Later this season** — the next tournaments
with their dates, venue and a countdown to the first round. Those rows aren't
tappable, because there is nothing to open until ESPN publishes the field.

The overview lists one tappable row per round —
day, tee window, field size, and a countdown to the first group. A round
already begun reads *in progress · since 11:00* instead of counting down;
the earliest round still to start is flagged *next up*. Tapping a round opens
its tee sheet, keeping the tournament name and course pinned above it. The
weekend shield sits at the overview level because it decides which rounds
exist at all.

#### Golf competes as a round, not as 147 golfers

`landingCandidates()` is what each sport puts forward when the site picks where
to open. Golf offers **the first tee time of each round**, not every player's.
Without that, a round under way would keep winning all afternoon: a watchlist
golfer teeing off at 17:13 would outrank a football match at 19:00, because
some tee time is always a few minutes away. Collapsing to round starts means
that once the first group is out, golf's next offer is tomorrow's first tee —
so the football wins, which is what you'd want.

Golf only enters the running if someone on your watchlist is in the field, and
weekend rounds sit out, since opening on a round the shield is hiding would be
strange.

What ESPN actually provides, confirmed by probing the live feed:

- `/pga/scoreboard` alone returns **one tournament**. Adding `?dates=YYYY`
  returns the whole season — 48 events — which is where the schedule comes
  from. Future events come back with **no competitors**: ESPN only publishes a
  field during tournament week, so the tab lists the next six tournaments and
  their tee times fill in on their own a few days out.
- Events carry `date` and `endDate`, **not** `startDate`. Looking for the
  latter is what made an earlier version think there were no dates at all.
- Courses live only on the **leaderboard** response, at `events[0].courses[0]`.
  The scoreboard has no venue data whatsoever, so the route fetches a
  leaderboard per tournament, in parallel, tolerating individual failures.
- Per-round tee times live at `competitors[].linescores[].{period, teeTime}`.
  `competitors[].status.teeTime` holds only the current round and is used as a
  fallback.
- **Rounds 1 and 2 are published together** before play starts. Rounds 3 and 4
  appear mid-tournament, once the cut sets the draw.
- Event objects carry **no `startDate`**, so every date is derived from the tee
  times themselves.
- The course is **not** at `competitions[0].venue`, which came back empty
  against the live feed. `placeOf()` therefore tries every plausible path —
  `competitions[0].venue`, `.course`, `.courses[0]`, `events[0].courses[0]` —
  and takes the first that yields a name or a city.
- ESPN carries **no world ranking at all**. Probing a competitor object gives
  `id, uid, movement, earnings, sortOrder, amateur, featured, status, score,
  linescores, statistics, athlete` and an athlete of `id, uid, guid,
  displayName, shortName, lastName, amateur, headshot, flag, links`. Nothing
  ranking-shaped. Its three ranking endpoints are also dead: `/pga/rankings`
  500s, `/golf/rankings` 404s, `/pga/standings` is empty. Hence OWGR.

#### World rankings, from OWGR

owgr.com is a Next.js app that calls its own backend, which is what the site
uses:

```
GET https://apiweb.owgr.com/api/owgr/rankings/getRankings
      ?regionId=0&pageSize=30&pageNumber=1&countryId=0&sortString=Rank+ASC
```

Entries carry `rank`, a nested `player` object, `lastWeekRank`,
`endLastYearRank` and a pile of points maths. Only `rank`, the flattened
player name, `lastWeek` and a derived `movement` are forwarded.

This is **not a published API** — it's internal plumbing that can change or be
withdrawn, and the site sits behind Akamai, which may challenge a server-side
request. So the whole thing is optional by construction: `fetchRankings()` has
its own 12-hour cache (the ranking only moves on Sundays) and its own
try/catch, and a failure there is logged and swallowed. Tee times still ship,
the frontend falls back to `GOLF_TOP10_FALLBACK`, and the page says plainly
that the ranking is unavailable. Rankings can never take the golf tab down.

#### Where it's being played

`courses[0]` reliably carries a **name**; whether it carries an `address` is
inconsistent. So `placeOf()` tries every plausible path, accepts either a
structured `address` or a bare `"Detroit, MI"` string, and prefers a candidate
that has location data over one with only a name.

Whatever it finds is then enriched: `MI` becomes Michigan, `UAE` becomes United
Arab Emirates, a US state with no country stated implies the United States, and
the country maps to a continent from a built-in table — no sports feed carries a
continent. The parts are composed into one `where` string, skipping anything
missing rather than leaving a gap:

```
Detroit · Michigan · United States · North America
Dubai · United Arab Emirates · Asia
```

If ESPN gives no address, the course name shows alone and no location is
invented.

#### Between tournaments

For a few days after one tournament ends and before the next field is
published, `/api/golf` returns a tournament, a venue and the full schedule but
**zero tee times**. The client must not treat that as "no golf" — an earlier
version gated on `data.teeTimes?.length` and blanked the entire tab, schedule
included, until the next field appeared. It now gates on `enabled` alone and
shows the next tournament with a countdown, plus the rest of the season.

In that state the header must also not say *"Neither McIlroy nor Scheffler is
in this field"* — nobody is in the field yet, because there isn't one. It says
the field is announced nearer the week instead. `.test/gap.mjs` covers this.

#### The weekend is a spoiler

Rounds 1 and 2 tee times are drawn at random and give nothing away. Rounds 3
and 4 are **ordered by score** — a late Sunday tee time tells you someone is in
contention. On a spoiler-free site that matters, so the weekend sits behind an
opt-in checkbox, the same pattern as the YouTube highlight links. Before the cut
the toggle is replaced by a note explaining the tee times aren't drawn yet.

#### Whitelisting, not blacklisting

Golf payloads are the most score-dense on the site: every competitor carries
strokes, position, earnings and per-round totals, and `teeTime` sits in the same
object as the round score. So `golf.js` **whitelists** the three fields it
forwards — `period`, `teeTime`, `startHole` — rather than deleting the bad ones.
Any field ESPN adds later is dropped by default instead of leaking.

### Notes on the Iceland feed

TheSportsDB's free tier silently caps every event-list endpoint at 5 results,
but a Besta deildin round has 6 games. Event IDs are assigned in sequential
blocks per round and the single-event lookup endpoint isn't capped, so
`fetchIcelandSeason` finds the gaps in the ID sequence and back-fills them one
at a time, throttled to stay inside the rate limit. It runs as a background
refresh so visitors never wait on it.

### Countdown granularity

Only the hero counts seconds. Every row runs to the minute on the 30-second
clock, so there is exactly **one** subscriber to the 1-second clock on the whole
page no matter how long the list is. A 294-row tee sheet costs the same as an
empty one.

### Performance

One `setInterval` per cadence for the whole page, shared through
`useSyncExternalStore`. The hero is the only component on the 1-second clock;
every row rides the 30-second one. The event list re-buckets on a timer
scheduled for the next real kickoff or finish, not once a second — so a
272-game NFL page isn't redrawing itself continuously.

## Running it

```bash
npm install
npm run dev     # Vite dev server, proxies /api to localhost:3000
node server.js  # the API + static host, in a second terminal
```

Production build:

```bash
npm run build   # → dist/
npm start       # Express serves dist/ and the API on $PORT
```

### Environment

| Variable | Needed for |
| --- | --- |
| `FOOTBALL_DATA_TOKEN` | Premier League and Champions League fixtures |
| `PORT` | Set automatically by Railway; defaults to 3000 |

Without a token the football routes return `{ enabled: false }` and those two
leagues show an empty state. Iceland, F1 and NFL need no credentials.

Deployed on Railway via `railway.json` (Nixpacks, `npm start`).

## Owner's preferences

Two things are set deliberately rather than generically, at the top of
`src/App.jsx`:

```js
const THEME = "sline";                 // "sline" | "classic"
const PINNED_TEAM = { pl: "Liverpool", cl: "Liverpool", nfl: "Eagles" };
```

`PINNED_TEAM` holds a club at the front of the crest filter bar and marks it
with the accent colour; everyone else sorts alphabetically. Matching is by
substring, so `"Liverpool"` catches `"Liverpool FC"` and `"Eagles"` catches
`"Philadelphia Eagles"`.

For golf, `GOLF_PINNED` and `GOLF_TOP10` do the same job:

```js
const GOLF_PINNED = ["Rory McIlroy", "Scottie Scheffler"];
const GOLF_TOP10  = ["Scottie Scheffler", "Rory McIlroy", ...];
```

Your two get the accent rail on their rows; a tee sheet stays chronological
rather than being reordered, since that's the whole point of a departure board.
Name matching strips accents, so `"Ludvig Aberg"` still finds `"Ludvig Åberg"`.
`GOLF_TOP_N` sets how deep to follow — the world top 10 by default. That list
now comes **live from OWGR**; `GOLF_TOP10_FALLBACK` is only used when the
ranking can't be fetched, and the UI says so when it falls back. Ranked players
carry a `#3` badge on their row.

Name matching is one shared rule, `samePlayer()`, because the three sources
disagree: your pinned list says `"McIlroy"`, OWGR says `"Cameron Young"`, ESPN
says `"Cam Young"`. It tries exact, then substring either way, then surname plus
first initial. The last of those is what makes Cam and Cameron the same person;
it could in principle confuse two players sharing a surname and first initial,
which is an accepted trade.

`THEME` picks the palette. Both are defined as full sets of the same 15 colour
roles, so switching is one word:

- **`sline`** — graphite and aluminium with a single red mark, after the way
  Audi badges an S line. Kickoff times read aluminium, countdowns read white,
  red appears only in small doses: the badge rule, active-tab underlines,
  countdown separators, and the rail on night-owl rows.
- **`classic`** — the original navy, green and amber.

Competition order in the football tab follows the `LEAGUES` object's key order.

## Timezones

Every stored time is UTC. Conversion happens in the browser via
`Intl.DateTimeFormat`, so the site shows a visitor's own clock without asking
where they are. Events falling between 23:00 and 07:00 local time get a
🌙 night-owl marker — the whole reason the catch-up tab exists.

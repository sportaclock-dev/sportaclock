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

What ESPN actually provides, confirmed by probing the live feed:

- `/pga/scoreboard` returns **one tournament** — the current or next one —
  already carrying the full field. There's no season schedule, so there is no
  way to know October's field in July. The tab shows this week and nothing more.
- Per-round tee times live at `competitors[].linescores[].{period, teeTime}`.
  `competitors[].status.teeTime` holds only the current round and is used as a
  fallback.
- **Rounds 1 and 2 are published together** before play starts. Rounds 3 and 4
  appear mid-tournament, once the cut sets the draw.
- Event objects carry **no `startDate`**, so every date is derived from the tee
  times themselves.
- No rankings endpoint works — `/pga/rankings` returns 500, `/golf/rankings`
  404s, `/pga/standings` comes back empty. Hence `GOLF_TOP10` is maintained by
  hand in `src/App.jsx`.

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

### Performance

One `setInterval` per cadence for the whole page, shared through
`useSyncExternalStore`. Only the countdowns that are actually inside 24 hours
tick every second; everything further out rides a 30-second clock. The event
list re-buckets on a timer scheduled for the next real kickoff or finish, not
once a second — so a 272-game NFL page isn't redrawing itself continuously.

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
Edit `GOLF_TOP10` when the rankings move — it barely changes week to week.

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

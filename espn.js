/* ============================================================
   espn.js — one door to ESPN for the whole server.

   WHY THIS EXISTS
   golf.js, nfl.js and ynwa.js all call ESPN from the same address.
   When ESPN started refusing, each backed off on its own schedule
   and carried on asking — so a chatty new feature took the golf tab
   down with it. Everything now shares one counter: a few refusals
   in a row and ALL ESPN traffic pauses together.

   Two things learned by probing directly from this server:
     - Never send browser-ish headers. The identical URL returned
       200 with a plain fetch and 403 with a spoofed Chrome
       User-Agent. Claiming to be a browser from a datacentre is
       what gets you blocked.
     - site.api.espn.com can go dark across every sport at once — on
       12 Aug it refused soccer, golf AND nfl simultaneously, all
       with the same "Access Denied" page, while site.web.api.espn.com
       kept answering the identical paths with identical payloads
       (confirmed live: 362,757 bytes, commentary:108, same shape).
       So a refused primary now gets one retry against that mirror
       before it counts as a real failure — and both hosts failing
       is still only ONE strike toward the shared breaker, not two,
       so trying the mirror can never make it trip faster.
   ============================================================ */

const PRIMARY = "https://site.api.espn.com";
const MIRROR = "https://site.web.api.espn.com";

const FAILS_BEFORE_OPEN = 3;
const OPEN_MS = 10 * 60 * 1000;  // total quiet once tripped
const PROBE_EVERY = 60 * 1000;   // then one careful attempt a minute

let consecutiveFails = 0;
let openedAt = 0;
let openUntil = 0;
let lastProbe = 0;
let totals = { ok: 0, mirror: 0, refused: 0, skipped: 0 };

/* Clears the breaker. Used by tests to isolate scenarios, and available
   if you ever want to force a retry without redeploying. */
export function espnReset() {
  consecutiveFails = 0;
  openedAt = 0;
  openUntil = 0;
  lastProbe = 0;
  totals = { ok: 0, mirror: 0, refused: 0, skipped: 0 };
}

export function espnStatus() {
  const now = Date.now();
  return {
    open: now < openUntil,
    reopensInSec: now < openUntil ? Math.round((openUntil - now) / 1000) : 0,
    consecutiveFails,
    since: openedAt ? new Date(openedAt).toISOString() : null,
    totals: { ...totals },
  };
}

function trip() {
  openedAt = Date.now();
  openUntil = openedAt + OPEN_MS;
  // Start the probe clock now, or the very next caller slips through
  // immediately and the pause achieves nothing.
  lastProbe = openedAt;
  consecutiveFails = 0;
  console.error(
    `[espn] ${FAILS_BEFORE_OPEN} refusals in a row (mirror included) — pausing ALL ` +
    `ESPN traffic for ${Math.round(OPEN_MS / 60000)} minutes so the other feeds can recover`,
  );
}

function closeIfOpen(why) {
  if (!openUntil) return;
  console.log(`[espn] ${why} — resuming normal traffic`);
  openUntil = 0;
  openedAt = 0;
}

// Only rewrites URLs that actually start with the primary host, so callers
// never need to know this exists.
function toMirror(url) {
  return url.startsWith(PRIMARY) ? MIRROR + url.slice(PRIMARY.length) : null;
}

async function rawFetch(url) {
  try {
    const r = await fetch(url); // deliberately bare — see the header note above
    if (!r.ok) return { ok: false, status: r.status, note: `ESPN responded ${r.status}` };
    return { ok: true, status: 200, data: await r.json() };
  } catch (e) {
    return { ok: false, status: 0, note: e.message.slice(0, 90) };
  }
}

/* Returns { ok, status, data, via, note } and never throws, so callers can
   report what happened instead of swallowing it. `via` is "primary" or
   "mirror" on success, so a log or a debug view can show which host
   actually served the data. */
export async function espnTry(url) {
  const now = Date.now();

  // Circuit open: stay quiet, except for one probe a minute to spot recovery.
  if (now < openUntil && now - lastProbe < PROBE_EVERY) {
    totals.skipped++;
    return {
      ok: false, status: 0, skipped: true,
      note: `ESPN í hléi í ${Math.round((openUntil - now) / 1000)}s enn`,
    };
  }
  if (now < openUntil) lastProbe = now;

  const primary = await rawFetch(url);
  if (primary.ok) {
    totals.ok++;
    consecutiveFails = 0;
    closeIfOpen("primary answered");
    return { ...primary, via: "primary" };
  }

  const mirrorUrl = toMirror(url);
  if (mirrorUrl) {
    const mirror = await rawFetch(mirrorUrl);
    if (mirror.ok) {
      totals.ok++; totals.mirror++;
      consecutiveFails = 0;
      closeIfOpen("mirror answered while primary refused");
      return { ...mirror, via: "mirror" };
    }
  }

  // Both hosts refused (or no mirror applies to this URL) — one strike.
  totals.refused++;
  consecutiveFails++;
  if (consecutiveFails >= FAILS_BEFORE_OPEN) trip();
  return { ok: false, status: primary.status, note: primary.note };
}

export async function espnGet(url) {
  const r = await espnTry(url);
  if (!r.ok) throw new Error(r.note);
  return r.data;
}

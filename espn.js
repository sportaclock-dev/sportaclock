/* ============================================================
   espn.js — one door to ESPN for the whole server.

   WHY THIS EXISTS
   golf.js, nfl.js and ynwa.js all call site.api.espn.com from the
   same address. When ESPN started refusing, each backed off on its
   own schedule and carried on asking — so a chatty new feature took
   the golf tab down with it. Everything now shares one counter: a
   few refusals in a row and ALL ESPN traffic pauses together.

   Two rules learned the hard way:
     - Never send browser-ish headers. Probing from the server showed
       the identical URL returning 200 with a plain fetch and 403
       with a spoofed Chrome User-Agent. Claiming to be a browser
       from a datacentre is what gets you blocked.
     - A refusal is never endpoint-specific. If one path is refused,
       the rest will be too — asking them anyway only digs deeper.
   ============================================================ */

const FAILS_BEFORE_OPEN = 3;
const OPEN_MS = 10 * 60 * 1000;  // total quiet once tripped
const PROBE_EVERY = 60 * 1000;   // then one careful attempt a minute

let consecutiveFails = 0;
let openedAt = 0;
let openUntil = 0;
let lastProbe = 0;
let totals = { ok: 0, refused: 0, skipped: 0 };

/* Clears the breaker. Used by tests to isolate scenarios, and available
   if you ever want to force a retry without redeploying. */
export function espnReset() {
  consecutiveFails = 0;
  openedAt = 0;
  openUntil = 0;
  lastProbe = 0;
  totals = { ok: 0, refused: 0, skipped: 0 };
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
    `[espn] ${FAILS_BEFORE_OPEN} refusals in a row — pausing ALL ESPN traffic ` +
    `for ${Math.round(OPEN_MS / 60000)} minutes so the other feeds can recover`,
  );
}

/* Returns { ok, status, data, note } and never throws, so callers can
   report what happened instead of swallowing it. */
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

  try {
    const r = await fetch(url); // deliberately bare — see the header note above
    if (!r.ok) {
      totals.refused++;
      consecutiveFails++;
      if (consecutiveFails >= FAILS_BEFORE_OPEN) trip();
      return { ok: false, status: r.status, note: `ESPN responded ${r.status}` };
    }
    totals.ok++;
    consecutiveFails = 0;
    if (openUntil && now >= openUntil) {
      console.log("[espn] back to normal");
      openUntil = 0; openedAt = 0;
    } else if (openUntil) {
      // a probe got through while the circuit was open — reopen early
      console.log("[espn] a probe succeeded, resuming");
      openUntil = 0; openedAt = 0;
    }
    return { ok: true, status: 200, data: await r.json() };
  } catch (e) {
    totals.refused++;
    consecutiveFails++;
    if (consecutiveFails >= FAILS_BEFORE_OPEN) trip();
    return { ok: false, status: 0, note: e.message.slice(0, 90) };
  }
}

export async function espnGet(url) {
  const r = await espnTry(url);
  if (!r.ok) throw new Error(r.note);
  return r.data;
}

/* ============================================================
   NFL á íslensku — the one thing worth keeping across deploys:
   which YouTube video belongs to which game.

   Same Upstash Redis as /ynwa's comments, same REST shape, duplicated
   here rather than imported for the reason archive.js gives: this
   folder is meant to move to its own domain in one piece. Keys start
   with "nfl:" so they can't meet YNWA's.

   Without UPSTASH_* set (local dev) every call is a no-op and the
   highlights live in memory only, as before.
   ============================================================ */

function cleanEnv(v) {
  let s = (v || "").trim();
  while (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

// Read on each call, not at import, so tests can set them.
const conf = () => ({
  url: cleanEnv(process.env.UPSTASH_REDIS_REST_URL),
  token: cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN),
});
export const HIGHLIGHTS_KEY = "nfl:highlights";

export const storeEnabled = () => { const { url, token } = conf(); return Boolean(url && token); };

async function redis(cmd, fetchImpl = fetch) {
  const { url, token } = conf();
  const r = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`Upstash: ${j.error}`);
  return j.result;
}

// { videoId: { a, b, week, published } } for everything ever matched.
export async function loadHighlights(fetchImpl) {
  if (!storeEnabled()) return {};
  const flat = (await redis(["HGETALL", HIGHLIGHTS_KEY], fetchImpl)) || [];
  const out = {};
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      const v = JSON.parse(flat[i + 1]);
      if (/^[\w-]{6,20}$/.test(flat[i])) out[flat[i]] = v;
    } catch { /* skip a corrupt entry rather than lose the rest */ }
  }
  return out;
}

export async function saveHighlight(videoId, entry, fetchImpl) {
  if (!storeEnabled()) return;
  await redis(["HSET", HIGHLIGHTS_KEY, videoId, JSON.stringify(entry)], fetchImpl);
}

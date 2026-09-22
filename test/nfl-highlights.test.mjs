import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHighlights, saveHighlight, storeEnabled, HIGHLIGHTS_KEY } from "../nfl-is/store.js";
import { rememberVideos, videoFor, normaliseGame, _resetForTests } from "../nfl-is/data.js";

function withEnv(fn) {
  return async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    try { await fn(); } finally {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  };
}
const fakeFetch = (result, calls = []) => async (url, init) => {
  calls.push(JSON.parse(init.body));
  return { ok: true, json: async () => ({ result }) };
};

test("without Upstash settings the store is off and costs nothing", async () => {
  assert.equal(storeEnabled(), false);
  let called = false;
  assert.deepEqual(await loadHighlights(async () => { called = true; }), {});
  await saveHighlight("abcdefghijk", {}, async () => { called = true; });
  assert.equal(called, false);
});

test("saved videos load back; a corrupt or odd entry is skipped, not fatal", withEnv(async () => {
  const calls = [];
  const saved = await loadHighlights(fakeFetch([
    "ABCdef12345", JSON.stringify({ a: "IND", b: "KC", week: 2, published: "2026-09-21T04:00:00Z" }),
    "broken00000", "{not json",
    "bad id!", JSON.stringify({ a: "KC", b: "DEN" }),
  ], calls));
  assert.deepEqual(calls[0], ["HGETALL", HIGHLIGHTS_KEY]);
  assert.deepEqual(Object.keys(saved), ["ABCdef12345"]);
}));

test("a new video is written with HSET under the nfl: key", withEnv(async () => {
  const calls = [];
  await saveHighlight("ABCdef12345", { a: "IND", b: "KC", week: 2 }, fakeFetch(1, calls));
  assert.equal(calls[0][0], "HSET");
  assert.equal(calls[0][1], "nfl:highlights");
  assert.equal(calls[0][2], "ABCdef12345");
}));

test("only genuinely new videos are reported for saving", () => {
  _resetForTests();
  const e = [{ videoId: "ABCdef12345", title: "Indianapolis Colts vs Kansas City Chiefs Game Highlights | 2026 NFL Season Week 2", published: "2026-09-21T04:00:00Z" }];
  assert.equal(rememberVideos(e).length, 1);
  assert.equal(rememberVideos(e).length, 0, "second sighting is not new");
  const game = normaliseGame({
    id: "1", date: "2026-09-21T00:20Z", season: { type: 2 }, week: { number: 2 },
    competitions: [{ status: { type: { state: "post" } }, competitors: [
      { homeAway: "home", team: { id: "12" }, score: "33" }, { homeAway: "away", team: { id: "11" }, score: "30" }] }],
  });
  assert.equal(videoFor(game), "ABCdef12345");
});

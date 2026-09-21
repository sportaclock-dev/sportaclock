import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEAMS, DIVISIONS, teamKey, parseWeekKey, weekKey, shortWhen, longWhen,
} from "../nfl-is/content.js";
import {
  normaliseGame, parseHighlightTitle, parseFeed, rememberVideos, videoFor, _resetForTests,
} from "../nfl-is/data.js";
import { esc, count, gamesSection, teamPage } from "../nfl-is/render.js";

test("32 teams, 8 divisions of 4, every team exactly once", () => {
  assert.equal(Object.keys(TEAMS).length, 32);
  assert.equal(DIVISIONS.length, 8);
  const seen = DIVISIONS.flatMap((d) => d.teams);
  assert.ok(DIVISIONS.every((d) => d.teams.length === 4));
  assert.equal(new Set(seen).size, 32);
  assert.equal(new Set(Object.values(TEAMS).map((t) => t.id)).size, 32, "ESPN ids are unique");
});

test("team keys accept case and common aliases, reject the rest", () => {
  assert.equal(teamKey("kc"), "KC");
  assert.equal(teamKey("WAS"), "WSH");
  assert.equal(teamKey("la"), "LAR");
  assert.equal(teamKey("toString"), null);
  assert.equal(teamKey("__proto__"), null);
  assert.equal(teamKey(""), null);
});

test("week keys round-trip and reject nonsense", () => {
  assert.deepEqual(parseWeekKey("2"), { type: 2, week: 2 });
  assert.deepEqual(parseWeekKey("u5"), { type: 3, week: 5 });
  assert.equal(weekKey(3, 1), "u1");
  for (const bad of ["0", "19", "u4", "u6", "abc", "", undefined, "2;drop"]) {
    assert.equal(parseWeekKey(bad), null, String(bad));
  }
});

test("times are Icelandic (UTC) with Icelandic day names", () => {
  assert.equal(shortWhen("2026-09-21T00:20Z"), "Mán 00:20");
  assert.equal(longWhen("2026-09-21T00:20Z"), "mánudaginn 21. september kl. 00:20");
  assert.equal(shortWhen("2026-09-27T17:00Z"), "Sun 17:00");
});

test("Icelandic number agreement", () => {
  assert.equal(count(1, "sigur", "sigrar"), "1 sigur");
  assert.equal(count(2, "sigur", "sigrar"), "2 sigrar");
  assert.equal(count(11, "sigur", "sigrar"), "11 sigrar");
  assert.equal(count(21, "tap", "töp"), "21 tap");
  assert.equal(count(0, "tap", "töp"), "0 töp");
});

test("esc covers all five characters", () => {
  assert.equal(esc(`<a href="x" onclick='y'>&`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;");
  assert.equal(esc(null), "");
});

const ev = (over = {}) => ({
  id: "1", date: "2026-09-21T00:20Z",
  season: { type: 2 }, week: { number: 2 },
  competitions: [{
    neutralSite: false,
    status: { type: { state: "post", shortDetail: "Final/OT" } },
    competitors: [
      { homeAway: "home", team: { id: "12" }, score: "33", winner: true },
      { homeAway: "away", team: { id: "11" }, score: { value: 30, displayValue: "30" } },
    ],
    venue: { fullName: "Arrowhead Stadium" },
  }],
  ...over,
});

test("normaliseGame reads both score shapes ESPN uses", () => {
  const g = normaliseGame(ev());
  assert.equal(g.home.ab, "KC");
  assert.equal(g.away.ab, "IND");
  assert.equal(g.home.score, 33);
  assert.equal(g.away.score, 30);
  assert.equal(g.state, "post");
});

test("normaliseGame drops preseason and the Pro Bowl, and blanks pre-game scores", () => {
  assert.equal(normaliseGame(ev({ season: { type: 1 } })), null);
  assert.equal(normaliseGame(ev({ season: { type: 3 }, week: { number: 4 } })), null);
  const pre = ev();
  pre.competitions[0].status.type.state = "pre";
  const g = normaliseGame(pre);
  assert.equal(g.home.score, null);
  assert.equal(g.away.score, null);
});

test("highlight titles map to teams and week", () => {
  assert.deepEqual(
    parseHighlightTitle("Indianapolis Colts vs Kansas City Chiefs Game Highlights | 2026 NFL Season Week 2"),
    { a: "IND", b: "KC", week: 2 },
  );
  assert.equal(parseHighlightTitle("Patrick Mahomes's best plays from 3-TD game | Week 2"), null);
  assert.equal(parseHighlightTitle("Did The Colts FUMBLE Away A Win In OT?! | Colts vs Chiefs Week 2 Crazy OT Ending"), null);
});

test("feed parsing and matching: right week, right pair, not before it's played", () => {
  _resetForTests();
  const xml = `<feed><entry>
    <yt:videoId>ABCdef12345</yt:videoId><title>Indianapolis Colts vs Kansas City Chiefs Game Highlights | 2026 NFL Season Week 2</title>
    <published>2026-09-21T04:00:00+00:00</published></entry><entry>
    <yt:videoId>ZZZzzz99999</yt:videoId><title>Kansas City Chiefs vs Indianapolis Colts Game Highlights | 2026 NFL Season Week 14</title>
    <published>2026-12-10T04:00:00+00:00</published></entry></feed>`;
  const entries = parseFeed(xml);
  assert.equal(entries.length, 2);
  rememberVideos(entries);
  const g = normaliseGame(ev());
  assert.equal(videoFor(g), "ABCdef12345");
  assert.equal(videoFor({ ...g, week: 14 }), "ZZZzzz99999");
  assert.equal(videoFor({ ...g, state: "in" }), null);
});

test("rendered games escape everything that came from ESPN", () => {
  _resetForTests();
  const g = normaliseGame(ev());
  g.state = "in";
  g.detail = `<img src=x onerror=alert(1)>`;
  const html = gamesSection({ games: [g], current: { type: 2, week: 2 }, type: 2, week: 2 });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
});

test("team page shows key players only while they are on the roster", () => {
  const base = {
    ab: "KC", games: [normaliseGame(ev())], current: null,
    meta: { KC: { color: "#E31837", alt: "#FFB81C", location: "Kansas City", nickname: "Chiefs" } },
    standings: null, detail: { venue: "Arrowhead Stadium", city: "Kansas City", state: "MO" },
  };
  const on = teamPage({ ...base, roster: { coach: "", groups: { offense: [{ name: "Patrick Mahomes", jersey: "15", pos: "QB" }] } } });
  assert.ok(on.includes("Helstu leikmenn"));
  const off = teamPage({ ...base, roster: { coach: "", groups: { offense: [{ name: "Someone Else", jersey: "1", pos: "QB" }] } } });
  assert.ok(!off.includes("Helstu leikmenn"));
  assert.ok(on.includes("Kansas City Chiefs spila í AFC Vestur."));
});

test("record sentence uses the accusative after 'með'", () => {
  const st = (w, l) => ({ wins: w, losses: l, ties: 0, seed: 1 });
  const standings = Object.fromEntries(Object.keys(TEAMS).map((ab) => [ab, st(0, 0)]));
  const page = (w, l) => teamPage({
    ab: "KC", games: [], current: null, meta: {}, detail: null, roster: null,
    standings: { ...standings, KC: st(w, l) },
  });
  assert.ok(page(2, 0).includes("liðið með 2 sigra og 0 töp"));
  assert.ok(page(1, 1).includes("liðið með 1 sigur og 1 tap"));
  assert.ok(page(21, 3).includes("liðið með 21 sigur og 3 töp"));
});

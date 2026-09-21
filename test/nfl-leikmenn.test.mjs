import { test } from "node:test";
import assert from "node:assert/strict";
import { statLabel, statValue, cm, kg, feet, experience } from "../nfl-is/content.js";
import { playerPage, playerHref, shot } from "../nfl-is/render.js";

test("metric first, the way Icelanders measure", () => {
  assert.equal(cm(74), 188);
  assert.equal(kg(225), 102);
  assert.equal(feet(74), `6'2"`);
  assert.equal(cm(null), null);
});

test("experience follows ESPN's season number", () => {
  assert.equal(experience(1), "Nýliði");
  assert.equal(experience(10), "10. tímabil");
  assert.equal(experience(null), "");
});

test("stat labels: interceptions depend on position, unknown stats have none", () => {
  assert.equal(statLabel("interceptions", "QB"), "Köst sem vörnin greip");
  assert.equal(statLabel("interceptions", "CB"), "Interceptions");
  assert.equal(statLabel("somethingNew", "QB"), null);
});

test("stat values use a decimal comma and units", () => {
  assert.deepEqual(statValue("fieldGoalPct", "83.3"), ["83,3", "%"]);
  assert.deepEqual(statValue("grossAvgPuntYards", "54.5"), ["54,5", "jardar"]);
  assert.deepEqual(statValue("passingYards", "1,234"), ["1234", ""]);
});

test("profile URLs and resized headshots", () => {
  assert.equal(playerHref("KC", { id: "3139477", slug: "patrick-mahomes" }), "/nfl/lid/kc/3139477-patrick-mahomes");
  assert.match(shot("https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png", 96), /^https:\/\/a\.espncdn\.com\/combiner\/i\?img=%2Fi%2Fheadshots%2F.*&w=96&h=70&/);
});

test("player page: Icelandic facts, labelled stats only, everything escaped", () => {
  const player = {
    id: "1", slug: "x", name: `Jón <script>alert(1)</script>`, jersey: "15", pos: "QB", age: 31,
    heightIn: 74, weightLb: 225, expYears: 9, college: "Texas Tech", birthPlace: ["Tyler", "TX"], headshot: null,
  };
  const athlete = {
    team: "KC",
    season: 10,
    draft: { year: "2017", round: 1, pick: 10, team: "KC", code: "KC" },
    stats: [
      { name: "passingYards", value: "566", rank: 5 },
      { name: "interceptions", value: "1", rank: null },
      { name: "somethingNew", value: "7", rank: 1 },
    ],
  };
  const html = playerPage({ ab: "KC", player, athlete, games: [], current: null, meta: {}, keyText: "" });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("188 cm"));
  assert.ok(html.includes("102 kg"));
  assert.ok(html.includes("10. tímabil"));
  assert.ok(html.includes("Kastjardar"));
  assert.ok(html.includes("5. sæti í deildinni"));
  assert.ok(html.includes("Köst sem vörnin greip"));
  assert.ok(!html.includes("somethingNew"));
  assert.ok(html.includes("Valinn í 1. umferð nýliðavalsins 2017, nr. 10 í heildina, af Kansas City Chiefs."));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonYear, seasonQueries, collapseUndecided } from "../nfl.js";

test("the season is named after the year it starts", () => {
  assert.equal(seasonYear(new Date("2026-09-27T12:00:00Z")), 2026);
  assert.equal(seasonYear(new Date("2027-01-10T12:00:00Z")), 2026);
  assert.equal(seasonYear(new Date("2027-03-01T12:00:00Z")), 2027);
});

test("regular season spans two calendar years; both are required", () => {
  const q = seasonQueries(2026);
  assert.deepEqual(q.filter(([t]) => t === 2).map(([, y, req]) => [y, req]), [[2026, true], [2027, true]]);
  assert.deepEqual(q.find(([t]) => t === 3), [3, 2027, false]);
});

test("undecided playoff games collapse to one titled row per round", () => {
  const tbd = (label, date) => ({ id: date, date, home: "TBD", away: "TBD", label, tag: "Playoffs", state: "pre" });
  const out = collapseUndecided([
    { id: "1", date: "2027-01-10T18:00Z", home: "Chicago Bears", away: "Detroit Lions", label: "Week 18" },
    tbd("Wild Card", "2027-01-16T05:00Z"),
    tbd("Wild Card", "2027-01-17T05:00Z"),
    tbd("Divisional Round", "2027-01-23T05:00Z"),
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[1].title, "Wild Card — teams to be decided");
  assert.equal(out[1].home, null);
  assert.equal(out[0].home, "Chicago Bears");
});

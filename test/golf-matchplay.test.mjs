import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPlayOf } from "../golf.js";

// The shape ESPN gave for the 2026 Presidents Cup, trimmed to one match
// per kind: sessions of matches, pairs as `roster`, singles as `athlete`.
const player = (name) => ({ athlete: { displayName: name } });
const detail = {
  tournament: { scoringSystem: { name: "Match" }, major: false },
  competitions: [
    [{ id: "0", type: { text: "tournament" }, date: "2026-09-24T16:35Z",
       competitors: [{ homeAway: "home", team: { abbreviation: "USA" }, score: { value: 17 } }] }],
    [{ id: "1", date: "2026-09-24T16:35Z", description: "Thursday Four-Balls", type: { text: "fourball" },
       status: { type: { state: "post" } },
       broadcasts: [{ media: { shortName: "NBC" } }, { media: { shortName: "Peacock" } }],
       competitors: [
         { homeAway: "home", team: { abbreviation: "USA", displayName: "USA", logos: [{ href: "usa.png" }] },
           score: { value: 1, winner: true }, roster: [player("Scottie Scheffler"), player("Sam Burns")] },
         { homeAway: "away", team: { abbreviation: "INTL", displayName: "INTL", logos: [{ href: "intl.png" }] },
           score: { value: 0 }, roster: [player("Sungjae Im"), player("Min Woo Lee")] },
       ] }],
    [{ id: "2", date: "2026-09-27T16:02Z", description: "Sunday Singles", type: { text: "singles" },
       competitors: [
         { homeAway: "home", team: { abbreviation: "USA" }, athlete: { displayName: "Cameron Young" } },
         { homeAway: "away", team: { abbreviation: "INTL" }, athlete: { displayName: "Ryo Hisatsune" } },
       ] }],
  ],
};

test("stroke play is not mistaken for match play", () => {
  assert.equal(matchPlayOf({ competitions: [{ competitors: [] }] }), null);
});

test("sessions become matches with pairs, singles and TV", () => {
  const mp = matchPlayOf(detail);
  assert.equal(mp.matches.length, 2, "the team-score session is skipped");
  const [fb, sg] = mp.matches;
  assert.equal(fb.sessionName, "Thursday Four-Balls");
  assert.deepEqual(fb.home.players, ["Scottie Scheffler", "Sam Burns"]);
  assert.deepEqual(sg.away.players, ["Ryo Hisatsune"]);
  assert.deepEqual(fb.tv, ["NBC", "Peacock"]);
  assert.deepEqual(mp.teams.map((t) => t.name), ["USA", "International"]);
});

test("no score, winner or match status leaves the server", () => {
  const out = JSON.stringify(matchPlayOf(detail));
  assert.ok(!/score|winner|status|"post"/.test(out), out);
});

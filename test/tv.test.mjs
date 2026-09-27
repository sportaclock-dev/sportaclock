import { test } from "node:test";
import assert from "node:assert/strict";
import { ukSlot, ukTv } from "../src/tv.js";

const pl = (iso) => ({ sport: "football", league: "pl", kickoff: Date.parse(iso) });

test("UK slots are read in London time, across the clock change", () => {
  assert.equal(ukSlot(Date.parse("2026-10-10T14:00:00Z")), "Sat 15:00"); // BST
  assert.equal(ukSlot(Date.parse("2026-11-07T15:00:00Z")), "Sat 15:00"); // GMT
});

test("Premier League: blackout, TNT at 12:30, Sky otherwise", () => {
  assert.equal(ukTv(pl("2026-10-10T14:00:00Z")), "Not on UK TV (3pm blackout)");
  assert.equal(ukTv(pl("2026-10-10T11:30:00Z")), "TNT Sports");
  assert.equal(ukTv(pl("2026-10-11T15:30:00Z")), "Sky Sports"); // Sunday 16:30
  assert.equal(ukTv(pl("2026-10-10T16:30:00Z")), "Sky Sports"); // Saturday 17:30
});

test("other competitions, and none for Besta deildin", () => {
  assert.equal(ukTv({ sport: "f1", kickoff: 0 }), "Sky Sports F1");
  assert.equal(ukTv({ sport: "golf", kickoff: 0 }), "Sky Sports Golf");
  assert.equal(ukTv({ sport: "football", league: "cl", kickoff: 0 }), "TNT Sports · Prime Video");
  assert.equal(ukTv({ sport: "football", league: "is", kickoff: 0 }), null);
});

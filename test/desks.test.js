import { test } from "node:test";
import assert from "node:assert/strict";
import { DESK_CENSUS, deriveDeskTickers, deriveBodyTickers } from "../src/desks.js";

const traitsOf = (entries) => new Map(entries.map(([id, desk]) => [id, { weightClass: 100, desk }]));
const metaOf = (entries) => new Map(entries.map(([id, body]) => [id, { image: "u", headwear: "Halo", body, eyes: "UwU" }]));

test("the published census covers all ten thousand machines with distinct counts", () => {
  const counts = Object.values(DESK_CENSUS);
  assert.equal(counts.reduce((a, b) => a + b, 0), 10000);
  assert.equal(new Set(counts).size, counts.length, "distinct counts are what make the mapping unique");
  assert.equal(counts.length, 16);
});

test("desk indices resolve to tickers by matching how many machines each holds", () => {
  const census = { AAA: 3, BBB: 2, CCC: 1 };
  const traits = traitsOf([[1, 7], [2, 7], [3, 7], [4, 0], [5, 0], [6, 4]]);
  const { byIndex, ok } = deriveDeskTickers(traits, census);
  assert.equal(ok, true);
  assert.equal(byIndex.get(7), "AAA");
  assert.equal(byIndex.get(0), "BBB");
  assert.equal(byIndex.get(4), "CCC");
});

test("a chain that disagrees with the census yields no mapping at all", () => {
  const census = { AAA: 3, BBB: 2 };
  const traits = traitsOf([[1, 0], [2, 0], [3, 0], [4, 1]]);   // 3 + 1, not 3 + 2
  const { byIndex, ok, reason } = deriveDeskTickers(traits, census);
  assert.equal(ok, false);
  assert.equal(byIndex.size, 0);
  assert.match(reason, /census/i);
});

test("counts that tie make the mapping ambiguous, so none is produced", () => {
  const census = { AAA: 2, BBB: 2 };
  const traits = traitsOf([[1, 0], [2, 0], [3, 1], [4, 1]]);
  const { ok, reason } = deriveDeskTickers(traits, census);
  assert.equal(ok, false);
  assert.match(reason, /tie|ambig/i);
});

test("a body colour takes the ticker of the desk it always belongs to", () => {
  const census = { AAA: 2, BBB: 1 };
  const traits = traitsOf([[1, 5], [2, 5], [3, 9]]);
  const { byIndex } = deriveDeskTickers(traits, census);
  const bodies = deriveBodyTickers({ traits, meta: metaOf([[1, "Sky"], [2, "Sky"], [3, "Amber"]]), byIndex });
  assert.equal(bodies.get("Sky"), "AAA");
  assert.equal(bodies.get("Amber"), "BBB");
});

test("a body colour spanning two desks gets no ticker rather than the wrong one", () => {
  const census = { AAA: 2, BBB: 1 };
  const traits = traitsOf([[1, 5], [2, 5], [3, 9]]);
  const { byIndex } = deriveDeskTickers(traits, census);
  const bodies = deriveBodyTickers({ traits, meta: metaOf([[1, "Sky"], [2, "Sky"], [3, "Sky"]]), byIndex });
  assert.equal(bodies.get("Sky"), null);
});

test("with no desk mapping at all, no body colour is given a ticker", () => {
  const bodies = deriveBodyTickers({
    traits: traitsOf([[1, 5]]), meta: metaOf([[1, "Sky"]]), byIndex: new Map(),
  });
  assert.equal(bodies.get("Sky"), null);
});

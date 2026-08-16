import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTraitIndex, TRAIT_TYPES } from "../src/traitindex.js";

const metaOf = (rows) => new Map(rows.map(([id, headwear, body, eyes]) =>
  [id, { image: "u", headwear, body, eyes }]));

test("only the three traits that vary are indexed", () => {
  assert.deepEqual(TRAIT_TYPES, ["Headwear", "Body", "Eyes"]);
});

test("each value carries what exists and what is actually on sale", () => {
  const index = buildTraitIndex({
    meta: metaOf([
      [1, "Halo", "Sky", "UwU"],
      [2, "Halo", "Amber", "Rage"],
      [3, "Blade", "Sky", "UwU"],
    ]),
    listed: new Set([1, 3]),
  });
  const halo = index.Headwear.find((v) => v.value === "Halo");
  assert.deepEqual(halo, { value: "Halo", total: 2, listed: 1 });
  const uwu = index.Eyes.find((v) => v.value === "UwU");
  assert.deepEqual(uwu, { value: "UwU", total: 2, listed: 2 });
});

test("a value that exists but is on sale nowhere still appears, at zero", () => {
  const index = buildTraitIndex({
    meta: metaOf([[1, "Halo", "Sky", "UwU"]]),
    listed: new Set(),
  });
  assert.equal(index.Headwear[0].listed, 0);
  assert.equal(index.Headwear[0].total, 1);
});

test("values are listed alphabetically, so a known one is easy to find", () => {
  const index = buildTraitIndex({
    meta: metaOf([[1, "Zebra", "Sky", "UwU"], [2, "Alert", "Sky", "UwU"], [3, "Mohawk", "Sky", "UwU"]]),
    listed: new Set(),
  });
  assert.deepEqual(index.Headwear.map((v) => v.value), ["Alert", "Mohawk", "Zebra"]);
});

test("body values carry the ticker they farm, and the other traits do not", () => {
  const index = buildTraitIndex({
    meta: metaOf([[1, "Halo", "Sky", "UwU"]]),
    listed: new Set([1]),
    bodyTickers: new Map([["Sky", "MSFT"]]),
  });
  assert.equal(index.Body[0].ticker, "MSFT");
  assert.equal("ticker" in index.Headwear[0], false);
  assert.equal("ticker" in index.Eyes[0], false);
});

test("a body colour with no resolved desk gets a null ticker, never a guessed one", () => {
  const index = buildTraitIndex({
    meta: metaOf([[1, "Halo", "Sky", "UwU"]]),
    listed: new Set(),
    bodyTickers: new Map(),
  });
  assert.equal(index.Body[0].ticker, null);
});

test("a machine missing a trait is skipped for that trait, not counted as blank", () => {
  const index = buildTraitIndex({
    meta: metaOf([[1, "Halo", null, "UwU"], [2, "Halo", "Sky", null]]),
    listed: new Set([1, 2]),
  });
  assert.equal(index.Body.length, 1);
  assert.equal(index.Eyes.length, 1);
  assert.equal(index.Headwear[0].total, 2);
});

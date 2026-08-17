import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTraitIndex, TRAIT_TYPES } from "../src/traitindex.js";

const metaOf = (rows) => new Map(rows.map(([id, headwear, body, eyes]) =>
  [id, { image: "u", headwear, body, eyes }]));


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

// Le desk vient du Body et décide du stock sur lequel la machine touche double.
// C'est la seule dimension mécanique des quatre : les trois autres sont
// cosmétiques. Elle vient donc en premier.
test("the stock a machine farms is indexed as its own dimension, first", () => {
  assert.deepEqual(TRAIT_TYPES, ["Farms", "Headwear", "Body", "Eyes"]);
});

test("machines are grouped by the ticker their body puts them on", () => {
  const index = buildTraitIndex({
    meta: new Map([
      [1, { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU" }],
      [2, { image: "u", headwear: "Fez", body: "Sky Stripe", eyes: "Rage" }],
      [3, { image: "u", headwear: "Fez", body: "Concrete", eyes: "Rage" }],
    ]),
    listed: new Set([1, 3]),
    bodyTickers: new Map([["Sky", "MSFT"], ["Sky Stripe", "MSFT"], ["Concrete", "COST"]]),
  });
  const msft = index.Farms.find((v) => v.value === "MSFT");
  assert.equal(msft.total, 2);      // deux couleurs de corps, un seul desk
  assert.equal(msft.listed, 1);
  assert.equal(index.Farms.find((v) => v.value === "COST").total, 1);
});

test("a body whose desk could not be resolved joins no ticker", () => {
  const index = buildTraitIndex({
    meta: new Map([[1, { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU" }]]),
    listed: new Set(),
    bodyTickers: new Map(),
  });
  assert.deepEqual(index.Farms, []);
});

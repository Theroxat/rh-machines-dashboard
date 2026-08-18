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

test("the desk is its own dimension, and no trait carries a ticker any more", () => {
  const index = buildTraitIndex({
    meta: metaOf([[1, "Halo", "Sky", "UwU"]]),
    listed: new Set([1]),
    deskOf: () => "health",
  });
  assert.equal(index.Desk[0].value, "health");
  assert.equal("ticker" in index.Headwear[0], false);
  assert.equal("ticker" in index.Body[0], false);
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

// Le desk est un secteur scellé au mint, lu sur la chaîne. C'est la seule
// dimension mécanique des quatre — les trois autres sont cosmétiques — donc
// elle vient en premier. Elle se nommait d'après des tickers déduits d'une
// couleur de corps ; c'était faux.
test("the desk a machine sits on is indexed as its own dimension, first", () => {
  assert.deepEqual(TRAIT_TYPES, ["Desk", "Headwear", "Body", "Eyes"]);
});

test("machines are grouped by the sector the chain puts them on", () => {
  const index = buildTraitIndex({
    meta: new Map([
      [1, { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU" }],
      [2, { image: "u", headwear: "Fez", body: "Amber", eyes: "Rage" }],
      [3, { image: "u", headwear: "Fez", body: "Concrete", eyes: "Rage" }],
    ]),
    listed: new Set([1, 3]),
    deskOf: (id) => (id === 3 ? "utilities" : "health"),
  });
  const health = index.Desk.find((v) => v.value === "health");
  assert.equal(health.total, 2);      // deux couleurs de corps, un seul secteur
  assert.equal(health.listed, 1);
  assert.equal(index.Desk.find((v) => v.value === "utilities").total, 1);
});

test("a machine the chain places on no desk joins no sector", () => {
  const index = buildTraitIndex({
    meta: new Map([[1, { image: "u", headwear: "Halo", body: "Sky", eyes: "UwU" }]]),
    listed: new Set(),
    deskOf: () => null,
  });
  assert.deepEqual(index.Desk, []);
});

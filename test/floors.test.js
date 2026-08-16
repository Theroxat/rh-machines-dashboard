import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, median } from "../src/floors.js";

// Des constructeurs pour que chaque test ne nomme que ce qu'il fait varier.
const traitsOf = (entries) => new Map(entries.map(([id, wc]) => [id, { weightClass: wc, desk: 0 }]));
const inkOf = (entries) => new Map(entries.map(([id, v]) => [id, BigInt(v)]));
const listingsOf = (entries) => new Map(entries.map(([id, p]) => [id, { tokenId: id, priceEth: p, orderHash: null }]));
const rowOf = (grid, label) => grid.rows.find((r) => r.classLabel === label);

test("median needs no even-length special case to be wrong about", () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test("a class with no listing has no floor, and never a floor of zero", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 600]]),
    ink: inkOf([[1, 0]]),
    listings: listingsOf([]),
    pelotonSize: 5,
  });
  const x6 = rowOf(grid, "x6");
  assert.equal(x6.dormant.floorEth, null);
  assert.equal(x6.dormant.listed, 0);
  assert.equal(x6.dormant.supply, 1);
  assert.equal(x6.dormant.listedRatio, 0);
});

test("supply counts every machine of the class, listed or not", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 200], [2, 200], [3, 200]]),
    ink: inkOf([[1, 4250], [2, 0], [3, 0]]),
    listings: listingsOf([[1, 0.5]]),
    pelotonSize: 5,
  });
  const x2 = rowOf(grid, "x2");
  assert.equal(x2.inked.supply, 1);
  assert.equal(x2.dormant.supply, 2);
  assert.equal(x2.inked.listed, 1);
  assert.equal(x2.dormant.listed, 0);
  assert.equal(x2.inked.listedRatio, 1);
  assert.equal(x2.chainCount, 3);
});

test("a cell below the peloton size has no peloton at all", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100], [3, 100], [4, 100]]),
    ink: inkOf([[1, 1], [2, 1], [3, 1], [4, 1]]),
    listings: listingsOf([[1, 0.1], [2, 0.2], [3, 0.3], [4, 0.4]]),
    pelotonSize: 5,
  });
  const x1 = rowOf(grid, "x1");
  assert.equal(x1.inked.listed, 4);
  assert.equal(x1.inked.pelotonEth, null);
  assert.equal(x1.inked.floorEth, 0.1);
});

test("the peloton is the median of the cheapest N, immune to one dust listing", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100], [3, 100], [4, 100], [5, 100], [6, 100]]),
    ink: inkOf([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]),
    listings: listingsOf([[1, 0.001], [2, 0.10], [3, 0.11], [4, 0.12], [5, 0.13], [6, 0.99]]),
    pelotonSize: 5,
  });
  const x1 = rowOf(grid, "x1");
  assert.equal(x1.inked.floorEth, 0.001);   // la poussière est le prix actionnable
  assert.equal(x1.inked.pelotonEth, 0.11);  // et elle ne déplace pas le niveau de marché
});

test("ties at the same price resolve to the lowest token id, deterministically", () => {
  const grid = buildGrid({
    traits: traitsOf([[9, 300], [4, 300]]),
    ink: inkOf([[9, 0], [4, 0]]),
    listings: listingsOf([[9, 0.5], [4, 0.5]]),
    pelotonSize: 5,
  });
  assert.equal(rowOf(grid, "x3").dormant.floorTokenId, 4);
});

test("ink state is a threshold on burn, not a flag", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 400], [2, 400]]),
    ink: inkOf([[1, 0], [2, 1]]),
    listings: listingsOf([]),
    pelotonSize: 5,
  });
  const x4 = rowOf(grid, "x4");
  assert.equal(x4.dormant.supply, 1);
  assert.equal(x4.inked.supply, 1);
});

test("an unreadable rarity is excluded and counted, never defaulted to x1", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, null], [2, 100]]),
    ink: inkOf([[1, 0], [2, 0]]),
    listings: listingsOf([[1, 0.01]]),
    pelotonSize: 5,
  });
  assert.equal(grid.excluded.unknownRarity, 1);
  assert.equal(rowOf(grid, "x1").dormant.supply, 1);
  assert.equal(rowOf(grid, "x1").dormant.listed, 0);
  assert.equal(grid.excluded.listingsOffGrid, 1);
});

test("a machine whose ink was never read is excluded, not assumed dormant", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100]]),
    ink: inkOf([[2, 0]]),
    listings: listingsOf([]),
    pelotonSize: 5,
  });
  assert.equal(grid.excluded.unknownInk, 1);
  assert.equal(rowOf(grid, "x1").dormant.supply, 1);
});

test("the ink spread needs both halves, and is never measured against nothing", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 1000], [2, 1000], [3, 600]]),
    ink: inkOf([[1, 4250], [2, 0], [3, 4250]]),
    listings: listingsOf([[1, 0.5], [2, 0.4], [3, 0.9]]),
    pelotonSize: 5,
  });
  assert.ok(Math.abs(rowOf(grid, "x10").spreadEth - 0.1) < 1e-12);
  assert.equal(rowOf(grid, "x6").spreadEth, null); // inkée seulement, pas de floor dormant
});

test("every one of the seven classes is present even with no data at all", () => {
  const grid = buildGrid({ traits: new Map(), ink: new Map(), listings: new Map(), pelotonSize: 5 });
  assert.equal(grid.rows.length, 7);
  assert.deepEqual(grid.rows.map((r) => r.classLabel), ["x1", "x1.5", "x2", "x3", "x4", "x6", "x10"]);
  assert.equal(grid.rows[0].inked.floorEth, null);
  assert.equal(grid.rows[0].inked.listedRatio, null); // pas de supply : un ratio serait une division par zéro
});

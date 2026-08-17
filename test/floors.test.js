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

test("a cell carries its whole book, cheapest first, not only its floor", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100], [3, 100]]),
    ink: inkOf([[1, 1], [2, 1], [3, 1]]),
    listings: listingsOf([[2, 0.30], [3, 0.10], [1, 0.20]]),
    pelotonSize: 5,
  });
  const cell = rowOf(grid, "x1").inked;
  assert.deepEqual(cell.entries.map((e) => e.tokenId), [3, 1, 2]);
  assert.deepEqual(cell.entries.map((e) => e.priceEth), [0.1, 0.2, 0.3]);
  assert.equal(cell.entries[0].tokenId, cell.floorTokenId);
  assert.equal(cell.entries.length, cell.listed);
});

test("a cell with nothing on sale carries an empty book, not a missing one", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 600]]), ink: inkOf([[1, 0]]), listings: listingsOf([]), pelotonSize: 5,
  });
  assert.deepEqual(rowOf(grid, "x6").dormant.entries, []);
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

// ---- le rayon de l'anvil ----

// Un second marché, dans une autre monnaie : il se range dans les mêmes cases
// mais il ne se mélange pas au carnet OpenSea. Une machine que l'anvil détient
// n'est pas « en vente sur OpenSea », et les comptages ne doivent pas bouger.
test("shelf machines land in the cell their rarity and ink put them in", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100], [3, 200]]),
    ink: inkOf([[1, 4250], [2, 0], [3, 4250]]),
    listings: listingsOf([]),
    shelf: new Map([[1, 23465], [2, 23465], [3, 27733]]),
    pelotonSize: 5,
  });
  assert.deepEqual(rowOf(grid, "x1").inked.anvilEntries.map((e) => e.tokenId), [1]);
  assert.deepEqual(rowOf(grid, "x1").dormant.anvilEntries.map((e) => e.tokenId), [2]);
  assert.deepEqual(rowOf(grid, "x2").inked.anvilEntries.map((e) => e.tokenId), [3]);
  assert.equal(rowOf(grid, "x1").inked.anvilEntries[0].askPrinter, 23465);
});

test("the shelf never inflates what the OpenSea book says is on sale", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100]]),
    ink: inkOf([[1, 4250], [2, 4250]]),
    listings: listingsOf([[1, 0.105]]),
    shelf: new Map([[2, 23465]]),
    pelotonSize: 5,
  });
  const cell = rowOf(grid, "x1").inked;
  assert.equal(cell.listed, 1);            // seule #1 est sur OpenSea
  assert.equal(cell.entries.length, 1);
  assert.equal(cell.anvilEntries.length, 1);
  assert.equal(cell.floorEth, 0.105);      // le floor reste celui du carnet ETH
});

test("shelf machines come cheapest first, like everything else", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100], [3, 100]]),
    ink: inkOf([[1, 4250], [2, 4250], [3, 4250]]),
    listings: listingsOf([]),
    shelf: new Map([[1, 30000], [2, 20000], [3, 25000]]),
    pelotonSize: 5,
  });
  assert.deepEqual(rowOf(grid, "x1").inked.anvilEntries.map((e) => e.askPrinter), [20000, 25000, 30000]);
});

test("with no shelf at all every cell simply holds none", () => {
  const grid = buildGrid({ traits: new Map(), ink: new Map(), listings: new Map(), pelotonSize: 5 });
  assert.deepEqual(grid.rows[0].inked.anvilEntries, []);
});

// Une machine que le vault détient ne peut être vendue par personne d'autre :
// si un listing traîne encore dans le carnet OpenSea pour elle, c'est un
// résidu inexécutable. L'afficher promettrait un achat impossible.
test("a listing for a machine the anvil holds is dropped as stale", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100]]),
    ink: inkOf([[1, 4250], [2, 4250]]),
    listings: listingsOf([[1, 0.05], [2, 0.11]]),
    shelf: new Map([[1, 23465]]),
    pelotonSize: 5,
  });
  const cell = rowOf(grid, "x1").inked;
  assert.equal(cell.listed, 1);                    // #1 ne compte plus
  assert.equal(cell.entries[0].tokenId, 2);
  assert.equal(cell.floorEth, 0.11);               // le floor n'est plus tiré par un résidu
  assert.equal(grid.excluded.heldByAnvil, 1);
  assert.equal(cell.anvilEntries[0].tokenId, 1);   // elle reste, du côté de l'anvil
});

test("nothing is dropped when the two markets do not overlap", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100]]),
    ink: inkOf([[1, 4250], [2, 4250]]),
    listings: listingsOf([[1, 0.11]]),
    shelf: new Map([[2, 23465]]),
    pelotonSize: 5,
  });
  assert.equal(grid.excluded.heldByAnvil, 0);
  assert.equal(rowOf(grid, "x1").inked.listed, 1);
});

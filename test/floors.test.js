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



// Le Meltdown du 2026-09-23 : 4 381 machines marquées Burned restent en vente,
// et 3 497 sont parties à l'adresse morte. Les mêler aux vivantes fausse les
// floors ; les inventer vivantes faute de statut, aussi.
const statusOf = (entries) => new Map(entries);

test("a machine marked burned gets its own cell, whatever its ink", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100], [3, 100]]),
    ink: inkOf([[1, 4250], [2, 0], [3, 4250]]),
    listings: listingsOf([[1, 0.01], [2, 0.02], [3, 0.5]]),
    status: statusOf([[1, "burned"], [2, "burned"], [3, "active"]]),
    pelotonSize: 5,
  });
  const x1 = rowOf(grid, "x1");
  assert.equal(x1.burned.supply, 2);
  assert.equal(x1.burned.listed, 2);
  assert.equal(x1.burned.floorEth, 0.01);
  // Le floor des vivantes n'est plus tiré vers le bas par les brûlées.
  assert.equal(x1.inked.floorEth, 0.5);
  assert.equal(x1.inked.supply, 1);
  assert.equal(x1.dormant.supply, 0);
  assert.equal(grid.totals.burned, 2);
  assert.equal(grid.totals.listed, 3);
});

test("a machine held by the dead address is destroyed: out of every supply", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100]]),
    ink: inkOf([[1, 0], [2, 0]]),
    listings: listingsOf([[1, 0.01]]),
    status: statusOf([[2, "dormant"]]),
    gone: new Set([1]),
    pelotonSize: 5,
  });
  const x1 = rowOf(grid, "x1");
  assert.equal(x1.burned.supply + x1.inked.supply + x1.dormant.supply, 1);
  assert.equal(x1.chainCount, 1);
  assert.equal(grid.excluded.destroyed, 1);
  // Une annonce OpenSea résiduelle sur une machine détruite n'est pas achetable.
  assert.equal(grid.totals.listed, 0);
});

test("a machine whose status was not read is excluded and counted, never guessed alive", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100]]),
    ink: inkOf([[1, 4250], [2, 4250]]),
    listings: listingsOf([[1, 0.01], [2, 0.5]]),
    status: statusOf([[2, "active"]]),
    pelotonSize: 5,
  });
  const x1 = rowOf(grid, "x1");
  assert.equal(grid.excluded.unknownStatus, 1);
  assert.equal(x1.inked.floorEth, 0.5);
  assert.equal(grid.excluded.listingsOffGrid, 1);
});

test("without a status map the grid keeps two states and an empty burned cell", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100]]),
    ink: inkOf([[1, 4250]]),
    listings: listingsOf([[1, 0.3]]),
    pelotonSize: 5,
  });
  const x1 = rowOf(grid, "x1");
  assert.equal(x1.inked.floorEth, 0.3);
  assert.equal(x1.burned.supply, 0);
  assert.equal(x1.burned.floorEth, null);
});

test("the anvil shelf is sorted into the burned cell like the book", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100]]),
    ink: inkOf([[1, 0]]),
    listings: listingsOf([]),
    status: statusOf([[1, "burned"]]),
    shelf: new Map([[1, 9000]]),
    pelotonSize: 5,
  });
  assert.deepEqual(rowOf(grid, "x1").burned.anvilEntries, [{ tokenId: 1, askPrinter: 9000 }]);
});

// Le Rituel noir du 2026-09-23 : les vessels gagnés sont une case à part, hors
// classes, et ne tirent ni le floor des brûlées ni celui des vivantes.
test("a Dark Machine forged on-chain has one cell for the whole collection", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 200], [3, 100]]),
    ink: inkOf([[1, 4250], [2, 4250], [3, 4250]]),
    listings: listingsOf([[1, 2.0], [2, 1.5], [3, 0.01]]),
    status: statusOf([[1, "burned"], [2, "burned"], [3, "burned"]]),
    dark: new Set([1, 2]),
    pelotonSize: 5,
  });
  assert.equal(grid.dark.supply, 2);
  assert.equal(grid.dark.floorEth, 1.5);
  assert.equal(grid.totals.dark, 2);
  assert.equal(rowOf(grid, "x1").burned.supply, 1);
  assert.equal(rowOf(grid, "x1").burned.floorEth, 0.01);
  assert.equal(grid.totals.listed, 3);
});

// Le jour de l'ouverture, OpenSea avait six machines de retard sur la chaîne —
// et la #23 était publiée Dark sans qu'aucun rituel ne l'ait produite.
test("a Dark Machine is recognised by the chain or by its published status", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [23, 100]]),
    ink: inkOf([[1, 0], [23, 0]]),
    listings: listingsOf([]),
    status: statusOf([[23, "dark machine"]]),   // #1 pas encore republiée
    dark: new Set([1]),
    pelotonSize: 5,
  });
  assert.equal(grid.dark.supply, 2);
  assert.equal(grid.excluded.unknownStatus, 0);
});

test("a Dark Machine sent to the dead address is destroyed, not dark", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100]]),
    ink: inkOf([[1, 0]]),
    listings: listingsOf([]),
    status: statusOf([]),
    dark: new Set([1]),
    gone: new Set([1]),
    pelotonSize: 5,
  });
  assert.equal(grid.dark.supply, 0);
  assert.equal(grid.excluded.destroyed, 1);
});

// Les Blue Machines (2026-09-28) : une case pour toute la collection, comme les
// Dark, reconnues par la chaîne ou par leur statut publié.
test("a Blue Machine has one cell for the whole collection, apart from burned and Dark", () => {
  const grid = buildGrid({
    traits: traitsOf([[1, 100], [2, 100], [3, 100], [4, 100]]),
    ink: inkOf([[1, 4250], [2, 4250], [3, 4250], [4, 4250]]),
    listings: listingsOf([[1, 0.3], [2, 0.25], [3, 0.01], [4, 2]]),
    status: statusOf([[1, "burned"], [2, "blue machine"], [3, "burned"], [4, "dark machine"]]),
    blue: new Set([1]),
    pelotonSize: 5,
  });
  assert.equal(grid.blue.supply, 2);
  assert.equal(grid.blue.floorEth, 0.25);
  assert.equal(grid.totals.blue, 2);
  assert.equal(grid.dark.supply, 1);
  assert.equal(rowOf(grid, "x1").burned.floorEth, 0.01);
  assert.equal(grid.totals.listed, 4);
});

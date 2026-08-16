import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSnapshot } from "../src/snapshot.js";

const base = {
  grid: {
    rows: [],
    excluded: { unknownRarity: 0, unknownInk: 0, listingsOffGrid: 0 },
    totals: { inked: 0, dormant: 0, listed: 0 },
  },
  printer: { usd: 0.0126, change24h: 598, liquidityUsd: 427948, fdv: 2165143 },
  eth: { usd: 1883.24, local: 1883.24, coingecko: 1883.81, spreadPct: 0.03 },
  protocol: { epoch: "12", activationInk: "4250000000000000000000" },
  stats: { floor: 0.0889891, symbol: "ETH", volume: 425.576, sales: 18124, owners: 2624, volume24h: 136.67, sales24h: 1896 },
  book: { listed: 300, pages: 3, skipped: { foreignCurrency: 0, unreadable: 0 } },
  inkMeta: { readAt: 1000, failures: 0 },
  now: 2000,
};

test("the cost of activation ink is derived, in both currencies", () => {
  const s = composeSnapshot(base);
  assert.equal(s.ink.activationPrinter, 4250);
  assert.ok(Math.abs(s.ink.activationUsd - 53.55) < 0.01);
  assert.ok(Math.abs(s.ink.activationEth - 0.02843) < 0.0001);
});

test("an unreadable activation constant leaves the derived costs null, not zero", () => {
  const s = composeSnapshot({ ...base, protocol: { epoch: "12", activationInk: null } });
  assert.equal(s.ink.activationPrinter, null);
  assert.equal(s.ink.activationUsd, null);
  assert.equal(s.ink.activationEth, null);
});



const withGrid = {
  ...base,
  grid: {
    ...base.grid,
    rows: [{
      classLabel: "x10", classValue: 1000, docCount: 37, chainCount: 37, spreadEth: -0.5,
      inked: {
        floorEth: 2.0, floorTokenId: 1253, pelotonEth: 2.25, listed: 2, supply: 33, listedRatio: 0.06,
        entries: [{ tokenId: 1253, priceEth: 2.0 }, { tokenId: 999, priceEth: 2.4 }],
      },
      dormant: { floorEth: null, floorTokenId: null, pelotonEth: null, listed: 0, supply: 4, listedRatio: 0, entries: [] },
    }],
  },
  meta: new Map([[1253, { image: "https://img/1253.webp", headwear: "Blueberries", body: "Cobalt Stripe", eyes: "Rage" }]]),
  legend: { byClass: [], headwearClass: new Map(), ambiguous: [], unpaired: 0 },
};

test("every machine on sale carries its picture, its traits and the ticker it farms", () => {
  const s = composeSnapshot({ ...withGrid, bodyTickers: new Map([["Cobalt Stripe", "GOOGL"]]) });
  assert.deepEqual(s.rows[0].inked.entries[0].machine, {
    image: "https://img/1253.webp", headwear: "Blueberries", body: "Cobalt Stripe",
    eyes: "Rage", ticker: "GOOGL",
  });
});

test("a body colour with no resolved desk yields a null ticker, not a missing key", () => {
  const s = composeSnapshot(withGrid);
  assert.equal(s.rows[0].inked.entries[0].machine.ticker, null);
});

test("the trait index counts what is on sale against what exists", () => {
  const s = composeSnapshot(withGrid);
  const blueberries = s.traitFilters.Headwear.find((v) => v.value === "Blueberries");
  assert.equal(blueberries.total, 1);
  assert.equal(blueberries.listed, 1);   // #1253 is one of the entries
});

test("a machine with no metadata keeps its price and loses only its picture", () => {
  const s = composeSnapshot(withGrid);
  assert.equal(s.rows[0].inked.entries[1].machine, null);   // #999 is not in the meta map
  assert.equal(s.rows[0].inked.entries[1].priceEth, 2.4);

  const missing = composeSnapshot({ ...withGrid, meta: new Map() });
  assert.equal(missing.rows[0].inked.entries[0].machine, null);
  assert.equal(missing.rows[0].inked.floorEth, 2.0);
});

test("an empty cell composes to an empty book, never to a missing one", () => {
  const s = composeSnapshot(withGrid);
  assert.deepEqual(s.rows[0].dormant.entries, []);
});

test("the rarity legend travels with the snapshot", () => {
  const s = composeSnapshot(withGrid);
  assert.deepEqual(s.legend, withGrid.legend);
});

// ---- chiffres de collection ----

const withStats = {
  ...withGrid,
  stats: { floor: 0.0869, symbol: "ETH", volume: 425.576, sales: 18124, owners: 2624, volume24h: 136.67, sales24h: 1896 },
  grid: {
    ...withGrid.grid,
    rows: [
      { ...withGrid.grid.rows[0],
        inked:   { ...withGrid.grid.rows[0].inked, floorEth: 2.0 },
        dormant: { ...withGrid.grid.rows[0].dormant, floorEth: 2.5, entries: [{ tokenId: 5, priceEth: 2.5 }] } },
      { classLabel: "x1", classValue: 100, docCount: 7131, chainCount: 7131, spreadEth: null,
        inked:   { floorEth: 0.094, floorTokenId: 1, pelotonEth: null, listed: 1, supply: 10, listedRatio: 0.1, entries: [{ tokenId: 1, priceEth: 0.094 }] },
        dormant: { floorEth: null, floorTokenId: null, pelotonEth: null, listed: 0, supply: 10, listedRatio: 0, entries: [] } },
    ],
  },
};

test("the collection floor is the cheapest machine anywhere on the board", () => {
  const s = composeSnapshot(withStats);
  assert.equal(s.collection.floorEth, 0.094);
  assert.ok(Math.abs(s.collection.floorUsd - 0.094 * 1883.24) < 0.01);
});

test("the collection's market cap is the floor across all ten thousand machines", () => {
  const s = composeSnapshot(withStats);
  assert.ok(Math.abs(s.collection.marketCapEth - 940) < 1e-9);   // 0.094 x 10,000
  assert.equal(s.collection.machines, 10000);
});

test("traded volume rides along in both currencies", () => {
  const s = composeSnapshot(withStats);
  assert.equal(s.collection.volumeEth, 425.576);
  assert.ok(Math.abs(s.collection.volumeUsd - 425.576 * 1883.24) < 1);
  assert.equal(s.collection.sales, 18124);
  assert.equal(s.collection.volume24hEth, 136.67);
});

test("a board with no floor anywhere yields no floor and no market cap, not zero", () => {
  const empty = {
    ...withStats,
    grid: { ...withStats.grid, rows: [{ classLabel: "x1", classValue: 100, docCount: 1, chainCount: 1, spreadEth: null,
      inked:   { floorEth: null, floorTokenId: null, pelotonEth: null, listed: 0, supply: 1, listedRatio: 0, entries: [] },
      dormant: { floorEth: null, floorTokenId: null, pelotonEth: null, listed: 0, supply: 1, listedRatio: 0, entries: [] } }] },
  };
  const s = composeSnapshot(empty);
  assert.equal(s.collection.floorEth, null);
  assert.equal(s.collection.marketCapEth, null);
  assert.equal(s.collection.floorUsd, null);
});

test("the published floor still rides along, still labelled as uncomputed-with", () => {
  const s = composeSnapshot(withStats);
  assert.equal(s.collection.publishedFloor, 0.0869);
  assert.equal(s.collection.publishedFloorUsedInComputation, false);
});

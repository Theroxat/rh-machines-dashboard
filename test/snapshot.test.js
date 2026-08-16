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
  publishedFloor: { floor: 0.0889891, symbol: "ETH" },
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

test("the published floor rides along but is marked as uncomputed-with", () => {
  const s = composeSnapshot(base);
  assert.equal(s.publishedFloor.floor, 0.0889891);
  assert.equal(s.publishedFloor.usedInComputation, false);
});

const withGrid = {
  ...base,
  grid: {
    ...base.grid,
    rows: [{
      classLabel: "x10", classValue: 1000, docCount: 37, chainCount: 37, spreadEth: -0.5,
      inked:   { floorEth: 2.0, floorTokenId: 1253, pelotonEth: 2.25, listed: 9, supply: 33, listedRatio: 0.27 },
      dormant: { floorEth: 2.5, floorTokenId: null, pelotonEth: null, listed: 0, supply: 4, listedRatio: 0 },
    }],
  },
  meta: new Map([[1253, { image: "https://img/1253.webp", headwear: "Blueberries", body: "Cobalt Stripe" }]]),
  legend: { byClass: [], headwearClass: new Map(), ambiguous: [], unpaired: 0 },
};

test("the machine that sets a floor carries its picture and its headwear", () => {
  const s = composeSnapshot(withGrid);
  assert.deepEqual(s.rows[0].inked.machine, {
    image: "https://img/1253.webp", headwear: "Blueberries", body: "Cobalt Stripe",
  });
});

test("a cell with no floor gets no machine, and one with no metadata gets null", () => {
  const s = composeSnapshot(withGrid);
  assert.equal(s.rows[0].dormant.machine, null);

  const missing = composeSnapshot({ ...withGrid, meta: new Map() });
  assert.equal(missing.rows[0].inked.machine, null);
  assert.equal(missing.rows[0].inked.floorEth, 2.0);   // a missing picture costs no price
});

test("the rarity legend travels with the snapshot", () => {
  const s = composeSnapshot(withGrid);
  assert.deepEqual(s.legend, withGrid.legend);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { valueWallet, floorFor } from "../src/worth.js";

const ROWS = [
  { classValue: 100, inked: { floorEth: 0.05 }, dormant: { floorEth: 0.04 } },
  { classValue: 1000, inked: { floorEth: 1.5 }, dormant: { floorEth: null } },
];
const m = (tokenId, classValue, weight, insideUsd = 0) =>
  ({ tokenId, classValue, weight, holds: insideUsd ? { usd: insideUsd } : null });

test("a machine is worth the better of its class floor and the anvil's bid", () => {
  // floor x1 inkée = $100, l'anvil paie $220 → l'anvil
  const w = valueWallet({ machines: [m(1, 100, 100)], rows: ROWS, ethUsd: 2000, anvilBidUsd: 220 });
  assert.equal(w.lines[0].machineUsd, 220);
  assert.equal(w.lines[0].basis, "anvil");

  // floor x10 inkée = $3000, l'anvil paie toujours $220 → le floor
  const big = valueWallet({ machines: [m(2, 1000, 1000)], rows: ROWS, ethUsd: 2000, anvilBidUsd: 220 });
  assert.equal(big.lines[0].machineUsd, 3000);
  assert.equal(big.lines[0].basis, "floor");
});

test("a dormant machine is valued against dormant listings, not inked ones", () => {
  assert.equal(floorFor(ROWS, 100, "dormant", 2000), 80);
  assert.equal(floorFor(ROWS, 100, "inked", 2000), 100);
});

// On ne devine pas un prix sur un marché vide.
test("a machine nobody sells and the anvil will not bid on is left out of the total", () => {
  const w = valueWallet({ machines: [m(1, 1000, 0)], rows: ROWS, ethUsd: 2000, anvilBidUsd: null });
  assert.equal(w.lines[0].machineUsd, null);
  assert.equal(w.unpriced, 1);
  assert.equal(w.machinesUsd, null);
});

// Les actions dans le compte partent avec la machine : elles comptent une fois.
test("everything a wallet holds is counted, each in its own place", () => {
  const w = valueWallet({
    machines: [m(1, 100, 100, 12.5), m(2, 100, 100, 7.5)],
    rows: ROWS, ethUsd: 2000, anvilBidUsd: 220,
    printer: { amount: 11104, usd: 0.011 },
    ownStock: [{ symbol: "NVDA", amount: 0.14, usd: 30 }],
  });
  assert.equal(w.machinesUsd, 440);
  assert.equal(w.insideUsd, 20);
  assert.equal(w.printerUsd.toFixed(2), "122.14");
  assert.equal(w.stockUsd, 30);
  assert.equal(w.total.toFixed(2), "612.14");
});

test("a wallet holding no token claims no token value", () => {
  const w = valueWallet({ machines: [m(1, 100, 100)], rows: ROWS, ethUsd: 2000, anvilBidUsd: 220 });
  assert.equal(w.printerUsd, null);
  assert.equal(w.stockUsd, null);
  assert.equal(w.insideUsd, null);
  assert.equal(w.total, 220);
});

test("an empty wallet is worth nothing knowable, not zero", () => {
  const w = valueWallet({ machines: [], rows: ROWS, ethUsd: 2000, anvilBidUsd: 220 });
  assert.equal(w.total, null);
  assert.equal(w.machinesUsd, null);
});

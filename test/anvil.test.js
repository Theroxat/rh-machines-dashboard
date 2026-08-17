import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { readAnvil, ANVIL_ABI } from "../src/anvil.js";

// Un contrat de façade : chaque test énonce ce que la chaîne répond.
const fakeProvider = (answers) => ({
  call: async ({ data }) => {
    const fn = ANVIL_ABI.getFunction(data.slice(0, 10))?.name;
    if (!(fn in answers)) return "0x";
    return ANVIL_ABI.encodeFunctionResult(fn, [answers[fn]]);
  },
});

const GLOBALS = {
  spot: 16082n * 10n ** 18n,
  spreadBps: 500n,
  stepBps: 200n,
  snipeBps: 1000n,
  inventoryLength: 30n,
  cratePrice: 21331n * 10n ** 18n,
  shelfAverage: 20315n * 10n ** 18n,
  paused: false,
  bidPaused: false,
};

test("the anvil's published numbers are read as they are", async () => {
  const a = await readAnvil({ provider: fakeProvider(GLOBALS), aggregate3: async () => [], tokenIds: [] });
  assert.equal(a.spotPrinter, 16082);
  assert.equal(a.spreadBps, 500);
  assert.equal(a.shelf, 30);
  assert.equal(a.paused, false);
  assert.equal(a.bidPaused, false);
});

test("a bid is read for every machine asked about", async () => {
  const iface = new ethers.Interface(["function sellPrice(uint256) view returns (uint256)"]);
  const aggregate3 = async (calls) =>
    calls.map(() => [true, iface.encodeFunctionResult("sellPrice", [19316n * 10n ** 18n])]);
  const a = await readAnvil({ provider: fakeProvider(GLOBALS), aggregate3, tokenIds: [1, 2, 3] });
  assert.equal(a.bids.size, 3);
  assert.equal(a.bids.get(2), 19316);
});

// Une offre suspendue n'est pas une offre à zéro : la page doit pouvoir le dire
// plutôt que d'afficher un plancher qui n'existe plus.
test("a paused bid is reported as paused, not as a bid of nothing", async () => {
  const a = await readAnvil({
    provider: fakeProvider({ ...GLOBALS, bidPaused: true }),
    aggregate3: async () => [], tokenIds: [],
  });
  assert.equal(a.bidPaused, true);
});

test("a view the contract does not answer leaves null, never zero", async () => {
  const partial = { ...GLOBALS };
  delete partial.cratePrice;
  const a = await readAnvil({ provider: fakeProvider(partial), aggregate3: async () => [], tokenIds: [] });
  assert.equal(a.cratePrinter, null);
  assert.equal(a.spotPrinter, 16082);
});

test("a bid that fails to read leaves that machine out rather than at zero", async () => {
  const iface = new ethers.Interface(["function sellPrice(uint256) view returns (uint256)"]);
  const aggregate3 = async (calls) =>
    calls.map((_, i) => (i === 0 ? [false, "0x"] : [true, iface.encodeFunctionResult("sellPrice", [100n * 10n ** 18n])]));
  const a = await readAnvil({ provider: fakeProvider(GLOBALS), aggregate3, tokenIds: [7, 8] });
  assert.equal(a.bids.has(7), false);
  assert.equal(a.bids.get(8), 100);
});

test("the shelf is read with the price asked for each machine on it", async () => {
  const provider = {
    call: async ({ data }) => {
      const fn = ANVIL_ABI.getFunction(data.slice(0, 10))?.name;
      if (fn === "listing") return ANVIL_ABI.encodeFunctionResult("listing", [[9036n, 9616n], [23465n * 10n ** 18n, 27733n * 10n ** 18n]]);
      if (fn in GLOBALS) return ANVIL_ABI.encodeFunctionResult(fn, [GLOBALS[fn]]);
      return "0x";
    },
  };
  const a = await readAnvil({ provider, aggregate3: async () => [], tokenIds: [] });
  assert.equal(a.shelfListings.size, 2);
  assert.equal(a.shelfListings.get(9036), 23465);
  assert.equal(a.shelfListings.get(9616), 27733);
});

test("a shelf that cannot be read is empty, not imagined", async () => {
  const a = await readAnvil({ provider: fakeProvider(GLOBALS), aggregate3: async () => [], tokenIds: [] });
  assert.equal(a.shelfListings.size, 0);
});


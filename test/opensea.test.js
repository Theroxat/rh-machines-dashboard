import { test } from "node:test";
import assert from "node:assert/strict";
import { weiToEth, priceEthOf, fetchListings, fetchCollectionStats } from "../src/opensea.js";

const listing = (id, wei, currency = "ETH") => ({
  order_hash: `0x${id}`,
  asset: { identifier: String(id) },
  price: { current: { currency, decimals: 18, value: String(wei) } },
});

// Un fetch écrit à la main. Chaque test énonce exactement ce que l'API renvoie.
const fakeFetch = (pages) => {
  let call = 0;
  return async () => {
    const page = pages[call++];
    if (!page) throw new Error("fetched more pages than the test provided");
    return { ok: true, status: 200, json: async () => page };
  };
};

test("wei converts to ETH without losing the low digits to float width", () => {
  assert.equal(weiToEth("88989100000000000", 18), 0.0889891);
  assert.equal(weiToEth("1", 18), 1e-18);
  assert.equal(weiToEth("0", 18), 0);
  assert.equal(weiToEth("1000000000000000000", 18), 1);
});

test("a listing priced in another currency has no ETH price", () => {
  assert.equal(priceEthOf(listing(1, "1000000000000000000")), 1);
  assert.equal(priceEthOf(listing(1, "1000000000000000000", "USDG")), null);
  assert.equal(priceEthOf({ price: { current: { currency: "ETH", decimals: 18, value: "abc" } } }), null);
  assert.equal(priceEthOf({}), null);
});

test("a token listed twice collapses to its cheapest listing", async () => {
  const res = await fetchListings({
    apiKey: "k",
    maxPages: 10,
    fetchImpl: fakeFetch([
      { listings: [listing(5504, "90000000000000000"), listing(5504, "88989100000000000")], next: null },
    ]),
  });
  assert.equal(res.listings.size, 1);
  assert.equal(res.listings.get(5504).priceEth, 0.0889891);
});

test("the cursor is followed until the book is exhausted", async () => {
  const res = await fetchListings({
    apiKey: "k",
    maxPages: 10,
    fetchImpl: fakeFetch([
      { listings: [listing(1, "1000000000000000000")], next: "cursor-2" },
      { listings: [listing(2, "2000000000000000000")], next: null },
    ]),
  });
  assert.equal(res.pages, 2);
  assert.deepEqual([...res.listings.keys()].sort((a, b) => a - b), [1, 2]);
});

test("a book that outruns maxPages throws rather than returning a short answer", async () => {
  await assert.rejects(
    fetchListings({
      apiKey: "k",
      maxPages: 1,
      fetchImpl: fakeFetch([{ listings: [listing(1, "1")], next: "more" }]),
    }),
    /not exhausted/,
  );
});

test("an HTTP error is raised, never swallowed into an empty book", async () => {
  await assert.rejects(
    fetchListings({
      apiKey: "k",
      maxPages: 10,
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
    }),
    /429/,
  );
});

test("unreadable and foreign-currency listings are skipped and counted", async () => {
  const res = await fetchListings({
    apiKey: "k",
    maxPages: 10,
    fetchImpl: fakeFetch([
      {
        listings: [
          listing(1, "1000000000000000000"),
          listing(2, "1000000000000000000", "USDG"),
          { asset: { identifier: "not-a-number" }, price: { current: { currency: "ETH", decimals: 18, value: "1" } } },
        ],
        next: null,
      },
    ]),
  });
  assert.equal(res.listings.size, 1);
  assert.equal(res.skipped.foreignCurrency, 1);
  assert.equal(res.skipped.unreadable, 1);
});

test("collection stats carry volume and sales, not only the published floor", async () => {
  const stats = await fetchCollectionStats({
    apiKey: "k",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
      total: { volume: 425.576, sales: 18124, num_owners: 2624, floor_price: 0.0889891, floor_price_symbol: "ETH" },
      intervals: [
        { interval: "one_day", volume: 136.67, sales: 1896 },
        { interval: "seven_day", volume: 425.576, sales: 18124 },
      ],
    }) }),
  });
  assert.equal(stats.volume, 425.576);
  assert.equal(stats.sales, 18124);
  assert.equal(stats.volume24h, 136.67);
  assert.equal(stats.sales24h, 1896);
  assert.equal(stats.floor, 0.0889891);
});

test("a stat that is absent or unreadable is null, never zero", async () => {
  const stats = await fetchCollectionStats({
    apiKey: "k",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ total: { volume: "425.576" } }) }),
  });
  assert.equal(stats.volume, null);      // une chaîne n'est pas un nombre lu
  assert.equal(stats.sales, null);
  assert.equal(stats.volume24h, null);   // pas d'intervalle d'un jour dans la réponse
  assert.equal(stats.floor, null);
});

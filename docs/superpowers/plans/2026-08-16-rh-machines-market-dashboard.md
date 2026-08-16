# RH MACHINES Market Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only web dashboard showing, for the `rh-machines` collection, the floor and market depth of each sealed rarity class split by ink state, priced against live $PRINTER and ETH.

**Architecture:** A Node service runs two independent loops — a fast one over the OpenSea book and prices (60 s), a slow one over `inkBurned` for all 10,000 Machines (10 min) — feeding a snapshot store that a plain HTTP server renders. All market logic lives in one pure module, `floors.js`, which takes plain data and returns plain data; every other module is a reader that does one thing and reports failure as failure.

**Tech Stack:** Node 22 (ESM), `ethers` v6 for chain reads, built-in `node --test` runner, no framework, no frontend build step. Docker + docker compose for deployment.

**Spec:** `docs/superpowers/specs/2026-08-16-rh-machines-market-dashboard-design.md`

## Global Constraints

- Node **>= 22**. ESM only (`"type": "module"`). The only runtime dependency is `ethers` ^6.13.0.
- All user-facing copy — dashboard, HTTP responses, README — is in **English**. Code comments may be French or English; be consistent within a file.
- Chain: Robinhood Chain, id **4663**, RPC `https://rpc.mainnet.chain.robinhood.com`.
- Contracts: `MACHINES 0xB509e195bcB3E4461e235Ff152c68D66915f67b5`, `MINE 0x3C4E763E87Ac5775A23aE2eb2e69F90232f413E1`, `TRAITS 0x8a0833f41cE9e869d6ebd8aC16EfDC9Ee7a38a22`, `TOKEN 0x85a574f2fF0795685F58d1D7B0D4b51F148Ac489`, `MULTICALL3 0xcA11bde05977b3631167028862bE2a173976CA11`.
- Canonical USDG is `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`. WETH is `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`. A second token also symbolised `USDG` (`0x63575aA902DE35ef2dc3a3D32355233bbb44CDa7`) exists and prices ETH 5% wrong — never select a pair by symbol or by liquidity.
- Sealed rarity is read from **TRAITS**`.weightOf`, never from `MINE.weightOf` (which returns effective weight including ink).
- Never substitute a default for a value that could not be read. Unreadable means `null`, excluded, and counted.
- Never publish a number computed from a partial read: a truncated listings book throws rather than returning short.
- Port **3050**. `OPENSEA_API_KEY` comes from `.env` (gitignored, already present).
- No test performs network or chain I/O. Every reader takes its transport (`fetchImpl`, `aggregate3`) as an injectable parameter.

---

### Task 1: Project skeleton and config

**Files:**
- Create: `package.json`, `config.json`, `src/config.js`, `test/config.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `CHAIN_ID`, `RPC_URL`, `ADDRESSES`, `OPENSEA`, `DEX`, `CLASSES`, `CLASS_BY_VALUE`, `loadConfig(env, raw) -> frozen config`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rh-machines-dashboard",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "ethers": "^6.13.0"
  }
}
```

Run `npm install`.

- [ ] **Step 2: Create `config.json`**

```json
{
  "port": 3050,
  "bookPollIntervalMs": 60000,
  "inkPollIntervalMs": 600000,
  "pelotonSize": 5,
  "multicallBatchSize": 500,
  "maxBookPages": 200
}
```

- [ ] **Step 3: Write the failing test — `test/config.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, CLASSES, CLASS_BY_VALUE } from "../src/config.js";

const RAW = {
  port: 3050,
  bookPollIntervalMs: 60000,
  inkPollIntervalMs: 600000,
  pelotonSize: 5,
  multicallBatchSize: 500,
  maxBookPages: 200,
};

test("the seven sealed classes are declared in ascending order", () => {
  assert.deepEqual(CLASSES.map((c) => c.value), [100, 150, 200, 300, 400, 600, 1000]);
  assert.deepEqual(CLASSES.map((c) => c.label), ["x1", "x1.5", "x2", "x3", "x4", "x6", "x10"]);
  assert.equal(CLASSES.reduce((n, c) => n + c.docCount, 0), 10000);
  assert.equal(CLASS_BY_VALUE.get(600).label, "x6");
});

test("a valid environment yields a frozen config", () => {
  const cfg = loadConfig({ OPENSEA_API_KEY: "k" }, RAW);
  assert.equal(cfg.openseaApiKey, "k");
  assert.equal(cfg.port, 3050);
  assert.ok(Object.isFrozen(cfg));
});

test("a missing API key is refused rather than defaulted", () => {
  assert.throws(() => loadConfig({}, RAW), /OPENSEA_API_KEY/);
  assert.throws(() => loadConfig({ OPENSEA_API_KEY: "   " }, RAW), /OPENSEA_API_KEY/);
});

test("an out-of-range tunable is refused", () => {
  assert.throws(() => loadConfig({ OPENSEA_API_KEY: "k" }, { ...RAW, pelotonSize: 1 }), /pelotonSize/);
  assert.throws(() => loadConfig({ OPENSEA_API_KEY: "k" }, { ...RAW, port: 0 }), /port/);
  assert.throws(() => loadConfig({ OPENSEA_API_KEY: "k" }, { ...RAW, bookPollIntervalMs: "60000" }), /bookPollIntervalMs/);
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../src/config.js'`.

- [ ] **Step 5: Write `src/config.js`**

```js
export const CHAIN_ID = 4663;
export const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

export const ADDRESSES = Object.freeze({
  MACHINES:   "0xB509e195bcB3E4461e235Ff152c68D66915f67b5",
  MINE:       "0x3C4E763E87Ac5775A23aE2eb2e69F90232f413E1",
  TRAITS:     "0x8a0833f41cE9e869d6ebd8aC16EfDC9Ee7a38a22",
  TOKEN:      "0x85a574f2fF0795685F58d1D7B0D4b51F148Ac489",
  MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  USDG:       "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  WETH:       "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
});

export const TOTAL_MACHINES = 10000;

export const OPENSEA = Object.freeze({
  base: "https://api.opensea.io/api/v2",
  slug: "rh-machines",
  chain: "robinhood",
  itemUrl: (tokenId) =>
    `https://opensea.io/assets/robinhood/${ADDRESSES.MACHINES.toLowerCase()}/${tokenId}`,
});

// Both pairs are pinned by address. Selecting either by symbol or by depth
// lands on the impostor USDG (0x63575aA9...), which prices ETH 5% wrong.
export const DEX = Object.freeze({
  base: "https://api.dexscreener.com/latest/dex/pairs/robinhood",
  printerPair: "0xf6c9f0a8bf94ecda6751465a3097bc4c69914421126d2cbc3df723e36b8cf47b",
  ethPair: "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca",
  coingecko: "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
  usdgDepegTolerance: 0.03,
});

/** Sealed rarity classes. docCount is the published census, used only as a
 *  cross-check against what the chain actually returns — never as a source. */
export const CLASSES = Object.freeze([
  { value: 100,  label: "x1",   docCount: 7131 },
  { value: 150,  label: "x1.5", docCount: 407  },
  { value: 200,  label: "x2",   docCount: 1356 },
  { value: 300,  label: "x3",   docCount: 559  },
  { value: 400,  label: "x4",   docCount: 429  },
  { value: 600,  label: "x6",   docCount: 81   },
  { value: 1000, label: "x10",  docCount: 37   },
]);

export const CLASS_BY_VALUE = new Map(CLASSES.map((c) => [c.value, c]));

export function loadConfig(env, raw) {
  const fail = (m) => { throw new Error(`invalid config: ${m}`); };

  const key = (env.OPENSEA_API_KEY || "").trim();
  if (!key) fail("OPENSEA_API_KEY is empty or absent");

  const num = (name, min, max) => {
    const v = raw[name];
    if (typeof v !== "number" || !Number.isFinite(v)) fail(`${name} must be a number`);
    if (v < min || v > max) fail(`${name} must be between ${min} and ${max}`);
    return v;
  };

  return Object.freeze({
    openseaApiKey: key,
    port:                num("port", 1, 65535),
    bookPollIntervalMs:  num("bookPollIntervalMs", 10000, 3600000),
    inkPollIntervalMs:   num("inkPollIntervalMs", 60000, 86400000),
    pelotonSize:         num("pelotonSize", 3, 50),
    multicallBatchSize:  num("multicallBatchSize", 50, 1000),
    maxBookPages:        num("maxBookPages", 1, 5000),
  });
}
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/config.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json config.json src/config.js test/config.test.js
git commit -m "feat: pin every address the dashboard reads, including the right USDG"
```

---

### Task 2: The OpenSea book reader

**Files:**
- Create: `src/opensea.js`, `test/opensea.test.js`, `test/fixtures/book-page.json`

**Interfaces:**
- Consumes: `OPENSEA` from `src/config.js`.
- Produces:
  - `weiToEth(value: string, decimals: number) -> number`
  - `priceEthOf(listing) -> number | null`
  - `fetchListings({ apiKey, slug?, fetchImpl?, maxPages }) -> Promise<{ listings: Map<number, {tokenId, priceEth, orderHash}>, pages: number, skipped: {foreignCurrency: number, unreadable: number} }>`
  - `fetchPublishedFloor({ apiKey, slug?, fetchImpl? }) -> Promise<{ floor: number|null, symbol: string|null }>`

- [ ] **Step 1: Write the failing test — `test/opensea.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { weiToEth, priceEthOf, fetchListings } from "../src/opensea.js";

const listing = (id, wei, currency = "ETH") => ({
  order_hash: `0x${id}`,
  asset: { identifier: String(id) },
  price: { current: { currency, decimals: 18, value: String(wei) } },
});

// A hand-rolled fetch. Every test states exactly what the API returns.
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/opensea.test.js`
Expected: FAIL — `Cannot find module '../src/opensea.js'`.

- [ ] **Step 3: Write `src/opensea.js`**

```js
import { OPENSEA } from "./config.js";

/** String arithmetic on the way in: 8.9e16 exceeds the exact integer range of
 *  a double, so BigInt -> Number before scaling would round the low digits. */
export function weiToEth(value, decimals) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const padded = value.padStart(decimals + 1, "0");
  const cut = padded.length - decimals;
  return Number(`${padded.slice(0, cut)}.${padded.slice(cut)}`);
}

export function priceEthOf(listing) {
  const p = listing?.price?.current;
  if (!p || p.currency !== "ETH") return null;
  return weiToEth(p.value, Number(p.decimals));
}

export async function fetchListings({ apiKey, slug = OPENSEA.slug, fetchImpl = fetch, maxPages }) {
  const cheapest = new Map();
  const skipped = { foreignCurrency: 0, unreadable: 0 };
  let next = null;
  let pages = 0;

  do {
    const url = new URL(`${OPENSEA.base}/listings/collection/${slug}/all`);
    url.searchParams.set("limit", "100");
    if (next) url.searchParams.set("next", next);

    const res = await fetchImpl(url.toString(), {
      headers: { "x-api-key": apiKey, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OpenSea returned ${res.status} on page ${pages + 1}`);

    const body = await res.json();
    for (const l of body?.listings ?? []) {
      const tokenId = Number(l?.asset?.identifier);
      const priceEth = priceEthOf(l);
      if (!Number.isInteger(tokenId) || tokenId <= 0) { skipped.unreadable++; continue; }
      if (priceEth === null) {
        if (l?.price?.current?.currency && l.price.current.currency !== "ETH") skipped.foreignCurrency++;
        else skipped.unreadable++;
        continue;
      }
      const prev = cheapest.get(tokenId);
      if (!prev || priceEth < prev.priceEth) {
        cheapest.set(tokenId, { tokenId, priceEth, orderHash: l.order_hash ?? null });
      }
    }

    next = body?.next || null;
    pages++;
  } while (next && pages < maxPages);

  // A short book silently lowers or raises every floor on the page. Refuse.
  if (next) throw new Error(`listings book not exhausted after ${maxPages} pages`);

  return { listings: cheapest, pages, skipped };
}

/** Displayed for comparison only. Measured on this chain at ~10x the real
 *  book, so it must never feed a computation. */
export async function fetchPublishedFloor({ apiKey, slug = OPENSEA.slug, fetchImpl = fetch }) {
  const res = await fetchImpl(`${OPENSEA.base}/collections/${slug}/stats`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`OpenSea stats returned ${res.status}`);
  const body = await res.json();
  const floor = body?.total?.floor_price;
  return {
    floor: typeof floor === "number" ? floor : null,
    symbol: body?.total?.floor_price_symbol ?? null,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/opensea.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/opensea.js test/opensea.test.js
git commit -m "feat: read the book to exhaustion, or refuse to answer at all"
```

---

### Task 3: `floors.js` — the pure core

This is the module that holds every rule from the spec that is a computation. It touches no network, no disk, no clock.

**Files:**
- Create: `src/floors.js`, `test/floors.test.js`

**Interfaces:**
- Consumes: `CLASSES` from `src/config.js`; the `listings` Map produced by Task 2.
- Produces:
  - `median(values: number[]) -> number | null`
  - `buildGrid({ listings, traits, ink, pelotonSize }) -> Grid`

```
traits : Map<number, { weightClass: number|null, desk: number|null }>
ink    : Map<number, bigint>
Grid   : {
  rows: Array<{
    classValue, classLabel, docCount, chainCount,
    inked: Cell, dormant: Cell,
    spreadEth: number | null
  }>,
  excluded: { unknownRarity, unknownInk, listingsOffGrid },
  totals: { inked, dormant, listed }
}
Cell   : { floorEth, floorTokenId, pelotonEth, listed, supply, listedRatio }
```

- [ ] **Step 1: Write the failing test — `test/floors.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, median } from "../src/floors.js";

// Builders keep each test's intent legible: only what the test varies is named.
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
  assert.equal(x1.inked.floorEth, 0.001);   // the dust is the actionable price
  assert.equal(x1.inked.pelotonEth, 0.11);  // and it does not move the market level
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
  assert.equal(rowOf(grid, "x6").spreadEth, null); // inked only, no dormant floor
});

test("every one of the seven classes is present even with no data at all", () => {
  const grid = buildGrid({ traits: new Map(), ink: new Map(), listings: new Map(), pelotonSize: 5 });
  assert.equal(grid.rows.length, 7);
  assert.deepEqual(grid.rows.map((r) => r.classLabel), ["x1", "x1.5", "x2", "x3", "x4", "x6", "x10"]);
  assert.equal(grid.rows[0].inked.floorEth, null);
  assert.equal(grid.rows[0].inked.listedRatio, null); // no supply: a ratio would be a division by zero
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/floors.test.js`
Expected: FAIL — `Cannot find module '../src/floors.js'`.

- [ ] **Step 3: Write `src/floors.js`**

```js
import { CLASSES } from "./config.js";

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const EMPTY = () => ({
  floorEth: null, floorTokenId: null, pelotonEth: null,
  listed: 0, supply: 0, listedRatio: null,
});

function buildCell(entries, supply, pelotonSize) {
  const cell = EMPTY();
  cell.supply = supply;
  cell.listed = entries.length;
  cell.listedRatio = supply > 0 ? entries.length / supply : null;
  if (!entries.length) return cell;

  // Price first, then token id: two listings at the same price must always
  // produce the same floor, run after run.
  const sorted = [...entries].sort((a, b) => a.priceEth - b.priceEth || a.tokenId - b.tokenId);
  cell.floorEth = sorted[0].priceEth;
  cell.floorTokenId = sorted[0].tokenId;
  cell.pelotonEth = sorted.length >= pelotonSize
    ? median(sorted.slice(0, pelotonSize).map((e) => e.priceEth))
    : null;
  return cell;
}

export function buildGrid({ listings, traits, ink, pelotonSize }) {
  const excluded = { unknownRarity: 0, unknownInk: 0, listingsOffGrid: 0 };
  const stateOf = new Map();   // tokenId -> "inked" | "dormant"
  const classOf = new Map();   // tokenId -> weightClass
  const supply = new Map();    // "class:state" -> count

  for (const [tokenId, t] of traits) {
    if (t?.weightClass == null) { excluded.unknownRarity++; continue; }
    const burned = ink.get(tokenId);
    if (burned == null) { excluded.unknownInk++; continue; }
    const state = burned > 0n ? "inked" : "dormant";
    stateOf.set(tokenId, state);
    classOf.set(tokenId, t.weightClass);
    const k = `${t.weightClass}:${state}`;
    supply.set(k, (supply.get(k) ?? 0) + 1);
  }

  const byCell = new Map();    // "class:state" -> entries[]
  for (const entry of listings.values()) {
    const state = stateOf.get(entry.tokenId);
    const wc = classOf.get(entry.tokenId);
    // Listed, but its rarity or its ink was never read: it cannot be placed,
    // and guessing a cell would silently move that cell's floor.
    if (state === undefined || wc === undefined) { excluded.listingsOffGrid++; continue; }
    const k = `${wc}:${state}`;
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(entry);
  }

  const rows = CLASSES.map((c) => {
    const inked = buildCell(byCell.get(`${c.value}:inked`) ?? [], supply.get(`${c.value}:inked`) ?? 0, pelotonSize);
    const dormant = buildCell(byCell.get(`${c.value}:dormant`) ?? [], supply.get(`${c.value}:dormant`) ?? 0, pelotonSize);
    return {
      classValue: c.value,
      classLabel: c.label,
      docCount: c.docCount,
      chainCount: inked.supply + dormant.supply,
      inked,
      dormant,
      spreadEth: inked.floorEth !== null && dormant.floorEth !== null
        ? inked.floorEth - dormant.floorEth
        : null,
    };
  });

  return {
    rows,
    excluded,
    totals: {
      inked: rows.reduce((n, r) => n + r.inked.supply, 0),
      dormant: rows.reduce((n, r) => n + r.dormant.supply, 0),
      listed: rows.reduce((n, r) => n + r.inked.listed + r.dormant.listed, 0),
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/floors.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/floors.js test/floors.test.js
git commit -m "feat: fourteen floors, and a null wherever a number would be a lie"
```

---

### Task 4: Chain readers — multicall, traits, ink

**Files:**
- Create: `src/multicall.js`, `src/traits.js`, `src/ink.js`, `test/multicall.test.js`, `test/traits.test.js`

**Interfaces:**
- Consumes: `ADDRESSES`, `TOTAL_MACHINES` from `src/config.js`.
- Produces:
  - `readUintMap({ aggregate3, iface, target, fn, ids, batchSize }) -> Promise<{ values: Map<number, bigint>, failures: number }>`
  - `readTraits({ provider, batchSize, total }) -> Promise<Map<number, {weightClass, desk}>>`
  - `loadTraits({ provider, cachePath, batchSize, total }) -> Promise<{ traits: Map, source: "cache"|"chain" }>`
  - `readInk({ provider, batchSize, total }) -> Promise<{ ink: Map<number, bigint>, failures: number }>`

- [ ] **Step 1: Write the failing test — `test/multicall.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { readUintMap } from "../src/multicall.js";

const iface = new ethers.Interface(["function value(uint256) view returns (uint256)"]);
const encode = (n) => iface.encodeFunctionResult("value", [n]);

test("ids are read in batches and merged into one map", async () => {
  const seen = [];
  const aggregate3 = async (calls) => {
    seen.push(calls.length);
    return calls.map((_, i) => [true, encode(100 + i)]);
  };
  const { values, failures } = await readUintMap({
    aggregate3, iface, target: "0x0", fn: "value", ids: [1, 2, 3, 4, 5], batchSize: 2,
  });
  assert.deepEqual(seen, [2, 2, 1]);
  assert.equal(values.size, 5);
  assert.equal(values.get(1), 100n);
  assert.equal(values.get(3), 100n);
  assert.equal(failures, 0);
});

test("a failed sub-call yields no entry at all, never a zero", async () => {
  const aggregate3 = async (calls) => calls.map((_, i) => (i === 0 ? [false, "0x"] : [true, encode(7)]));
  const { values, failures } = await readUintMap({
    aggregate3, iface, target: "0x0", fn: "value", ids: [1, 2], batchSize: 10,
  });
  assert.equal(values.has(1), false);
  assert.equal(values.get(2), 7n);
  assert.equal(failures, 1);
});

test("undecodable return data is a failure, not a guess", async () => {
  const aggregate3 = async (calls) => calls.map(() => [true, "0xdead"]);
  const { values, failures } = await readUintMap({
    aggregate3, iface, target: "0x0", fn: "value", ids: [1], batchSize: 10,
  });
  assert.equal(values.size, 0);
  assert.equal(failures, 1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/multicall.test.js`
Expected: FAIL — `Cannot find module '../src/multicall.js'`.

- [ ] **Step 3: Write `src/multicall.js`**

```js
import { ethers } from "ethers";

const MC3_ABI = [
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) view returns ((bool success,bytes returnData)[])",
];

export function multicallOf(provider, address) {
  const contract = new ethers.Contract(address, MC3_ABI, provider);
  return (calls) => contract.aggregate3(calls);
}

/**
 * Reads one uint-returning view over many ids.
 * A sub-call that fails, or whose data will not decode, produces no map entry.
 * The caller sees a missing id and can say so; a zero would be indistinguishable
 * from a machine that really holds nothing.
 */
export async function readUintMap({ aggregate3, iface, target, fn, ids, batchSize }) {
  const values = new Map();
  let failures = 0;

  for (let start = 0; start < ids.length; start += batchSize) {
    const chunk = ids.slice(start, start + batchSize);
    const res = await aggregate3(
      chunk.map((id) => ({ target, allowFailure: true, callData: iface.encodeFunctionData(fn, [id]) })),
    );
    chunk.forEach((id, i) => {
      const r = res[i];
      if (!r?.[0]) { failures++; return; }
      try {
        values.set(id, BigInt(iface.decodeFunctionResult(fn, r[1])[0]));
      } catch {
        failures++;
      }
    });
  }

  return { values, failures };
}
```

- [ ] **Step 4: Run the multicall tests**

Run: `node --test test/multicall.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing test for the traits cache — `test/traits.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCache, writeCache } from "../src/traits.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "rh-")), "traits.json");

test("a written cache reads back as the same map", () => {
  const path = tmp();
  const traits = new Map([[1, { weightClass: 100, desk: 3 }], [2, { weightClass: 1000, desk: 0 }]]);
  writeCache(path, traits);
  const back = readCache(path);
  assert.equal(back.size, 2);
  assert.deepEqual(back.get(2), { weightClass: 1000, desk: 0 });
});

test("a missing cache is not an error, just an absence", () => {
  assert.equal(readCache(join(tmpdir(), "definitely-absent-rh-cache.json")), null);
});

test("a corrupt cache is treated as absent rather than half-trusted", () => {
  const path = tmp();
  writeFileSync(path, "{ not json");
  assert.equal(readCache(path), null);
});

test("a cache entry with no rarity is dropped on read", () => {
  const path = tmp();
  writeFileSync(path, JSON.stringify({ 1: { weightClass: null, desk: 1 }, 2: { weightClass: 200, desk: 1 } }));
  const back = readCache(path);
  assert.equal(back.has(1), false);
  assert.equal(back.get(2).weightClass, 200);
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `node --test test/traits.test.js`
Expected: FAIL — `Cannot find module '../src/traits.js'`.

- [ ] **Step 7: Write `src/traits.js`**

```js
import { ethers } from "ethers";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ADDRESSES, TOTAL_MACHINES } from "./config.js";
import { readUintMap, multicallOf } from "./multicall.js";

const TRAITS_ABI = new ethers.Interface([
  "function weightOf(uint256) view returns (uint256)",
  "function sectorOf(uint256) view returns (uint8)",
]);

export function readCache(path) {
  let raw;
  try { raw = readFileSync(path, "utf8"); } catch { return null; }
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  const map = new Map();
  for (const [id, v] of Object.entries(obj)) {
    if (v?.weightClass == null) continue;          // an unknown rarity stays unknown
    map.set(Number(id), { weightClass: Number(v.weightClass), desk: v.desk ?? null });
  }
  return map;
}

export function writeCache(path, traits) {
  mkdirSync(dirname(path), { recursive: true });
  const obj = {};
  for (const [id, v] of traits) obj[id] = v;
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj));
  renameSync(tmp, path);                            // atomic: no half-written cache
}

/** The sealed map, read once. weightOf here is TRAITS' sealed class, not
 *  MINE's effective weight — they are different numbers on different contracts. */
export async function readTraits({ provider, batchSize, total = TOTAL_MACHINES }) {
  const aggregate3 = multicallOf(provider, ADDRESSES.MULTICALL3);
  const ids = Array.from({ length: total }, (_, i) => i + 1);

  const rarities = await readUintMap({
    aggregate3, iface: TRAITS_ABI, target: ADDRESSES.TRAITS, fn: "weightOf", ids, batchSize,
  });
  const desks = await readUintMap({
    aggregate3, iface: TRAITS_ABI, target: ADDRESSES.TRAITS, fn: "sectorOf", ids, batchSize,
  });

  const traits = new Map();
  for (const [id, wc] of rarities.values) {
    const desk = desks.values.get(id);
    traits.set(id, { weightClass: Number(wc), desk: desk === undefined ? null : Number(desk) });
  }
  return traits;
}

export async function loadTraits({ provider, cachePath, batchSize, total = TOTAL_MACHINES }) {
  const cached = readCache(cachePath);
  if (cached && cached.size >= total * 0.99) return { traits: cached, source: "cache" };
  const traits = await readTraits({ provider, batchSize, total });
  if (traits.size) writeCache(cachePath, traits);
  return { traits, source: "chain" };
}
```

- [ ] **Step 8: Write `src/ink.js`**

```js
import { ethers } from "ethers";
import { ADDRESSES, TOTAL_MACHINES } from "./config.js";
import { readUintMap, multicallOf } from "./multicall.js";

const MINE_ABI = new ethers.Interface([
  "function inkBurned(uint256) view returns (uint256)",
]);

/** Ink changes only when someone activates or re-inks, so this runs on its own
 *  slow loop. A machine whose ink could not be read is absent from the map, and
 *  floors.js excludes it rather than calling it dormant. */
export async function readInk({ provider, batchSize, total = TOTAL_MACHINES }) {
  const aggregate3 = multicallOf(provider, ADDRESSES.MULTICALL3);
  const ids = Array.from({ length: total }, (_, i) => i + 1);
  const { values, failures } = await readUintMap({
    aggregate3, iface: MINE_ABI, target: ADDRESSES.MINE, fn: "inkBurned", ids, batchSize,
  });
  return { ink: values, failures };
}
```

- [ ] **Step 9: Run the full suite**

Run: `node --test test/`
Expected: PASS, all tests from Tasks 1–4.

- [ ] **Step 10: Commit**

```bash
git add src/multicall.js src/traits.js src/ink.js test/multicall.test.js test/traits.test.js
git commit -m "feat: read ten thousand machines, and leave a hole where a read failed"
```

---

### Task 5: Prices

**Files:**
- Create: `src/prices.js`, `test/prices.test.js`

**Interfaces:**
- Consumes: `DEX`, `ADDRESSES` from `src/config.js`.
- Produces:
  - `fetchPrinter(fetchImpl?) -> Promise<{ usd, change24h, liquidityUsd, fdv }>`
  - `fetchEthUsd(fetchImpl?) -> Promise<{ usd, local, coingecko, spreadPct }>`

- [ ] **Step 1: Write the failing test — `test/prices.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPrinter, fetchEthUsd } from "../src/prices.js";
import { ADDRESSES } from "../src/config.js";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

const ethPair = (over = {}) => ({
  pairs: [{
    baseToken: { address: ADDRESSES.USDG, symbol: "USDG" },
    quoteToken: { address: ADDRESSES.WETH, symbol: "WETH" },
    priceNative: "0.0005310",
    priceUsd: "1.0012",
    ...over,
  }],
});

test("the printer price is read with its context", async () => {
  const p = await fetchPrinter(async () => ok({
    pairs: [{ priceUsd: "0.01260", priceChange: { h24: 598 }, liquidity: { usd: 427948.51 }, fdv: 2165143 }],
  }));
  assert.equal(p.usd, 0.0126);
  assert.equal(p.change24h, 598);
  assert.equal(p.liquidityUsd, 427948.51);
});

test("an absent pair is an error, not a price of zero", async () => {
  await assert.rejects(fetchPrinter(async () => ok({ pairs: [] })), /PRINTER/);
});

test("ETH is priced from the pool and cross-checked against coingecko", async () => {
  const res = await fetchEthUsd(async (url) =>
    ok(String(url).includes("coingecko") ? { ethereum: { usd: 1883.81 } } : ethPair()),
  );
  assert.ok(Math.abs(res.local - 1885.5) < 1);   // (1 / 0.0005310) * 1.0012
  assert.equal(res.coingecko, 1883.81);
  assert.ok(res.spreadPct < 0.5);
  assert.equal(res.usd, res.local);              // the on-chain pool is the source
});

test("a pair whose tokens are not the expected addresses is refused outright", async () => {
  await assert.rejects(
    fetchEthUsd(async (url) =>
      ok(String(url).includes("coingecko")
        ? { ethereum: { usd: 1883.81 } }
        : ethPair({ baseToken: { address: "0x63575aA902DE35ef2dc3a3D32355233bbb44CDa7", symbol: "USDG" } })),
    ),
    /unexpected token/i,
  );
});

test("a depegged USDG invalidates the whole conversion", async () => {
  await assert.rejects(
    fetchEthUsd(async (url) =>
      ok(String(url).includes("coingecko") ? { ethereum: { usd: 1883.81 } } : ethPair({ priceUsd: "1.053" })),
    ),
    /depeg/i,
  );
});

test("coingecko being unreachable does not take the pool price down with it", async () => {
  const res = await fetchEthUsd(async (url) => {
    if (String(url).includes("coingecko")) throw new Error("network down");
    return ok(ethPair());
  });
  assert.ok(res.local > 1800);
  assert.equal(res.coingecko, null);
  assert.equal(res.spreadPct, null);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/prices.test.js`
Expected: FAIL — `Cannot find module '../src/prices.js'`.

- [ ] **Step 3: Write `src/prices.js`**

```js
import { DEX, ADDRESSES } from "./config.js";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function pair(url, fetchImpl, label) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`DexScreener returned ${res.status} for ${label}`);
  const body = await res.json();
  const p = body?.pairs?.[0];
  if (!p) throw new Error(`${label} pair is absent from the DexScreener response`);
  return p;
}

export async function fetchPrinter(fetchImpl = fetch) {
  const p = await pair(`${DEX.base}/${DEX.printerPair}`, fetchImpl, "PRINTER");
  const usd = num(p.priceUsd);
  if (usd === null || usd <= 0) throw new Error("PRINTER price is unreadable");
  return {
    usd,
    change24h: num(p.priceChange?.h24),
    liquidityUsd: num(p.liquidity?.usd),
    fdv: num(p.fdv),
  };
}

/**
 * ETH is priced from the USDG/WETH pool on this chain, pinned by address.
 * Two tokens on Robinhood Chain answer to the symbol USDG, and the deeper of
 * the two pools uses the wrong one — it prices ETH 5% low. Symbol and depth are
 * both unusable as selectors, so the addresses are checked on every read.
 */
export async function fetchEthUsd(fetchImpl = fetch) {
  const p = await pair(`${DEX.base}/${DEX.ethPair}`, fetchImpl, "USDG/WETH");

  const base = (p.baseToken?.address ?? "").toLowerCase();
  const quote = (p.quoteToken?.address ?? "").toLowerCase();
  if (base !== ADDRESSES.USDG.toLowerCase() || quote !== ADDRESSES.WETH.toLowerCase()) {
    throw new Error(`ETH pair holds unexpected tokens: ${base} / ${quote}`);
  }

  const usdgInWeth = num(p.priceNative);
  const usdgUsd = num(p.priceUsd);
  if (!usdgInWeth || usdgInWeth <= 0 || !usdgUsd) throw new Error("ETH pair is unreadable");
  if (Math.abs(usdgUsd - 1) > DEX.usdgDepegTolerance) {
    throw new Error(`USDG depeg: quoted at ${usdgUsd}, outside the ${DEX.usdgDepegTolerance} tolerance`);
  }

  const local = (1 / usdgInWeth) * usdgUsd;

  let coingecko = null;
  try {
    const res = await fetchImpl(DEX.coingecko);
    if (res.ok) coingecko = num((await res.json())?.ethereum?.usd);
  } catch {
    coingecko = null;   // a second opinion going missing is not a reason to stop
  }

  return {
    usd: local,
    local,
    coingecko,
    spreadPct: coingecko ? Math.abs(local - coingecko) / coingecko * 100 : null,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/prices.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/prices.js test/prices.test.js
git commit -m "feat: price ETH from the pool that holds the real USDG"
```

---

### Task 6: Protocol state and the snapshot store

**Files:**
- Create: `src/protocol.js`, `src/store.js`, `test/store.test.js`

**Interfaces:**
- Consumes: `ADDRESSES` from `src/config.js`.
- Produces:
  - `readProtocol({ provider }) -> Promise<{ epoch, ceiling, totalInkBurned, activeMachines, totalWeight, activationInk, nextGate }>` — every field `null` when its sub-call failed.
  - `createStore() -> { get(), succeed(payload), fail(error), }` where `get()` returns `{ data, at, ageMs, lastError, stale }`.

- [ ] **Step 1: Write the failing test — `test/store.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";

test("an empty store has no data and says so", () => {
  const s = createStore();
  const v = s.get(1000);
  assert.equal(v.data, null);
  assert.equal(v.ageMs, null);
  assert.equal(v.lastError, null);
});

test("a failed update never overwrites the last good payload", () => {
  const s = createStore();
  s.succeed({ rows: ["good"] }, 1000);
  s.fail(new Error("OpenSea 503"), 2000);
  const v = s.get(3000);
  assert.deepEqual(v.data, { rows: ["good"] });
  assert.equal(v.at, 1000);
  assert.equal(v.ageMs, 2000);
  assert.equal(v.lastError, "OpenSea 503");
});

test("a later success clears the error and moves the timestamp", () => {
  const s = createStore();
  s.succeed({ n: 1 }, 1000);
  s.fail(new Error("boom"), 2000);
  s.succeed({ n: 2 }, 3000);
  const v = s.get(3500);
  assert.deepEqual(v.data, { n: 2 });
  assert.equal(v.lastError, null);
  assert.equal(v.ageMs, 500);
});

test("staleness is measured against the caller's own clock", () => {
  const s = createStore({ staleAfterMs: 5000 });
  s.succeed({ n: 1 }, 1000);
  assert.equal(s.get(3000).stale, false);
  assert.equal(s.get(9000).stale, true);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/store.test.js`
Expected: FAIL — `Cannot find module '../src/store.js'`.

- [ ] **Step 3: Write `src/store.js`**

```js
/**
 * Holds the last payload that was actually computed.
 * A failed sweep records its error and leaves the payload alone: a page showing
 * numbers from four minutes ago, labelled as such, is useful. A page blanked by
 * one 503 is not, and a page silently showing partial numbers is worse than both.
 * `now` is passed in rather than read, so the behaviour is testable.
 */
export function createStore({ staleAfterMs = Infinity } = {}) {
  let data = null;
  let at = null;
  let lastError = null;

  return {
    succeed(payload, now = Date.now()) {
      data = payload;
      at = now;
      lastError = null;
    },
    fail(error, now = Date.now()) {
      lastError = error?.message ?? String(error);
      void now;
    },
    get(now = Date.now()) {
      const ageMs = at === null ? null : now - at;
      return {
        data,
        at,
        ageMs,
        lastError,
        stale: ageMs === null ? true : ageMs > staleAfterMs,
      };
    },
  };
}
```

- [ ] **Step 4: Run the store tests**

Run: `node --test test/store.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write `src/protocol.js`**

```js
import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";
import { multicallOf } from "./multicall.js";

const MINE_ABI = new ethers.Interface([
  "function currentEpoch() view returns (uint256)",
  "function multiplierCeiling() view returns (uint256)",
  "function totalInkBurned() view returns (uint256)",
  "function activeMachines() view returns (uint256)",
  "function totalWeight() view returns (uint256)",
  "function ACTIVATION_INK() view returns (uint256)",
  "function nextGate() view returns (uint256 needed, uint256 unlocks)",
]);

const SINGLE = ["currentEpoch", "multiplierCeiling", "totalInkBurned", "activeMachines", "totalWeight", "ACTIVATION_INK"];

/** Every field is independently allowed to fail. One unreadable view must not
 *  blank the other five, and a failed view is null — never zero. */
export async function readProtocol({ provider }) {
  const aggregate3 = multicallOf(provider, ADDRESSES.MULTICALL3);
  const fns = [...SINGLE, "nextGate"];
  const res = await aggregate3(
    fns.map((fn) => ({ target: ADDRESSES.MINE, allowFailure: true, callData: MINE_ABI.encodeFunctionData(fn, []) })),
  );

  const out = {};
  fns.forEach((fn, i) => {
    const r = res[i];
    if (!r?.[0]) { out[fn] = null; return; }
    try {
      const decoded = MINE_ABI.decodeFunctionResult(fn, r[1]);
      out[fn] = fn === "nextGate"
        ? { needed: decoded[0].toString(), unlocks: decoded[1].toString() }
        : decoded[0].toString();
    } catch {
      out[fn] = null;
    }
  });

  return {
    epoch: out.currentEpoch,
    ceiling: out.multiplierCeiling,
    totalInkBurned: out.totalInkBurned,
    activeMachines: out.activeMachines,
    totalWeight: out.totalWeight,
    activationInk: out.ACTIVATION_INK,
    nextGate: out.nextGate,
  };
}
```

- [ ] **Step 6: Run the full suite**

Run: `node --test test/`
Expected: PASS, all tests from Tasks 1–6.

- [ ] **Step 7: Commit**

```bash
git add src/protocol.js src/store.js test/store.test.js
git commit -m "feat: keep the last good snapshot when a sweep fails"
```

---

### Task 7: The server — two loops and an HTTP surface

**Files:**
- Create: `src/server.js`, `src/snapshot.js`, `test/snapshot.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `composeSnapshot({ grid, printer, eth, protocol, publishedFloor, book, inkMeta, now }) -> object` (pure)
  - `src/server.js` as the entry point, no exports.

The snapshot shape is the contract between the server and the page:

```
{
  at, grid, excluded, totals,
  printer: { usd, change24h, liquidityUsd, fdv },
  eth: { usd, local, coingecko, spreadPct },
  ink: { activationPrinter, activationUsd, activationEth, readAt, failures },
  protocol: {...},
  book: { listed, pages, skipped },
  publishedFloor: { floor, symbol }
}
```

- [ ] **Step 1: Write the failing test — `test/snapshot.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSnapshot } from "../src/snapshot.js";

const base = {
  grid: { rows: [], excluded: { unknownRarity: 0, unknownInk: 0, listingsOffGrid: 0 }, totals: { inked: 0, dormant: 0, listed: 0 } },
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/snapshot.test.js`
Expected: FAIL — `Cannot find module '../src/snapshot.js'`.

- [ ] **Step 3: Write `src/snapshot.js`**

```js
/** Pure assembly of everything the page needs. Derivations that would divide by
 *  an unread value produce null rather than a confident zero. */
export function composeSnapshot({ grid, printer, eth, protocol, publishedFloor, book, inkMeta, now }) {
  const activationPrinter = protocol?.activationInk
    ? Number(BigInt(protocol.activationInk) / 10n ** 15n) / 1000
    : null;

  const activationUsd = activationPrinter !== null && printer?.usd ? activationPrinter * printer.usd : null;
  const activationEth = activationUsd !== null && eth?.usd ? activationUsd / eth.usd : null;

  return {
    at: now,
    rows: grid.rows,
    excluded: grid.excluded,
    totals: grid.totals,
    printer,
    eth,
    ink: { activationPrinter, activationUsd, activationEth, readAt: inkMeta?.readAt ?? null, failures: inkMeta?.failures ?? null },
    protocol,
    book,
    publishedFloor: { ...publishedFloor, usedInComputation: false },
  };
}
```

- [ ] **Step 4: Run the snapshot tests**

Run: `node --test test/snapshot.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write `src/server.js`**

```js
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ethers } from "ethers";

import { loadConfig, RPC_URL, CHAIN_ID } from "./config.js";
import { fetchListings, fetchPublishedFloor } from "./opensea.js";
import { loadTraits } from "./traits.js";
import { readInk } from "./ink.js";
import { fetchPrinter, fetchEthUsd } from "./prices.js";
import { readProtocol } from "./protocol.js";
import { buildGrid } from "./floors.js";
import { composeSnapshot } from "./snapshot.js";
import { createStore } from "./store.js";

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig(process.env, JSON.parse(readFileSync(join(here, "..", "config.json"), "utf8")));
const page = readFileSync(join(here, "public", "index.html"), "utf8");

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
const store = createStore({ staleAfterMs: cfg.bookPollIntervalMs * 3 });

let traits = new Map();
let ink = new Map();
let inkMeta = { readAt: null, failures: null };

async function sweepInk() {
  const { ink: fresh, failures } = await readInk({ provider, batchSize: cfg.multicallBatchSize });
  ink = fresh;
  inkMeta = { readAt: Date.now(), failures };
  console.log(`ink: ${fresh.size} machines read, ${failures} failures`);
}

async function sweepBook() {
  const [book, printer, eth, protocol, publishedFloor] = await Promise.all([
    fetchListings({ apiKey: cfg.openseaApiKey, maxPages: cfg.maxBookPages }),
    fetchPrinter(),
    fetchEthUsd(),
    readProtocol({ provider }),
    fetchPublishedFloor({ apiKey: cfg.openseaApiKey }),
  ]);

  const grid = buildGrid({ listings: book.listings, traits, ink, pelotonSize: cfg.pelotonSize });

  store.succeed(composeSnapshot({
    grid, printer, eth, protocol, publishedFloor,
    book: { listed: book.listings.size, pages: book.pages, skipped: book.skipped },
    inkMeta, now: Date.now(),
  }));
  console.log(`book: ${book.listings.size} listings over ${book.pages} pages`);
}

/** Each loop reschedules itself after it finishes, so a slow sweep can never
 *  overlap with the next one. A failure is recorded and the loop continues. */
function loop(name, fn, intervalMs) {
  const tick = async () => {
    try { await fn(); }
    catch (e) { store.fail(e); console.error(`${name}: ${e.message}`); }
    finally { setTimeout(tick, intervalMs).unref?.(); }
  };
  tick();
}

const server = createServer((req, res) => {
  if (req.url === "/api/snapshot") {
    const v = store.get();
    res.writeHead(v.data ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(v));
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

const started = async () => {
  const { traits: t, source } = await loadTraits({
    provider,
    cachePath: join(here, "..", "data", "traits.json"),
    batchSize: cfg.multicallBatchSize,
  });
  traits = t;
  console.log(`traits: ${t.size} sealed rarities (${source})`);

  await sweepInk().catch((e) => console.error(`ink: ${e.message}`));

  loop("book", sweepBook, cfg.bookPollIntervalMs);
  loop("ink", sweepInk, cfg.inkPollIntervalMs);

  server.listen(cfg.port, () => console.log(`dashboard on :${cfg.port}`));
};

started().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run the full suite and boot the service once**

Run: `node --test test/`
Expected: PASS.

Run: `node src/server.js` (with `.env` loaded — `set -a && . ./.env && set +a`).
Expected: logs showing `traits: 10000 sealed rarities (chain)`, then `ink: 10000 machines read, 0 failures`, then a `book:` line, then `dashboard on :3050`. Then `curl -s localhost:3050/api/snapshot | head -c 400` returns JSON with a populated `rows` array. Stop it.

- [ ] **Step 7: Commit**

```bash
git add src/server.js src/snapshot.js test/snapshot.test.js
git commit -m "feat: two loops that cannot take each other down"
```

---

### Task 8: The page

**REQUIRED SUB-SKILL:** load `example-skills:frontend-design` before writing any markup, and follow it.

**Files:**
- Create: `src/public/index.html`

**Interfaces:**
- Consumes: `GET /api/snapshot`, the shape defined in Task 7.
- Produces: nothing other modules use.

**Visual direction (from the spec — these are requirements, not suggestions):**

In: near-black neutral background; 1px hairline rules instead of shadows; monospace tabular figures (`font-variant-numeric: tabular-nums`), right-aligned, units in muted smaller text; dense layout; semantic colour only — amber for inked, cold grey-blue for dormant; small-caps muted labels; corner radius 0–2px; system font stacks only, no webfont fetch.

Out: purple/indigo gradients, glassmorphism, floating rounded cards, emoji, gradient text, hero sections, decorative colour, generous whitespace where data belongs.

- [ ] **Step 1: Build the static shell**

A single self-contained HTML file — inline `<style>` and `<script>`, no build step, no external request. Three regions, top to bottom:

1. **Context bar** — `$PRINTER` (price, 24h change, liquidity, FDV), `ETH/USD` (pool value, CoinGecko value, spread), `INK` (4,250 $PRINTER, its USD value, its ETH value), and protocol state (epoch, ceiling, total burned, active machines). Each as a label/value pair, labels in muted small-caps, values in tabular monospace.
2. **The grid** — one `<table>`, seven rows, columns: `CLASS`, then under an `INKED` group `FLOOR / PELOTON / LISTED / SUPPLY / %`, then the same five under `DORMANT`, then `SPREAD`. Column groups separated by a hairline rule, not by colour blocks.
3. **Footer** — snapshot age, book pages read, listings skipped, machines excluded (with the reason breakdown), and the OpenSea published floor labelled `not used in any computation`.

- [ ] **Step 2: Render the numbers, and the absences**

These render rules are the spec's honesty requirements made visible. Implement each:

```js
// A missing number is never a dash that could read as zero.
const fmtEth = (v) => v === null || v === undefined ? "—" : v.toFixed(4);
const fmtRatio = (v) => v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`;
```

- A cell with `listed === 0` shows `no listing` in muted text across its floor and peloton columns — never `0.0000`.
- A cell with `pelotonEth === null` and `listed > 0` shows `${listed} listed, no peloton`, in muted text, so a thin book is legible as a thin book.
- `spreadEth === null` shows `—` with a `title` explaining that one half of the row has no floor.
- When `spreadEth` is below `ink.activationEth`, mark the spread cell — a single left border in the amber accent, plus a `title` reading `below the cost of ink`. No icon, no background fill.
- The floor cell links to `https://opensea.io/assets/robinhood/0xb509e195bcb3e4461e235ff152c68d66915f67b5/<floorTokenId>` and shows `#<floorTokenId>` in muted text beneath the price.

- [ ] **Step 3: Wire the refresh and the staleness banner**

```js
async function refresh() {
  const res = await fetch("/api/snapshot");
  const v = await res.json();          // { data, at, ageMs, lastError, stale }
  if (!v.data) { showBanner("no snapshot yet" + (v.lastError ? ` — ${v.lastError}` : "")); return; }
  if (v.lastError || v.stale) {
    showBanner(`data from ${Math.round(v.ageMs / 1000)}s ago — last error: ${v.lastError ?? "none"}`);
  } else {
    hideBanner();
  }
  render(v.data);
}
setInterval(refresh, 15000);
refresh();
```

The banner sits above the grid, full width, hairline top and bottom, amber text on the same background — it must be impossible to miss and impossible to mistake for a decoration. The grid stays rendered underneath with its last values.

- [ ] **Step 4: Check it against a real snapshot**

Run the server (`set -a && . ./.env && set +a && node src/server.js`), open `http://localhost:3050`, and verify by eye: all seven rows present; x6 and x10 show `no peloton` or `no listing` where their books are thin; the context bar shows a $PRINTER price close to `$0.0126` and ETH close to `$1883`; the ink row reads about `$53` and `0.0284 ETH`. Then stop the server, restart it with a deliberately wrong `OPENSEA_API_KEY`, and confirm the banner appears while the grid keeps its last values.

- [ ] **Step 5: Commit**

```bash
git add src/public/index.html
git commit -m "feat: an instrument for reading fourteen floors at a glance"
```

---

### Task 9: Containerisation and README

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md`

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
data
.git
.env
*.log
docs
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY config.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3050

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3050/api/snapshot > /dev/null || exit 1

CMD ["node", "src/server.js"]
```

The 90 s start period covers the first full read of 10,000 sealed rarities on a
cold cache; a shorter one would restart the container mid-read, forever.

- [ ] **Step 3: Write `docker-compose.yml`**

```yaml
services:
  rh-dashboard:
    build: .
    container_name: rh-dashboard
    restart: unless-stopped
    env_file: .env
    ports:
      - "192.168.0.11:3050:3050"
    volumes:
      - ./data:/app/data
```

Port 3050 was audited free on this host, and is declared by no other container,
running or stopped. Binding to `192.168.0.11` rather than `0.0.0.0` keeps the
dashboard on the LAN interface only.

- [ ] **Step 4: Write `README.md`**

Cover, in English: what the tool is and what it refuses to do (read-only, no key,
no orders); the ink split and why a single floor per class is meaningless; how to
run it (`.env` contents, `docker compose up -d --build`, the URL); what each
column of the grid means; the honesty rules a reader needs to interpret the page
(`no listing` vs `no peloton`, the staleness banner, excluded machines, the
published OpenSea floor being displayed but never computed with); and the two
USDG tokens, with the address of the right one.

- [ ] **Step 5: Build and run**

```bash
docker compose up -d --build
docker compose ps
curl -s http://192.168.0.11:3050/api/snapshot | head -c 300
```

Expected: container `healthy` within ~2 minutes, JSON with a populated `rows`
array, and no port conflict against the 24 mappings already on this host.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore README.md
git commit -m "chore: ship it on a port nothing else on this host claims"
```

---

## Self-review

**Spec coverage.** Grid of 14 cells → Task 3. Supply and listed-ratio, requiring
all 10,000 ink reads → Tasks 4 and 7. Ink spread vs live ink cost → Tasks 3, 7,
8. Context bar (PRINTER, ETH, protocol) → Tasks 5, 6, 8. Two-USDG guard → Task 5.
Dedup by tokenId → Task 2. Book-exhaustion refusal → Task 2. `no listing` never
`0`, no peloton below N, null rarity excluded and counted, failed sweep keeps the
last snapshot, published floor displayed but never computed with, both ETH
sources shown → Tasks 2, 3, 6, 7, 8. Cadences → Task 7. HTTP surface → Task 7.
Visual direction → Task 8. Testing → every task. Deployment on 3050 → Task 9.

**Known gap, accepted:** `readTraits`, `readInk` and `readProtocol` have no test
that exercises them against a provider — they are thin wiring over
`readUintMap`, which is tested, and testing them further would mean mocking
ethers' `Contract`. The wiring is verified once by hand in Task 7 Step 6.

**Type consistency.** `listings` is a `Map<number, {tokenId, priceEth, orderHash}>`
from Task 2 through Tasks 3 and 7. `traits` is `Map<number, {weightClass, desk}>`
from Task 4 into Task 3. `ink` is `Map<number, bigint>` from Task 4 into Task 3;
`buildGrid` compares with `> 0n`, matching. `buildGrid` returns `{rows, excluded,
totals}`; `composeSnapshot` reads exactly those three. `createStore().get()`
returns `{data, at, ageMs, lastError, stale}`, which is what Task 8's `refresh()`
destructures.

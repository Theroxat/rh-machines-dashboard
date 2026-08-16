import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtEth, fmtRatio, halfCell, cellKey,
  bannerMessage, excludedLine, publishedLine, rowsHtml, contextHtml, legendHtml,
} from "../src/public/app.js";

const entry = (tokenId, priceEth, image = `https://img/${tokenId}.webp`) => ({
  tokenId, priceEth,
  machine: image ? { image, headwear: "Blueberries", body: "Sky" } : null,
});

const half = (over = {}) => {
  const entries = over.entries ?? [entry(1234, 0.0869), entry(77, 0.0900)];
  return {
    floorEth: entries[0]?.priceEth ?? null,
    floorTokenId: entries[0]?.tokenId ?? null,
    pelotonEth: 0.09, listed: entries.length, supply: 100,
    listedRatio: entries.length / 100, ...over, entries,
  };
};

const manyEntries = (n) => Array.from({ length: n }, (_, i) => entry(100 + i, 0.08 + i / 1000));
const countChips = (html) => (html.match(/class="chip/g) ?? []).length;

test("an absent number renders as an em dash, never as zero", () => {
  assert.equal(fmtEth(null), "—");
  assert.equal(fmtRatio(null), "—");
});

test("a cell shows the machines on sale, cheapest first", () => {
  const html = halfCell(half({ entries: [entry(5504, 0.0825), entry(7773, 0.0850)] }), "ink");
  assert.ok(html.indexOf("#5504") < html.indexOf("#7773"), "the cheapest machine must come first");
  assert.match(html, /src="https:\/\/img\/5504\.webp"/);
  assert.match(html, /0\.0825/);
  assert.match(html, /0\.0850/);
  assert.match(html, /assets\/robinhood\/0xb509e195bcb3e4461e235ff152c68d66915f67b5\/5504/);
});

test("the machine setting the floor is marked as such", () => {
  const html = halfCell(half({ entries: [entry(1, 0.1), entry(2, 0.2)] }), "ink");
  assert.match(html, /class="chip floor"/);
  assert.equal((html.match(/class="chip floor"/g) ?? []).length, 1);
});

test("a long book is cut to the limit and offers the rest", () => {
  const html = halfCell(half({ entries: manyEntries(191), supply: 4388 }), "ink", { limit: 8, key: "100:ink" });
  assert.equal(countChips(html), 8);
  assert.match(html, /\+ 183 more/);
  assert.match(html, /data-key="100:ink"/);
});

test("an expanded cell shows every machine and offers the way back", () => {
  const html = halfCell(half({ entries: manyEntries(191), supply: 4388 }), "ink", { limit: 8, expanded: true, key: "100:ink" });
  assert.equal(countChips(html), 191);
  assert.match(html, /show fewer/);
  assert.doesNotMatch(html, /more<\/button>/);
});

test("a book that fits under the limit offers nothing to expand", () => {
  const html = halfCell(half({ entries: manyEntries(8) }), "ink", { limit: 8 });
  assert.equal(countChips(html), 8);
  assert.doesNotMatch(html, /more/);
  assert.doesNotMatch(html, /show fewer/);
});

test("depth reads as a sentence, not as a percentage to decode", () => {
  const html = halfCell(half({ entries: manyEntries(9), supply: 33 }), "ink");
  assert.match(html, /9 of 33 listed/);
});

test("a machine with no picture keeps its price and its link", () => {
  const html = halfCell(half({ entries: [entry(42, 0.5, null)] }), "ink");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /0\.5000/);
  assert.match(html, /#42/);
});

test("a cell with no listing says so instead of printing a price", () => {
  const html = halfCell(half({ entries: [], listed: 0, floorEth: null, floorTokenId: null, listedRatio: 0 }), "ink");
  assert.match(html, /no listing/);
  assert.doesNotMatch(html, /0\.0000/);
  assert.match(html, /0 of 100 listed/);
  assert.equal(countChips(html), 0);
});

test("the peloton survives the simplification, demoted to the cell's tooltip", () => {
  assert.match(halfCell(half({ pelotonEth: 0.09 }), "ink"), /peloton 0\.0900/);
  assert.match(halfCell(half({ pelotonEth: null }), "dormant"), /too few for a peloton/);
});

test("the legend names what to look at on a machine to know its class", () => {
  const html = legendHtml({
    byClass: [
      { classLabel: "x10", headwear: ["Blueberries"], count: 37 },
      { classLabel: "x6", headwear: ["None"], count: 81 },
      { classLabel: "x1", headwear: [], count: 0 },
    ],
    ambiguous: [], unpaired: 0,
  });
  assert.match(html, /Blueberries/);
  assert.match(html, /no headwear at all/i);
  assert.doesNotMatch(html, />None</);
});

test("an ambiguous headwear is announced, never filed away quietly", () => {
  const html = legendHtml({
    byClass: [{ classLabel: "x1", headwear: ["Halo"], count: 1 }],
    ambiguous: [{ headwear: "Bowler", classes: ["x1", "x2"] }], unpaired: 0,
  });
  assert.match(html, /Bowler/);
  assert.match(html, /x1 and x2/);
});

test("the banner speaks up when data is stale or a sweep failed, and stays quiet otherwise", () => {
  assert.equal(bannerMessage({ data: { rows: [] }, ageMs: 5000, stale: false, lastError: null }), null);
  assert.match(bannerMessage({ data: null, lastError: "OpenSea returned 401 on page 1" }), /last sweep failed.*401/);
  assert.doesNotMatch(bannerMessage({ data: null, lastError: "OpenSea returned 401 on page 1" }), /still running/);
  assert.match(bannerMessage({ data: null, lastError: null }), /first sweep is still running/);
  assert.match(bannerMessage({ data: {}, ageMs: 240000, stale: true, lastError: "OpenSea 503" }), /4m ago.*503/);
});

test("a clean read is reported as a clean read, and exclusions are itemised", () => {
  assert.match(excludedLine({ excluded: { unknownRarity: 0, unknownInk: 0, listingsOffGrid: 0 } }), /Every one of the 10,000/);
  assert.match(excludedLine({ excluded: { unknownRarity: 2, unknownInk: 0, listingsOffGrid: 1 } }), /never guessed/);
});

test("the published floor is always labelled as uncomputed-with", () => {
  assert.match(publishedLine({ publishedFloor: { floor: 0.0869, symbol: "ETH" } }), /enters no computation/);
  assert.match(publishedLine({ publishedFloor: { floor: null, symbol: null } }), /—/);
});

test("each half of each row gets its own expansion key", () => {
  assert.equal(cellKey(1000, "ink"), "1000:ink");
  assert.notEqual(cellKey(1000, "ink"), cellKey(1000, "dormant"));
});

test("only the cells asked to expand do so", () => {
  const row = (classValue, classLabel) => ({
    classValue, classLabel, docCount: 7131, chainCount: 7131,
    inked: half({ entries: manyEntries(20) }),
    dormant: half({ entries: manyEntries(20) }),
  });
  const html = rowsHtml({ rows: [row(100, "x1"), row(1000, "x10")] },
    { expanded: new Set(["100:ink"]), limit: 8 });

  assert.equal(html.match(/<tr>/g).length, 2);
  assert.equal(countChips(html), 20 + 8 + 8 + 8);   // one cell expanded, three cut
  assert.match(html, /\+ 12 more/);                 // the cut cells still offer the rest
});

test("a census that disagrees with the documentation is shown, not hidden", () => {
  const html = rowsHtml({
    rows: [{
      classValue: 1000, classLabel: "x10", docCount: 37, chainCount: 36,
      inked: half(), dormant: half(),
    }],
  });
  assert.match(html, /36 ≠ 37/);
  assert.match(html, /The chain returned 36/);
});

test("the context strip survives a protocol read that came back empty", () => {
  const html = contextHtml({
    printer: { usd: 0.0126, change24h: null, liquidityUsd: null },
    eth: { local: 1883.24, coingecko: null, spreadPct: null },
    ink: { activationUsd: 53.72, activationPrinter: 4250, activationEth: 0.0285 },
    totals: { inked: 6184, dormant: 3816, listed: 703 },
    protocol: { epoch: null, ceiling: null },
  });
  assert.match(html, /no second opinion/);
  assert.match(html, /ceiling unreadable/);
  assert.match(html, /\$53\.72/);
});

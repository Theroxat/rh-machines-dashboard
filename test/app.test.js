import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtEth, fmtSpread, fmtRatio, halfCells, gaugeScale, gaugeCell,
  bannerMessage, excludedLine, publishedLine, rowsHtml, contextHtml,
} from "../src/public/app.js";

const half = (over = {}) => ({
  floorEth: 0.0869, floorTokenId: 1234, pelotonEth: 0.09,
  listed: 12, supply: 100, listedRatio: 0.12, ...over,
});

test("an absent number renders as an em dash, never as zero", () => {
  assert.equal(fmtEth(null), "—");
  assert.equal(fmtRatio(null), "—");
  assert.equal(fmtSpread(null), "—");
  assert.equal(fmtSpread(0.05), "+0.0500");
  assert.equal(fmtSpread(-0.5), "-0.5000");
});

test("a cell with no listing says so instead of printing a price", () => {
  const html = halfCells(half({ listed: 0, floorEth: null, floorTokenId: null, pelotonEth: null, listedRatio: 0 }), "ink");
  assert.match(html, /no listing/);
  assert.doesNotMatch(html, /0\.0000/);
  assert.match(html, />0</);            // listed is 0
});

test("a thin cell names its thinness and keeps its floor", () => {
  const html = halfCells(half({ listed: 3, pelotonEth: null }), "dormant");
  assert.match(html, /no peloton/);
  assert.match(html, /Only 3 listings/);
  assert.match(html, /0\.0869/);        // the floor is still actionable
});

test("the floor links to the exact machine that sets it", () => {
  const html = halfCells(half({ floorTokenId: 5504 }), "ink");
  assert.match(html, /assets\/robinhood\/0xb509e195bcb3e4461e235ff152c68d66915f67b5\/5504/);
  assert.match(html, /#5504/);
});

test("the gauge scale always keeps the ink tick inside the frame", () => {
  const rows = [{ spreadEth: -0.5 }, { spreadEth: 0.11 }, { spreadEth: null }];
  const scale = gaugeScale(rows, 0.0285);
  assert.ok(scale > 0.5 && scale < 0.7);
  assert.ok(0.0285 / scale < 1);

  // Ink alone must still set a usable scale when no spread exists at all.
  assert.ok(gaugeScale([{ spreadEth: null }], 0.0285) >= 0.0285);
});

test("a negative spread draws left of zero in the dormant colour", () => {
  const scale = gaugeScale([{ spreadEth: -0.5 }], 0.0285);
  const html = gaugeCell({ spreadEth: -0.5 }, 0.0285, scale);
  const left = Number(html.match(/bar neg" style="left:([\d.]+)%/)[1]);
  assert.ok(left < 50, `expected the bar to start left of zero, got ${left}`);
  assert.match(html, /-0\.5000/);
  assert.match(html, /but the market pays/);   // it is below the cost of ink
});

test("a spread that clears the cost of ink is drawn solid, not dashed", () => {
  const html = gaugeCell({ spreadEth: 0.2 }, 0.0285, gaugeScale([{ spreadEth: 0.2 }], 0.0285));
  assert.match(html, /bar pos/);
  assert.doesNotMatch(html, /bar short/);
});

test("a spread that falls short of the cost of ink is drawn dashed", () => {
  const html = gaugeCell({ spreadEth: 0.01 }, 0.0285, gaugeScale([{ spreadEth: 0.01 }], 0.0285));
  assert.match(html, /bar short/);
});

test("a class missing one half has no gauge and says why", () => {
  const html = gaugeCell({ spreadEth: null }, 0.0285, 0.5);
  assert.match(html, /nothing to subtract/);
  assert.doesNotMatch(html, /class="bar/);
});

test("the banner speaks up when data is stale or a sweep failed, and stays quiet otherwise", () => {
  assert.equal(bannerMessage({ data: { rows: [] }, ageMs: 5000, stale: false, lastError: null }), null);
  // Une cause connue passe devant le récit du démarrage.
  assert.match(bannerMessage({ data: null, lastError: "OpenSea returned 401 on page 1" }), /last sweep failed.*401/);
  assert.doesNotMatch(bannerMessage({ data: null, lastError: "OpenSea returned 401 on page 1" }), /still running/);
  assert.match(bannerMessage({ data: null, lastError: null }), /first sweep is still running/);
  assert.match(bannerMessage({ data: {}, ageMs: 240000, stale: true, lastError: "OpenSea 503" }), /4m ago.*503/);
  assert.match(bannerMessage({ data: {}, ageMs: 30000, stale: true, lastError: null }), /30s ago/);
});

test("a clean read is reported as a clean read, and exclusions are itemised", () => {
  assert.match(excludedLine({ excluded: { unknownRarity: 0, unknownInk: 0, listingsOffGrid: 0 } }), /Every one of the 10,000/);
  assert.match(excludedLine({ excluded: { unknownRarity: 2, unknownInk: 0, listingsOffGrid: 1 } }), /never guessed/);
});

test("the published floor is always labelled as uncomputed-with", () => {
  assert.match(publishedLine({ publishedFloor: { floor: 0.0869, symbol: "ETH" } }), /enters no computation/);
  assert.match(publishedLine({ publishedFloor: { floor: null, symbol: null } }), /—/);
});

test("a full grid renders one row per class with both halves and a gauge", () => {
  const row = (label, over = {}) => ({
    classLabel: label, classValue: 100, docCount: 7131, chainCount: 7131,
    inked: half(), dormant: half(), spreadEth: -0.01, ...over,
  });
  const html = rowsHtml({ rows: [row("x1"), row("x10", { chainCount: 36, docCount: 37 })], ink: { activationEth: 0.0285 } });
  assert.equal(html.match(/<tr>/g).length, 2);
  assert.match(html, /36 ≠ 37/);                  // a census mismatch is shown, not hidden
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

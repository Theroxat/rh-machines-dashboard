import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtEth, fmtSpread, fmtRatio, halfCell, gaugeScale, gaugeCell, activationVerdict,
  bannerMessage, excludedLine, publishedLine, rowsHtml, contextHtml, legendHtml,
} from "../src/public/app.js";

const machine = (over = {}) => ({ image: "https://img/1253.webp", headwear: "Blueberries", body: "Sky", ...over });

const half = (over = {}) => ({
  floorEth: 0.0869, floorTokenId: 1234, pelotonEth: 0.09,
  listed: 12, supply: 100, listedRatio: 0.12, machine: machine(), ...over,
});

test("an absent number renders as an em dash, never as zero", () => {
  assert.equal(fmtEth(null), "—");
  assert.equal(fmtRatio(null), "—");
  assert.equal(fmtSpread(null), "—");
  assert.equal(fmtSpread(0.05), "+0.0500");
  assert.equal(fmtSpread(-0.5), "-0.5000");
});

test("a cell shows the picture of the exact machine that sets its floor", () => {
  const html = halfCell(half({ floorTokenId: 1253 }), "ink");
  assert.match(html, /src="https:\/\/img\/1253\.webp"/);
  assert.match(html, /#1253/);
  assert.match(html, /Blueberries/);
  assert.match(html, /assets\/robinhood\/0xb509e195bcb3e4461e235ff152c68d66915f67b5\/1253/);
});

test("a missing picture costs the cell its thumbnail, not its price", () => {
  const html = halfCell(half({ machine: null }), "ink");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /0\.0869/);
  assert.match(html, /#1234/);
});

test("depth reads as a sentence, not as a percentage to decode", () => {
  const html = halfCell(half({ listed: 9, supply: 33 }), "ink");
  assert.match(html, /9 of 33 listed/);
});

test("a cell with no listing says so instead of printing a price", () => {
  const html = halfCell(half({ listed: 0, floorEth: null, floorTokenId: null, pelotonEth: null, listedRatio: 0, machine: null }), "ink");
  assert.match(html, /no listing/);
  assert.doesNotMatch(html, /0\.0000/);
  assert.match(html, /0 of 100/);
});

test("the peloton survives the simplification, demoted to the cell's tooltip", () => {
  const shown = halfCell(half({ pelotonEth: 0.09 }), "ink");
  assert.match(shown, /peloton 0\.0900/);

  const thin = halfCell(half({ listed: 3, pelotonEth: null }), "dormant");
  assert.match(thin, /no peloton/);
  assert.match(thin, /0\.0869/);   // the floor is still actionable
});

test("activation is judged in words before it is judged in digits", () => {
  const loss = activationVerdict(-0.5, 0.0285);
  assert.equal(loss.tone, "loss");
  assert.match(loss.headline, /less than a dormant one/i);

  const short = activationVerdict(0.01, 0.0285);
  assert.equal(short.tone, "short");
  assert.match(short.headline, /less than the ink costs/i);

  const paid = activationVerdict(0.11, 0.0285);
  assert.equal(paid.tone, "paid");
  assert.match(paid.headline, /3\.9. the ink/);

  const none = activationVerdict(null, 0.0285);
  assert.equal(none.tone, "none");
  assert.match(none.headline, /only one side/i);
});

test("with no cost of ink there is no verdict to give, and none is invented", () => {
  const v = activationVerdict(0.11, null);
  assert.equal(v.tone, "unknown");
  assert.match(v.detail, /cost of ink/i);
});

test("the gauge scale always keeps the ink tick inside the frame", () => {
  const rows = [{ spreadEth: -0.5 }, { spreadEth: 0.11 }, { spreadEth: null }];
  const scale = gaugeScale(rows, 0.0285);
  assert.ok(scale > 0.5 && scale < 0.7);
  assert.ok(gaugeScale([{ spreadEth: null }], 0.0285) >= 0.0285);
});

test("a negative spread draws left of zero in the dormant colour", () => {
  const html = gaugeCell({ spreadEth: -0.5 }, 0.0285, gaugeScale([{ spreadEth: -0.5 }], 0.0285));
  const left = Number(html.match(/bar neg" style="left:([\d.]+)%/)[1]);
  assert.ok(left < 50, `expected the bar to start left of zero, got ${left}`);
  assert.match(html, /-0\.5000/);
});

test("a spread that clears the cost of ink is drawn solid, one that falls short is dashed", () => {
  assert.match(gaugeCell({ spreadEth: 0.2 }, 0.0285, gaugeScale([{ spreadEth: 0.2 }], 0.0285)), /bar pos/);
  assert.match(gaugeCell({ spreadEth: 0.01 }, 0.0285, gaugeScale([{ spreadEth: 0.01 }], 0.0285)), /bar short/);
});

test("a class missing one half has no gauge and says why", () => {
  const html = gaugeCell({ spreadEth: null }, 0.0285, 0.5);
  assert.match(html, /only one side/i);
  assert.doesNotMatch(html, /class="bar/);
});

test("the legend names what to look at on a machine to know its class", () => {
  const html = legendHtml({
    byClass: [
      { classLabel: "x10", headwear: ["Blueberries"], count: 37 },
      { classLabel: "x6", headwear: ["None"], count: 81 },
      { classLabel: "x1", headwear: [], count: 0 },
    ],
    ambiguous: [],
    unpaired: 0,
  });
  assert.match(html, /Blueberries/);
  assert.match(html, /no headwear at all/i);   // "None" is spelled out, not printed raw
  assert.doesNotMatch(html, />None</);
});

test("an ambiguous headwear is announced, never filed away quietly", () => {
  const html = legendHtml({
    byClass: [{ classLabel: "x1", headwear: ["Halo"], count: 1 }],
    ambiguous: [{ headwear: "Bowler", classes: ["x1", "x2"] }],
    unpaired: 0,
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

test("a full grid renders one row per class, both halves, a verdict and a gauge", () => {
  const row = (label, over = {}) => ({
    classLabel: label, classValue: 100, docCount: 7131, chainCount: 7131,
    inked: half(), dormant: half(), spreadEth: -0.01, ...over,
  });
  const html = rowsHtml({ rows: [row("x1"), row("x10", { chainCount: 36, docCount: 37 })], ink: { activationEth: 0.0285 } });
  assert.equal(html.match(/<tr>/g).length, 2);
  assert.match(html, /36 ≠ 37/);
  assert.match(html, /less than a dormant one/i);
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

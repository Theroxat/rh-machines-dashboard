import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtEth, fmtRatio, halfCell, cellKey,
  bannerMessage, excludedLine, publishedLine, rowsHtml, contextHtml, legendHtml,
  matchesFilter, filterBarHtml, filterSummary, freshness,
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
  assert.match(html, /9 on sale/);
  assert.match(html, /33 in this class/);
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
  assert.match(html, /100 in this class/);
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
  assert.match(publishedLine({ collection: { publishedFloor: 0.0869, publishedFloorSymbol: "ETH" } }), /enters no computation/);
  assert.match(publishedLine({ collection: { publishedFloor: null, publishedFloorSymbol: null } }), /—/);
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

// ---- filtres par trait ----

const machineOf = (over = {}) => ({ image: "u", headwear: "Halo", body: "Sky", eyes: "UwU", ticker: "MSFT", ...over });
const NO_FILTER = { Headwear: null, Body: null, Eyes: null };

test("with no filter set, every machine matches", () => {
  assert.equal(matchesFilter(machineOf(), NO_FILTER), true);
  assert.equal(matchesFilter(null, NO_FILTER), true);
});

test("a filter keeps only the machines that carry that exact trait", () => {
  assert.equal(matchesFilter(machineOf(), { ...NO_FILTER, Headwear: "Halo" }), true);
  assert.equal(matchesFilter(machineOf(), { ...NO_FILTER, Headwear: "Blade" }), false);
  assert.equal(matchesFilter(machineOf(), { ...NO_FILTER, Eyes: "UwU" }), true);
  assert.equal(matchesFilter(machineOf({ eyes: "Rage" }), { ...NO_FILTER, Eyes: "UwU" }), false);
});

test("two filters combine, so both must hold", () => {
  const f = { ...NO_FILTER, Headwear: "Halo", Body: "Sky" };
  assert.equal(matchesFilter(machineOf(), f), true);
  assert.equal(matchesFilter(machineOf({ body: "Amber" }), f), false);
});

// Une machine dont les métadonnées manquent n'a pas de traits connus : la
// compter comme correspondante ferait apparaître dans un filtre une machine
// dont on ignore justement si elle correspond.
test("a machine with no known traits never satisfies an active filter", () => {
  assert.equal(matchesFilter(null, { ...NO_FILTER, Headwear: "Halo" }), false);
});

test("a filtered cell shows only matches and says how many of how many", () => {
  const entries = [
    { tokenId: 1, priceEth: 0.1, machine: machineOf({ headwear: "Halo" }) },
    { tokenId: 2, priceEth: 0.2, machine: machineOf({ headwear: "Blade" }) },
    { tokenId: 3, priceEth: 0.3, machine: machineOf({ headwear: "Halo" }) },
  ];
  const html = halfCell(half({ entries, listed: 3, supply: 50 }), "ink", { filter: { ...NO_FILTER, Headwear: "Halo" } });
  assert.equal(countChips(html), 2);
  assert.match(html, /2 of 3 on sale match/);
  assert.match(html, /#1/);
  assert.doesNotMatch(html, /#2/);
});

test("a cell where nothing matches says so, which is not the same as no listing", () => {
  const entries = [{ tokenId: 1, priceEth: 0.1, machine: machineOf({ headwear: "Blade" }) }];
  const html = halfCell(half({ entries, listed: 1, supply: 50 }), "ink", { filter: { ...NO_FILTER, Headwear: "Halo" } });
  assert.match(html, /no machine matches here/);
  assert.doesNotMatch(html, /no listing/);
  assert.equal(countChips(html), 0);
});

test("the filter bar offers every value with what is on sale and what exists", () => {
  const html = filterBarHtml({
    Headwear: [{ value: "Halo", listed: 9, total: 37 }],
    Body: [{ value: "Sky", listed: 12, total: 501, ticker: "MSFT" }],
    Eyes: [{ value: "UwU", listed: 3, total: 600 }],
  }, NO_FILTER);
  assert.match(html, /data-trait="Headwear"/);
  assert.match(html, /Halo.*9.*37/);
  assert.match(html, /Sky.*MSFT/);          // le corps annonce le desk qu'il farme
  assert.match(html, /UwU/);
  assert.equal((html.match(/<select/g) ?? []).length, 3);
});

test("the chosen value is the one marked selected", () => {
  const html = filterBarHtml(
    { Headwear: [{ value: "Halo", listed: 1, total: 1 }, { value: "Blade", listed: 1, total: 1 }], Body: [], Eyes: [] },
    { ...NO_FILTER, Headwear: "Blade" },
  );
  assert.match(html, /value="Blade" selected/);
  assert.doesNotMatch(html, /value="Halo" selected/);
});

test("the summary counts matches across the whole board, or stays silent", () => {
  const d = {
    rows: [{
      inked:   { entries: [{ tokenId: 1, machine: machineOf({ headwear: "Halo" }) }] },
      dormant: { entries: [{ tokenId: 2, machine: machineOf({ headwear: "Blade" }) }] },
    }],
  };
  assert.equal(filterSummary(d, NO_FILTER), null);
  const s = filterSummary(d, { ...NO_FILTER, Headwear: "Halo" });
  assert.match(s, /Halo/);
  assert.match(s, /1 of 2 listed machines match/);
});

// « 5 of 249 listed » se lisait « 5 affichées sur 249 disponibles » et faisait
// croire à un bouton de dépliage manquant, alors que les 249 sont le nombre de
// machines qui existent et que les 5 en vente étaient toutes déjà là.
test("depth states two separate facts, and cannot be read as a truncation", () => {
  const html = halfCell(half({ entries: manyEntries(5), listed: 5, supply: 249 }), "ink", { limit: 8 });
  assert.match(html, /5 on sale/);
  assert.match(html, /249 in this class/);
  assert.doesNotMatch(html, /5 of 249/);
  assert.doesNotMatch(html, /more/);        // rien n'est caché, donc rien à proposer
});

// ---- le floor mis en avant ----

test("a cell leads with its floor price, not with a row of equal-sized chips", () => {
  const html = halfCell(half({ entries: [entry(9, 0.0940), entry(8, 0.5)] }), "ink");
  const floor = html.match(/class="cell-floor">(.*?)<\/span><\/span>/s);
  assert.ok(floor, "the cell must state a floor of its own");
  assert.match(html, /class="cell-floor"/);
  assert.ok(html.indexOf("cell-floor") < html.indexOf("strip"), "the floor comes before the pictures");
  assert.match(html.slice(html.indexOf("cell-floor"), html.indexOf("strip")), /0\.0940/);
});

test("under a filter the headline floor is the cheapest machine that matches", () => {
  const entries = [
    { tokenId: 1, priceEth: 0.10, machine: machineOf({ headwear: "Blade" }) },
    { tokenId: 2, priceEth: 0.30, machine: machineOf({ headwear: "Halo" }) },
  ];
  const html = halfCell(half({ entries }), "ink", { filter: { ...NO_FILTER, Headwear: "Halo" } });
  const head = html.slice(html.indexOf("cell-floor"), html.indexOf("strip"));
  assert.match(head, /0\.3000/);
  assert.doesNotMatch(head, /0\.1000/);
});

test("a cell with nothing to show states no floor rather than an empty one", () => {
  const html = halfCell(half({ entries: [], listed: 0, supply: 4 }), "ink");
  assert.doesNotMatch(html, /cell-floor/);
});

// ---- le bandeau de contexte ----

const CTX = {
  printer: { usd: 0.01771, change24h: 563, liquidityUsd: 470199, marketCap: 3043000 },
  eth: { local: 1885.48, coingecko: 1883.79, spreadPct: 0.09 },
  ink: { activationUsd: 75.27, activationPrinter: 4250, activationEth: 0.0399 },
  totals: { inked: 6216, dormant: 3784, listed: 680 },
  protocol: { epoch: "1", ceiling: "200" },
  collection: {
    floorEth: 0.094, floorUsd: 177.2, machines: 10000,
    marketCapEth: 940, marketCapUsd: 1772000,
    volumeEth: 425.576, volumeUsd: 802200, sales: 18124,
    volume24hEth: 136.67, volume24hUsd: 257700, sales24h: 1896,
    publishedFloor: 0.0869, publishedFloorSymbol: "ETH",
  },
};

test("the bar states the collection floor from our own book", () => {
  const html = contextHtml(CTX);
  assert.match(html, /Floor/i);
  assert.match(html, /0\.0940/);
  assert.match(html, /\$177/);
});

test("the bar states traded volume and how many sales made it", () => {
  const html = contextHtml(CTX);
  assert.match(html, /Volume/i);
  assert.match(html, /425/);
  assert.match(html, /18,124/);
});

test("market cap appears for the token and for the collection, each labelled", () => {
  const html = contextHtml(CTX);
  assert.match(html, /\$3\.0M|3,043,000/);       // le token
  assert.match(html, /940.*ETH|\$1\.8M|1,772,000/); // la collection, floor x 10,000
  assert.match(html, /floor .{0,3} 10,000/i);     // et l'aveu que c'est une convention
});

test("missing collection numbers leave dashes, never zeroes", () => {
  const html = contextHtml({
    ...CTX,
    collection: { floorEth: null, floorUsd: null, machines: 10000, marketCapEth: null,
      marketCapUsd: null, volumeEth: null, volumeUsd: null, sales: null,
      volume24hEth: null, volume24hUsd: null, sales24h: null, publishedFloor: null },
  });
  assert.doesNotMatch(html, /\$0\.00/);
  assert.match(html, /—/);
});

test("the headline number says what it is, so it cannot be mistaken for something else", () => {
  const plain = halfCell(half({ entries: [entry(9, 0.0980)] }), "ink");
  assert.match(plain, /floor price/);
  assert.ok(plain.indexOf("floor price") < plain.indexOf("0.0980"), "the label comes before the number");

  // Sous un filtre ce n'est plus le floor de la classe : l'étiquette change.
  const entries = [
    { tokenId: 1, priceEth: 0.10, machine: machineOf({ headwear: "Blade" }) },
    { tokenId: 2, priceEth: 0.30, machine: machineOf({ headwear: "Halo" }) },
  ];
  const filtered = halfCell(half({ entries }), "ink", { filter: { ...NO_FILTER, Headwear: "Halo" } });
  assert.match(filtered, /cheapest match/);
  assert.doesNotMatch(filtered, /floor price/);
});

// ---- fraîcheur calculée côté page ----

// L'âge quittait le corps de la réponse parce qu'il changeait à chaque requête
// et rendait tout ETag inutile. Il se recalcule ici depuis `at` et l'heure du
// serveur — jamais depuis l'horloge du visiteur, qui peut être fausse.
test("age is measured between two server clocks, never against the visitor's", () => {
  assert.deepEqual(freshness({ at: 1000, staleAfterMs: 5000 }, 3000), { ageMs: 2000, stale: false });
  assert.deepEqual(freshness({ at: 1000, staleAfterMs: 5000 }, 9000), { ageMs: 8000, stale: true });
});

test("a snapshot that never arrived has no age and counts as stale", () => {
  assert.deepEqual(freshness({ at: null, staleAfterMs: 5000 }, 3000), { ageMs: null, stale: true });
});

test("a clock that runs backwards yields no negative age", () => {
  assert.equal(freshness({ at: 5000, staleAfterMs: 5000 }, 1000).ageMs, 0);
});

test("the filter summary escapes the trait values it repeats", () => {
  const d = { rows: [{ inked: { entries: [] }, dormant: { entries: [] } }] };
  const s = filterSummary(d, { Headwear: '<img src=x onerror=alert(1)>', Body: null, Eyes: null });
  assert.doesNotMatch(s, /<img/);
  assert.match(s, /&lt;img/);
});

// Sur mobile l'en-tête du tableau disparaît et chaque moitié devient une carte
// empilée : elle doit alors pouvoir annoncer elle-même de quel côté elle parle.
test("each half names its own state, so it still reads with no column header", () => {
  assert.match(halfCell(half(), "ink"), /data-state="Inked"/);
  assert.match(halfCell(half(), "dormant"), /data-state="Dormant"/);
  assert.match(halfCell(half({ entries: [], listed: 0 }), "ink"), /data-state="Inked"/);
});

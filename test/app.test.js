import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fmtEth, fmtRatio, halfCell, cellKey,
  bannerMessage, rowsHtml, contextHtml, legendHtml,
  matchesFilter, filterBarHtml, filterSummary, freshness, fmtCompact, crateLine,
  perPointUsd, viewBarHtml, ballotBlock, dropNote, bestRow, yieldOf, BEST_LIMIT, DEFAULT_LIMIT, fmtUsdRound, bestFit, walletCardHtml, walletDetailHtml, fmtShare, machineDetailHtml, findMachine, itemUrl, setContract, fmtWeightX, fmtExact, fmtAmount, fmtTiny, ballotHtml,
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
  assert.match(html, /show 40 more/);
  assert.match(html, /183 left/);
  assert.match(html, /data-key="100:ink"/);
});

test("an expanded cell shows every machine and offers the way back", () => {
  const html = halfCell(half({ entries: manyEntries(191), supply: 4388 }), "ink", { limit: 8, shown: 191, key: "100:ink" });
  assert.equal(countChips(html), 191);
  assert.match(html, /show fewer/);
  assert.doesNotMatch(html, /show \d+ more/);
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
    { expanded: new Map([["100:ink", 20]]), limit: 8 });

  assert.equal(html.match(/<tr>/g).length, 2);
  assert.equal(countChips(html), 20 + 8 + 8 + 8);   // one cell expanded, three cut
  assert.match(html, /show the last 12/);           // the cut cells still offer the rest
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

const machineOf = (over = {}) => ({ image: "u", headwear: "Halo", body: "Sky", eyes: "UwU", desk: "health", ...over });
const NO_FILTER = { Desk: null, Headwear: null, Body: null, Eyes: null };

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
    Desk: [{ value: "health", listed: 12, total: 1322 }],
    Headwear: [{ value: "Halo", listed: 9, total: 37 }],
    Body: [{ value: "Sky", listed: 12, total: 501 }],
    Eyes: [{ value: "UwU", listed: 3, total: 600 }],
  }, NO_FILTER);
  assert.match(html, /data-trait="Headwear"/);
  assert.match(html, /Halo.*9.*37/);
  assert.match(html, /health.*1,322/);
  assert.match(html, /UwU/);
  assert.equal((html.match(/<select/g) ?? []).length, 4);
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

// La classe scellée (x1..x10) et le plafond d'encre sont deux multiplicateurs
// sans rapport. Les afficher tous deux en « x » invitait à lire « ceiling 2x »
// comme une contradiction avec la ligne x10 juste en dessous.
test("the ink ceiling names what it caps, and uses the same notation as the classes", () => {
  const html = contextHtml({ ...CTX, protocol: { epoch: "1", ceiling: "200", nextGate: { needed: "31220791000000000000000000", unlocks: "300" } } });
  assert.match(html, /ink ceiling x2/);
  assert.doesNotMatch(html, /ceiling 2x/);
  assert.match(html, /x3 at 31\.2M more burned/);
});

test("an unreadable gate leaves the ceiling stated and the rest silent", () => {
  const html = contextHtml({ ...CTX, protocol: { epoch: "1", ceiling: "200", nextGate: null } });
  assert.match(html, /ink ceiling x2/);
  assert.doesNotMatch(html, /more burned/);
});

test("an unreadable ceiling says so rather than inventing one", () => {
  const html = contextHtml({ ...CTX, protocol: { epoch: "1", ceiling: null, nextGate: null } });
  assert.match(html, /ceiling unreadable/);
});

test("large token amounts are compacted without a currency sign", () => {
  assert.equal(fmtCompact(31220791), "31.2M");
  assert.equal(fmtCompact(4250), "4,250");
  assert.equal(fmtCompact(null), "—");
});

// ---- le boost et le trait qui le donne ----

const LEGEND = { byClass: [
  { classValue: 1000, classLabel: "x10", headwear: ["Blueberries"], count: 37 },
  { classValue: 400,  classLabel: "x4",  headwear: ["Bitcoin Aura", "Ordinals"], count: 429 },
  { classValue: 600,  classLabel: "x6",  headwear: ["None"], count: 81 },
  { classValue: 100,  classLabel: "x1",  headwear: ["Alert","Bad Day","Black Spikes","Blaze","Bowler","Confused","Devil Horns","Fez","Fire Mohawk","Green Mohawk","Halo","Ivory Horns","Smitten","Straw Hat"], count: 7131 },
], ambiguous: [], unpaired: 0 };

const rowFor = (v) => ({ classValue: v, classLabel: "x", docCount: 1, chainCount: 1, inked: half(), dormant: half() });

test("the boost column names the trait that grants it", () => {
  const html = rowsHtml({ rows: [rowFor(1000)], legend: LEGEND });
  assert.match(html, /Blueberries/);
});

test("a boost granted by several traits lists them all when they are few", () => {
  const html = rowsHtml({ rows: [rowFor(400)], legend: LEGEND });
  assert.match(html, /Bitcoin Aura/);
  assert.match(html, /Ordinals/);
});

test("wearing nothing is spelled out, since it is what grants the x6", () => {
  const html = rowsHtml({ rows: [rowFor(600)], legend: LEGEND });
  assert.match(html, /no headwear/i);
  assert.doesNotMatch(html, />None</);
});

// Le x1 rassemble quinze couvre-chefs : les lister remplirait la colonne d'un
// bruit que personne ne lit. Le compte suffit, la liste va dans l'infobulle.
test("a boost granted by many traits is summarised, with the full list on hover", () => {
  const html = rowsHtml({ rows: [rowFor(100)], legend: LEGEND });
  assert.match(html, /14 headwears/);
  assert.doesNotMatch(html, /Straw Hat<\/span>/);
  assert.match(html, /title="[^"]*Straw Hat/);
});

test("with no legend the boost still renders, just without its traits", () => {
  const html = rowsHtml({ rows: [rowFor(1000)] });
  assert.match(html, /class="cls"/);
  assert.doesNotMatch(html, /class="grants"/);
});

// ---- machines re-inkées ----

const inked = (over = {}) => ({
  tokenId: 2248, priceEth: 0.8999, machine: machineOf({ headwear: "None" }),
  weight: 600, inkMult: 1, inkPrinter: 4250, ...over,
});

test("a machine inked to activation carries no badge — there is nothing to flag", () => {
  const html = halfCell(half({ entries: [inked()] }), "ink");
  assert.doesNotMatch(html, /class="reink"/);
});

// 1% du carnet seulement, mais ce 1% pèse le double de ce que sa ligne annonce.
test("a re-inked machine is badged with the weight it actually carries", () => {
  const html = halfCell(half({ entries: [inked({ weight: 1200, inkMult: 2, inkPrinter: 17000 })] }), "ink");
  assert.match(html, /class="reink"[^>]*>12x</);
});

test("the badge spells the whole story on hover", () => {
  const html = halfCell(half({ entries: [inked({ weight: 1200, inkMult: 2, inkPrinter: 17000 })] }), "ink");
  assert.match(html, /burning 4× the base ink/);
  assert.match(html, /17,000 \$PRINTER burned/);
  assert.match(html, /weight 12x/);
});

test("a machine whose weight was never read is not badged on a guess", () => {
  const html = halfCell(half({ entries: [inked({ weight: null, inkMult: null, inkPrinter: null })] }), "ink");
  assert.doesNotMatch(html, /class="reink"/);
});

test("a dormant machine carries no badge either", () => {
  const html = halfCell(half({ entries: [inked({ weight: 0, inkMult: null, inkPrinter: 0 })] }), "dormant");
  assert.doesNotMatch(html, /class="reink"/);
});

// Cinq des sept machines re-inkées en vente tombaient hors des huit moins
// chères : leur badge existait mais personne ne le voyait sans déplier.
test("the expander says when it is hiding a re-inked machine", () => {
  const plain = manyEntries(20).map((e) => ({ ...e, weight: 100, inkMult: 1 }));
  plain[15] = { ...plain[15], weight: 200, inkMult: 2 };
  plain[18] = { ...plain[18], weight: 200, inkMult: 2 };
  const html = halfCell(half({ entries: plain, listed: 20 }), "ink", { limit: 8, key: "100:ink" });
  assert.match(html, /show the last 12, 2 re-inked/);
});

test("an expander hiding nothing special stays plain", () => {
  const plain = manyEntries(20).map((e) => ({ ...e, weight: 100, inkMult: 1 }));
  const html = halfCell(half({ entries: plain, listed: 20 }), "ink", { limit: 8, key: "100:ink" });
  assert.match(html, /show the last 12/);
  assert.doesNotMatch(html, /re-inked/);
});

test("once expanded there is nothing left hidden to announce", () => {
  const plain = manyEntries(20).map((e) => ({ ...e, weight: 200, inkMult: 2 }));
  const html = halfCell(half({ entries: plain, listed: 20 }), "ink", { limit: 8, shown: 20, key: "100:ink" });
  assert.match(html, /show fewer/);
  assert.doesNotMatch(html, /re-inked</);
});

// ---- prix en dollars, partout ----

test("every price carries its dollar value beside it", () => {
  const html = halfCell(half({ entries: [entry(9, 0.1050)] }), "ink", { ethUsd: 1896 });
  assert.match(html, /0\.1050/);
  assert.match(html, /\$199/);        // 0.1050 x 1896
});

test("with no ETH price read, prices stay in ETH rather than inventing dollars", () => {
  const html = halfCell(half({ entries: [entry(9, 0.1050)] }), "ink", { ethUsd: null });
  assert.match(html, /0\.1050/);
  assert.doesNotMatch(html, /\$/);
});

// ---- l'anvil ----

const withBid = (over = {}) => ({
  tokenId: 2774, priceEth: 0.1050, machine: machineOf(),
  weight: 100, inkMult: 1, inkPrinter: 4250,
  anvilBidPrinter: 19316, anvilBidEth: 0.1170, underBid: true, ...over,
});

test("the mark says what the anvil would pay, in both currencies", () => {
  const html = halfCell(half({ entries: [withBid()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /anvil pays 0\.1170 ETH/);
  assert.match(html, /19,316 \$PRINTER/);
});

test("the bar states the anvil's spot, its shelf, and whether it is still bidding", () => {
  const html = contextHtml({ ...CTX, anvil: { spotPrinter: 16082, spotUsd: 194, shelf: 30, bidPaused: false, paused: false, spreadBps: 500 } });
  assert.match(html, /Anvil/i);
  assert.match(html, /16,082/);
  assert.match(html, /30 on the shelf/);
});

// Une offre suspendue doit se lire comme suspendue, pas comme un plancher bas.
test("a paused bid is announced rather than shown as a number", () => {
  const html = contextHtml({ ...CTX, anvil: { spotPrinter: 16082, spotUsd: 194, shelf: 30, bidPaused: true, paused: false, spreadBps: 500 } });
  assert.match(html, /bid paused/i);
});

test("an unreadable anvil says so instead of vanishing from the bar", () => {
  const html = contextHtml({ ...CTX, anvil: null });
  assert.match(html, /Anvil/i);
  assert.match(html, /unreadable/i);
});

// ---- le rayon de l'anvil dans la case ----

const shelfEntry = (over = {}) => ({
  tokenId: 9036, askPrinter: 23464.734, askUsd: 285, askEth: 0.1502,
  machine: machineOf(), ...over,
});

test("a cell shows what the anvil holds, as its own strip", () => {
  const html = halfCell(half({ anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="shelf"/);
  assert.match(html, /On the Anvil/i);
  assert.match(html, /23,465/);        // le montant en $PRINTER
  assert.match(html, /\$285/);
});

// Deux marchés, deux monnaies : les fondre laisserait croire qu'une machine de
// l'anvil s'achète comme un listing OpenSea, ce qui est faux.
test("the anvil's machines never join the OpenSea strip", () => {
  const html = halfCell(half({ entries: [entry(1, 0.105)], anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  const openSeaStrip = html.slice(html.indexOf('class="strip"'), html.indexOf('class="shelf"'));
  assert.match(openSeaStrip, /#1</);
  assert.doesNotMatch(openSeaStrip, /#9036</);
});

test("the strip states the ETH each would cost, so the two markets compare", () => {
  const html = halfCell(half({ anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /0\.1502 ETH/);
});

test("a cell the anvil holds nothing in shows no strip at all", () => {
  const html = halfCell(half({ anvilEntries: [] }), "ink", { ethUsd: 1896 });
  assert.doesNotMatch(html, /class="shelf"/);
});

test("an empty OpenSea cell still shows what the anvil holds there", () => {
  const html = halfCell(half({ entries: [], listed: 0, anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /no listing/);
  assert.match(html, /class="shelf"/);
  assert.match(html, /23,465/);
});

// ---- dépliage par paliers ----

// Un clic dépliait tout : sur les 375 x1 dormantes, c'était 375 images d'un
// bloc. On garde l'accès à l'intégralité, par tranches.
test("the first click reveals a slice, not the whole book", () => {
  const html = halfCell(half({ entries: manyEntries(375), listed: 375 }), "ink",
    { limit: 8, shown: 8, step: 40, key: "100:ink" });
  assert.equal(countChips(html), 8);
  assert.match(html, /show 40 more/);
  assert.match(html, /367 left/);
});

test("each further click adds another slice", () => {
  const html = halfCell(half({ entries: manyEntries(375), listed: 375 }), "ink",
    { limit: 8, shown: 48, step: 40, key: "100:ink" });
  assert.equal(countChips(html), 48);
  assert.match(html, /show 40 more/);
  assert.match(html, /327 left/);
});

test("the last slice says it is the last, rather than promising forty", () => {
  const html = halfCell(half({ entries: manyEntries(20), listed: 20 }), "ink",
    { limit: 8, shown: 8, step: 40, key: "100:ink" });
  assert.match(html, /show the last 12/);
  assert.doesNotMatch(html, /left/);
});

test("once everything is out, only the way back remains", () => {
  const html = halfCell(half({ entries: manyEntries(20), listed: 20 }), "ink",
    { limit: 8, shown: 20, step: 40, key: "100:ink" });
  assert.equal(countChips(html), 20);
  assert.match(html, /show fewer/);
  assert.doesNotMatch(html, /show 40 more/);
});

test("a book that fits under the limit offers nothing at all", () => {
  const html = halfCell(half({ entries: manyEntries(5), listed: 5 }), "ink", { limit: 8, shown: 8, step: 40 });
  assert.equal(countChips(html), 5);
  assert.doesNotMatch(html, /more/);
  assert.doesNotMatch(html, /show fewer/);
});

test("what is still folded away is still counted, re-inked machines included", () => {
  const plain = manyEntries(60).map((e) => ({ ...e, weight: 100, inkMult: 1 }));
  plain[50] = { ...plain[50], weight: 200, inkMult: 2 };
  const html = halfCell(half({ entries: plain, listed: 60 }), "ink", { limit: 8, shown: 8, step: 40, key: "100:ink" });
  assert.match(html, /1 re-inked/);
});

// ---- les trois corrections ----

// Une machine du rayon s'achète sur l'anvil, pas sur OpenSea : l'y envoyer
// menait sur une page où elle n'est pas à vendre.
test("an anvil machine links to the anvil, not to OpenSea", () => {
  const html = halfCell(half({ anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /href="https:\/\/rh\.btcmachine\.gg\/"/);
  const shelf = html.slice(html.indexOf('class="shelf"'));
  assert.doesNotMatch(shelf, /opensea\.io/);
});

test("an OpenSea listing still links to OpenSea", () => {
  const html = halfCell(half({ entries: [entry(1234, 0.105)] }), "ink", { ethUsd: 1896 });
  assert.match(html, /href="https:\/\/opensea\.io\/assets\/robinhood/);
});

// Le prix du rayon est libellé en $PRINTER : il doit s'annoncer comme un prix,
// au même rang que le floor juste au-dessus, pas se perdre dans une légende.
test("the shelf states its price like a price, in the token's own colour", () => {
  const html = halfCell(half({ anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="shelf-price"/);
  assert.match(html, /23,465/);
  assert.match(html, /\$PRINTER/);
  assert.match(html, /\$285/);
});


// Les badges étaient positionnés sur la vignette entière : le vert, en bas,
// retombait sur la ligne du prix en dollars et la recouvrait. Ils doivent être
// ancrés sur l'image, pas sur le bloc.
test("the badge lives inside the image, not over the text", () => {
  const html = halfCell(half({ entries: [withBid({ weight: 200, inkMult: 2 })] }), "ink", { ethUsd: 1896 });
  const thumb = html.match(/<span class="thumb">[^]*?<\/span><\/span>/);
  assert.ok(thumb, "the image must sit in its own positioned wrapper");
  assert.match(thumb[0], /<img/);
  assert.match(thumb[0], /class="reink"/);
  // et le prix reste dehors, donc rien ne peut le recouvrir
  assert.doesNotMatch(thumb[0], /class="price"/);
});

test("a machine with no picture still carries its marks", () => {
  const html = halfCell(half({ entries: [withBid({ machine: null, weight: 200, inkMult: 2, inkPrinter: 17000 })] }),
    "ink", { ethUsd: 1896 });
  assert.match(html, /class="thumb"/);
  assert.match(html, /class="noimg"/);
  assert.match(html, /class="reink"/);
});

// Les deux moitiés d'une case annoncent un prix, chacune avec le mot juste :
// « floor price » pour le carnet, « to pick one » pour le rayon, dont le prix
// inclut une prime. Ce qu'elles partagent, c'est de ne jamais laisser un
// montant sans nom.
test("both halves label their price, each with the right word", () => {
  const html = halfCell(half({ entries: [entry(1, 0.11)], anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  const cut = html.indexOf('class="shelf"');
  const book = html.slice(0, cut);
  const shelf = html.slice(cut);

  assert.match(book, /class="label">floor price<\/span>/);
  assert.match(shelf, /class="label">to pick one<\/span>/);
  assert.ok(shelf.indexOf("to pick one") < shelf.indexOf("23,465"), "the label comes before the amount");
});

// Une case contient deux marchés. Un seul portait son nom, donc le premier ne
// se lisait pas comme une section — juste comme le contenu de la case.
test("both markets in a cell carry their name", () => {
  const html = halfCell(half({ entries: [entry(1, 0.11)], anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="market">On OpenSea /);
  assert.match(html, /class="market">On the Anvil /);
  assert.ok(html.indexOf("On OpenSea") < html.indexOf("On the Anvil"));
});

test("a cell with nothing on OpenSea still says which market is empty", () => {
  const html = halfCell(half({ entries: [], listed: 0, anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="market">On OpenSea /);
  assert.match(html, /no listing/);
  assert.match(html, /class="market">On the Anvil /);
});

test("a cell the anvil holds nothing in names only the market that has something", () => {
  const html = halfCell(half({ entries: [entry(1, 0.11)], anvilEntries: [] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="market">On OpenSea /);
  assert.doesNotMatch(html, /On the Anvil/);
});

// ---- acheter du $PRINTER ----

test("the token block offers the way to buy it", () => {
  const html = contextHtml(CTX);
  assert.match(html, /href="https:\/\/rh\.btcmachine\.gg\/swap"/);
  assert.match(html, /buy \$PRINTER/i);
});

// ---- la caisse ----

// Une seule ligne, collée aux filtres : ce que coûte une machine tirée au sort.
test("the crate line says what it costs, in both currencies", () => {
  const html = crateLine({ cratePrinter: 14652, crateUsd: 195, paused: false });
  assert.match(html, /try your luck/i);
  assert.match(html, /14,652/);
  assert.match(html, /\$195/);
  assert.match(html, /drawn at random/i);
  assert.match(html, /href="https:\/\/rh\.btcmachine\.gg\/"/);
});

test("no crate price means no line at all", () => {
  assert.equal(crateLine(null), "");
  assert.equal(crateLine({ cratePrinter: null, crateUsd: null }), "");
});

test("a paused anvil is not invited to be gambled with", () => {
  const html = crateLine({ cratePrinter: 14652, crateUsd: 195, paused: true });
  assert.match(html, /paused/i);
  assert.doesNotMatch(html, /try your luck/i);
});

// Le prix du rayon inclut une prime de 10% pour désigner sa machine. L'appeler
// « floor price » le faisait passer pour un tarif, alors que le prix de file
// est plus bas et achète une machine — juste pas celle-là.
test("the shelf calls its price what it is: the cost of picking one", () => {
  const html = halfCell(half({ anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /to pick one/i);
  assert.doesNotMatch(html.slice(html.indexOf('class="shelf"')), /floor price/i);
});



// Deux constructeurs de vignette avaient dérivé : le badge de re-encrage
// n'existait que du côté OpenSea, et #4173 — une x10 au plafond, donc 20x —
// passait pour une x10 ordinaire sur le rayon. Un seul constructeur désormais.
test("a re-inked machine is badged on the shelf too", () => {
  const html = halfCell(half({
    anvilEntries: [shelfEntry({ tokenId: 4173, askPrinter: 318395, askUsd: 4066, weight: 2000, inkMult: 2 })],
  }), "ink", { ethUsd: 1896 });
  const shelf = html.slice(html.indexOf('class="shelf"'));
  assert.match(shelf, /class="reink"[^>]*>20x</);
});

test("a shelf machine at plain ink carries no badge", () => {
  const html = halfCell(half({ anvilEntries: [shelfEntry({ weight: 100, inkMult: 1 })] }), "ink", { ethUsd: 1896 });
  assert.doesNotMatch(html.slice(html.indexOf('class="shelf"')), /class="reink"/);
});

// L'anvil ne peut pas vendre sous sa propre offre : la marque verte n'a pas de
// sens de ce côté.
test("the shelf never carries the under-bid mark", () => {
  const html = halfCell(half({
    anvilEntries: [shelfEntry({ underBid: true, anvilBidEth: 9 })],
  }), "ink", { ethUsd: 1896 });
  assert.doesNotMatch(html.slice(html.indexOf('class="shelf"')), /class="under"/);
});

// Chaque valeur du bandeau est en ambre, sans exception : deux blocs neutres au
// milieu de six colorés se lisaient comme des oublis, pas comme une règle.
test("every value in the bar is amber", () => {
  const html = contextHtml({ ...CTX, anvil: { spotPrinter: 14100, spotUsd: 168, shelf: 18, bidPaused: false } });
  assert.equal(html.match(/<div class="stat">/g).length, 10);
  assert.doesNotMatch(html, /is-price/);
});

// Le seul bloc dont la valeur mêlait un chiffre et un mot : « Machines /
// 6,632 inked ». Partout ailleurs l'intitulé nomme et la valeur est un nombre.
test("every block in the bar states a bare figure, named by its label", () => {
  const html = contextHtml({ ...CTX, anvil: { spotPrinter: 14100, spotUsd: 168, shelf: 18, bidPaused: false } });
  const machines = html.split('<div class="stat').find((b) => b.includes("Inked machines"));
  assert.ok(machines, "the block should be named for what it counts");
  assert.match(machines, /class="v">6,216<\/span>/);
  assert.match(machines, /3,784 dormant/);
  assert.doesNotMatch(html, />[\d,]+ inked</);
});

// Deux cases dont le rayon n'a pas le même prix doivent afficher chacune le
// sien : un prix partagé entre raretés passerait inaperçu tant que la courbe
// de l'anvil les rapproche.
test("each cell shows its own shelf price, never a neighbour's", () => {
  const cheap = halfCell(half({ anvilEntries: [shelfEntry({ tokenId: 1, askPrinter: 15217, askUsd: 133 })] }), "ink", { ethUsd: 1896 });
  const dear = halfCell(half({ anvilEntries: [shelfEntry({ tokenId: 2, askPrinter: 51128, askUsd: 447 })] }), "ink", { ethUsd: 1896 });

  assert.match(cheap, /class="price">15,217</);
  assert.match(dear, /class="price">51,128</);
  assert.doesNotMatch(cheap, /51,128/);
  assert.doesNotMatch(dear, /15,217/);
});

// ---- les trois corrections ----

// Sept vignettes portant le même prix que l'en-tête vient d'annoncer, c'est
// quatorze nombres pour une information. Il ne se répète que s'il varie.
// Je les avais tues pour ne pas répéter l'en-tête. À côté d'un carnet où
// chaque machine affiche son prix, trois vignettes muettes se lisent comme une
// donnée manquante — l'économie coûtait plus qu'elle ne rapportait.
test("a shelf machine carries its price even when they all share one", () => {
  const same = [shelfEntry({ tokenId: 1 }), shelfEntry({ tokenId: 2 }), shelfEntry({ tokenId: 3 })];
  const html = halfCell(half({ anvilEntries: same }), "ink", { ethUsd: 1896 });
  const shelf = html.slice(html.indexOf('class="shelf"'));
  // l'en-tête, puis une fois par vignette
  assert.equal((shelf.match(/class="price">23,465</g) || []).length, 4);
  assert.equal((shelf.match(/class="usd">\$285</g) || []).length, 3);
});

test("a shelf whose prices differ keeps them on every machine", () => {
  const mixed = [shelfEntry({ tokenId: 1, askPrinter: 23465, askUsd: 285 }),
                 shelfEntry({ tokenId: 2, askPrinter: 23531, askUsd: 286 })];
  const html = halfCell(half({ anvilEntries: mixed }), "ink", { ethUsd: 1896 });
  assert.match(html, /23,465/);
  assert.match(html, /23,531/);
});

// La comparaison ne marchait que dans un sens, et ce sens dépend d'une offre
// d'achat que le protocole peut suspendre — comme en ce moment.
test("the shelf says when it undercuts the book", () => {
  const html = halfCell(half({
    entries: [entry(1, 0.0790)],
    anvilEntries: [shelfEntry({ askEth: 0.0787 })],
  }), "ink", { ethUsd: 1896 });
  assert.match(html, /cheaper than anything on OpenSea/i);
  assert.match(html, /0\.0787/);
  assert.match(html, /0\.0790/);
});

test("a shelf dearer than the book says nothing", () => {
  const html = halfCell(half({
    entries: [entry(1, 0.0740)],
    anvilEntries: [shelfEntry({ askEth: 0.0787 })],
  }), "ink", { ethUsd: 1896 });
  assert.doesNotMatch(html, /cheaper than anything/i);
});

test("with nothing on OpenSea there is nothing to undercut", () => {
  const html = halfCell(half({ entries: [], listed: 0, anvilEntries: [shelfEntry({ askEth: 0.0787 })] }), "ink", { ethUsd: 1896 });
  assert.doesNotMatch(html, /cheaper than anything/i);
});

// ---- filtrer par stock ----

test("filtering by stock keeps the machines that farm it", () => {
  const msft = machineOf({ desk: "health" });
  const cost = machineOf({ desk: "utilities" });
  assert.equal(matchesFilter(msft, { ...NO_FILTER, Desk: "health" }), true);
  assert.equal(matchesFilter(cost, { ...NO_FILTER, Desk: "health" }), false);
});

test("a machine whose desk could not be resolved never satisfies a stock filter", () => {
  assert.equal(matchesFilter(machineOf({ desk: null }), { ...NO_FILTER, Desk: "health" }), false);
});

test("the stock filter combines with the cosmetic ones", () => {
  const f = { ...NO_FILTER, Desk: "health", Headwear: "Halo" };
  assert.equal(matchesFilter(machineOf({ ticker: "MSFT", headwear: "Halo" }), f), true);
  assert.equal(matchesFilter(machineOf({ ticker: "MSFT", headwear: "Blade" }), f), false);
});

test("the bar offers the stock menu first, before the cosmetic three", () => {
  const html = filterBarHtml({
    Desk: [{ value: "MSFT", listed: 12, total: 886 }],
    Headwear: [{ value: "Halo", listed: 9, total: 37 }],
    Body: [{ value: "Sky", listed: 12, total: 501, ticker: "MSFT" }],
    Eyes: [{ value: "UwU", listed: 3, total: 600 }],
  }, NO_FILTER);
  assert.equal((html.match(/<select/g) || []).length, 4);
  assert.ok(html.indexOf('data-trait="Desk"') < html.indexOf('data-trait="Headwear"'));
  assert.match(html, /MSFT/);
});

// Le filtre traversait le carnet mais pas le rayon : une case pouvait annoncer
// « 0 correspondance » tout en affichant huit machines de l'anvil.
test("a filter narrows the shelf as well as the book", () => {
  const html = halfCell(half({
    entries: [],
    listed: 0,
    anvilEntries: [
      shelfEntry({ tokenId: 1, machine: machineOf({ desk: "health" }) }),
      shelfEntry({ tokenId: 2, machine: machineOf({ desk: "utilities" }) }),
    ],
  }), "ink", { ethUsd: 1896, filter: { ...NO_FILTER, Desk: "health" } });
  assert.match(html, /#1</);
  assert.doesNotMatch(html, /#2</);
});

test("a shelf with nothing matching disappears rather than contradicting the count", () => {
  const html = halfCell(half({
    entries: [], listed: 0,
    anvilEntries: [shelfEntry({ tokenId: 2, machine: machineOf({ desk: "utilities" }) })],
  }), "ink", { ethUsd: 1896, filter: { ...NO_FILTER, Desk: "health" } });
  assert.doesNotMatch(html, /class="shelf"/);
});

test("with no filter the shelf shows everything it holds", () => {
  const html = halfCell(half({
    entries: [], listed: 0,
    anvilEntries: [shelfEntry({ tokenId: 1 }), shelfEntry({ tokenId: 2 })],
  }), "ink", { ethUsd: 1896 });
  assert.match(html, /#1</);
  assert.match(html, /#2</);
});

// ---- la vue « prix du point de poids » ----------------------------------
//
// Le poids est ce qui paie. Comparer sept floors ne dit donc pas où l'on
// achète le moins cher : il faut ramener chaque annonce au prix d'un point
// de poids, et pour une dormante ce prix inclut l'ink qu'il faudra brûler.

const RATES = { ethUsd: 2000, activationUsd: 50 };   // 5 000 $PRINTER à $0.01
const wEntry = (tokenId, priceEth, weight) =>
  ({ ...entry(tokenId, priceEth), weight, inkMult: 1, inkPrinter: 4250 });

test("an inked machine costs its price divided by the weight it already carries", () => {
  // 0.15 ETH × $2000 = $300, pour 3 points de poids
  assert.equal(perPointUsd(wEntry(1, 0.15, 300), { ...RATES, side: "ink" }), 100);
});

test("a dormant machine carries the ink it will have to burn", () => {
  // 0.10 ETH = $200, plus $50 d'activation, pour les 2 points de sa classe
  assert.equal(perPointUsd(wEntry(1, 0.10, 0), { ...RATES, side: "dormant", classValue: 200 }), 125);
});

test("without an eth rate no cost per point is invented", () => {
  assert.equal(perPointUsd(wEntry(1, 0.15, 300), { ethUsd: null, activationUsd: 50, side: "ink" }), null);
});

test("without a read activation cost a dormant machine has no knowable entry", () => {
  assert.equal(perPointUsd(wEntry(1, 0.10, 0), { ethUsd: 2000, activationUsd: null, side: "dormant", classValue: 200 }), null);
});

test("a machine of unknown weight is ranked nowhere rather than at zero", () => {
  assert.equal(perPointUsd(wEntry(1, 0.15, 0), { ...RATES, side: "ink" }), null);
});

test("the value view leads with the cost of a weight point, named as such", () => {
  const html = halfCell(half({ entries: [wEntry(1, 0.15, 300)] }), "ink",
    { view: "value", classValue: 300, ...RATES });
  assert.match(html, /\$100/);
  assert.match(html, /weight point/i);
  assert.doesNotMatch(html, /floor price/);
});

test("the value view ranks by the point, so a dearer machine can come first", () => {
  // #1 coûte $600 mais porte 6 points ($100) ; #2 coûte $320 pour 3 ($107).
  const html = halfCell(half({ entries: [wEntry(2, 0.16, 300), wEntry(1, 0.30, 600)] }), "ink",
    { view: "value", classValue: 300, ...RATES });
  assert.ok(html.indexOf("#1<") < html.indexOf("#2<"), "le moins cher au point passe devant");
});

test("the floor view still ranks by what the machine costs", () => {
  const html = halfCell(half({ entries: [wEntry(2, 0.16, 300), wEntry(1, 0.30, 600)] }), "ink",
    { view: "floor", classValue: 300, ...RATES });
  assert.ok(html.indexOf("#2<") < html.indexOf("#1<"), "le moins cher en ETH passe devant");
});

test("a dormant cell says the activation is counted in", () => {
  const html = halfCell(half({ entries: [wEntry(1, 0.10, 0)] }), "dormant",
    { view: "value", classValue: 200, ...RATES });
  assert.match(html, /activation included/i);
});

test("an inked cell claims no activation, having nothing to burn", () => {
  const html = halfCell(half({ entries: [wEntry(1, 0.15, 300)] }), "ink",
    { view: "value", classValue: 300, ...RATES });
  assert.doesNotMatch(html, /activation included/i);
});

const valueRows = {
  eth: { usd: 2000 }, ink: { activationTotalUsd: 50 },
  rows: [
    { classValue: 100, classLabel: "x1", docCount: 1, chainCount: 1,
      inked: half({ entries: [wEntry(11, 0.10, 100)] }), dormant: half({ entries: [] }) },   // $200 /point
    { classValue: 300, classLabel: "x3", docCount: 1, chainCount: 1,
      inked: half({ entries: [wEntry(33, 0.15, 300)] }), dormant: half({ entries: [] }) },   // $100 /point
  ],
};

test("the value view floats the class where a point costs least to the top", () => {
  const html = rowsHtml(valueRows, { view: "value" });
  assert.ok(html.indexOf(">x3<") < html.indexOf(">x1<"), "x3 achète le point moins cher que x1");
});

test("the floor view leaves the classes in their documented order", () => {
  const html = rowsHtml(valueRows, { view: "floor" });
  assert.ok(html.indexOf(">x1<") < html.indexOf(">x3<"));
});

test("the view is a choice the reader makes, and the current one is marked", () => {
  const html = viewBarHtml("value");
  assert.match(html, /data-view/);
  assert.equal((html.match(/<option/g) ?? []).length, 2);
  assert.match(html, /value"\s+selected|selected[^>]*>[^<]*weight point/);
  assert.match(html, /floor price/i);
});

// Deux marchés indépendants dans une même ligne : aucun tri ne peut rendre les
// deux colonnes croissantes. Le rang se lit donc sur le chiffre qui l'a décidé,
// affiché à gauche — sans lui l'ordre paraît arbitraire, parce que le nombre
// qui range la ligne peut se trouver dans la colonne qu'on ne regarde pas.
test("the value view shows the number that ranks each class, and which side it came from", () => {
  const html = rowsHtml(valueRows, { view: "value" });
  const x3 = html.slice(html.indexOf(">x3<"), html.indexOf(">x1<"));
  assert.match(x3, /\$100/);
  assert.match(x3, /inked/i);
});

test("a class ranked by its dormant side says so, not the other", () => {
  const rows = {
    eth: { usd: 2000 }, ink: { activationTotalUsd: 50 },
    rows: [{
      classValue: 200, classLabel: "x2", docCount: 1, chainCount: 1,
      inked: half({ entries: [wEntry(1, 0.20, 200)] }),        // $400 / 2 pts = $200
      dormant: half({ entries: [wEntry(2, 0.10, 0)] }),        // ($200+$50) / 2 = $125
    }],
  };
  const cell = rowsHtml(rows, { view: "value" });
  const left = cell.slice(cell.indexOf("cls-cell"), cell.indexOf("g-ink"));
  assert.match(left, /\$125/);
  assert.match(left, /dormant/i);
  assert.doesNotMatch(left, /\$200/);
});

test("the floor view leaves the rarity column alone", () => {
  const html = rowsHtml(valueRows, { view: "floor" });
  assert.doesNotMatch(html, /cls-point/);
});

test("a class with nothing on sale is ranked nowhere and claims no price", () => {
  const rows = {
    eth: { usd: 2000 }, ink: { activationTotalUsd: 50 },
    rows: [
      { classValue: 100, classLabel: "x1", docCount: 1, chainCount: 1,
        inked: half({ entries: [] }), dormant: half({ entries: [] }) },
      { classValue: 300, classLabel: "x3", docCount: 1, chainCount: 1,
        inked: half({ entries: [wEntry(33, 0.15, 300)] }), dormant: half({ entries: [] }) },
    ],
  };
  const html = rowsHtml(rows, { view: "value" });
  assert.ok(html.indexOf(">x3<") < html.indexOf(">x1<"), "une classe sans rien en vente tombe en bas");
  const x1 = html.slice(html.indexOf(">x1<"));
  assert.doesNotMatch(x1.slice(0, x1.indexOf("g-ink")), /cls-point/);
});

// Le montant était compté sans jamais être écrit : la case disait « activation
// included » et laissait deviner combien. C'est précisément ce qui faisait
// douter que le coût soit compté du tout.
test("a dormant cell names what the activation costs, not just that it counts", () => {
  const html = halfCell(half({ entries: [wEntry(1, 0.10, 0)] }), "dormant",
    { view: "value", classValue: 200, ...RATES });
  assert.match(html, /activation included, \$50/);
});

// ---- le bulletin ---------------------------------------------------------
//
// Le scrutin décide de la taille des parts du pot, donc du coefficient qui
// s'applique par desk. Trois états qu'un tableau de zéros confondrait.

const ballot = (over = {}) => ({
  opened: true, finalized: false, closesAt: 1000 + 30 * 3600e3, conflicts: [],
  desks: [
    { index: 0, desk: "energy", votedWeight: 6000, share: 0.6 },
    { index: 5, desk: "health", votedWeight: 4000, share: 0.4 },
    { index: 13, desk: "retail", votedWeight: 0, share: 0 },
  ], ...over,
});

test("a ballot nobody could open announces no share at all", () => {
  const html = ballotBlock(ballot({ opened: false, desks: [] }), 1, 1000);
  assert.match(html, /not open yet/);
  assert.match(html, /epoch 1/);
  assert.doesNotMatch(html, /0\.0%/);
});

test("an open ballot leads with the desk that drew most, and the time left", () => {
  const html = ballotBlock(ballot(), 1, 1000);
  assert.match(html, /energy 60\.0%/);
  assert.match(html, /closes in 30h/);
  assert.match(html, /2 of 16 desks drew votes/);   // USAR à zéro n'en est pas
});

test("an open ballot with not one vote says so, rather than showing a winner", () => {
  const html = ballotBlock(ballot({ desks: [{ index: 0, desk: "energy", votedWeight: 0, share: null }] }), 1, 1000);
  assert.match(html, /no vote yet/);
  assert.doesNotMatch(html, /energy/);
});

test("a ballot that could not be read says so, never that nothing was voted", () => {
  const html = ballotBlock(null, 1, 1000);
  assert.match(html, /unreadable/);
  assert.doesNotMatch(html, /not open/);
});

test("the stock menu carries what each desk drew out of the pot", () => {
  const html = filterBarHtml(
    { Desk: [{ value: "energy", listed: 116, total: 1245 }, { value: "health", listed: 150, total: 1322 }],
      Headwear: [], Body: [], Eyes: [] },
    NO_FILTER, ballot());
  assert.match(html, /energy — 60\.0% of the pot \(116 on sale of 1,245\)/);
  assert.match(html, /health — 40\.0% of the pot/);
});

// Le desk n'a de valeur mesurable que pendant une epoch votée. Hors bulletin le
// menu ne doit rien laisser entendre : une part absente n'est pas une part nulle.
test("with no ballot the stock menu claims no share", () => {
  const html = filterBarHtml(
    { Desk: [{ value: "energy", listed: 116, total: 1245 }], Headwear: [], Body: [], Eyes: [] },
    NO_FILTER, null);
  assert.match(html, /energy \(116 on sale of 1,245\)/);
  assert.doesNotMatch(html, /of the pot/);
});

test("only the stock menu speaks of the pot; the cosmetic three cannot", () => {
  const html = filterBarHtml(
    { Desk: [{ value: "energy", listed: 1, total: 1 }], Headwear: [{ value: "energy", listed: 1, total: 1 }],
      Body: [], Eyes: [] },
    NO_FILTER, ballot());
  assert.equal((html.match(/of the pot/g) ?? []).length, 1);
});

// Les tickers viennent aujourd'hui d'un recensement figé de seize chaînes, donc
// rien ne peut s'y glisser. La règle de la maison ne dépend pas de ça : tout ce
// qui entre dans du balisage est échappé, pour que la sûreté survive au jour où
// la source changera.
test("a ticker is escaped on its way into the page, wherever it came from", () => {
  const evil = '<img src=x onerror=alert(1)>';
  const bar = filterBarHtml(
    { Desk: [{ value: evil, listed: 1, total: 1 }], Headwear: [], Body: [], Eyes: [] },
    NO_FILTER);
  assert.doesNotMatch(bar, /<img src=x/);
  assert.match(bar, /&lt;img src=x/);

  const block = ballotBlock({
    opened: true, closesAt: null, finalized: false, conflicts: [],
    desks: [{ index: 0, desk: evil, votedWeight: 10, share: 1 }],
  }, 1, 1000);
  assert.doesNotMatch(block, /<img src=x/);
  assert.match(block, /&lt;img src=x/);
});

// Trois nombres empilés dont deux en dollars : sans un mot, le vert ne se
// devine pas. La vignette le nomme, et une ligne dit d'où il sort.
test("the green figure names itself on every machine", () => {
  const html = halfCell(half({ entries: [{ ...entry(1, 0.1), weight: 100, epochUsd: 12.6 }] }), "ink", { ethUsd: 1900 });
  assert.match(html, /class="earns">\$12\.60<\/span><span class="per">this drop/);
});

test("a machine with no readable return shows no green figure at all", () => {
  const html = halfCell(half({ entries: [{ ...entry(1, 0.1), weight: 100, epochUsd: null }] }), "ink", { ethUsd: 1900 });
  assert.doesNotMatch(html, /class="earns"/);
  assert.doesNotMatch(html, /this drop/);
});

test("the note says where the money comes from and that weight splits it", () => {
  const note = dropNote({ pot: { usd: 160790 }, vote: { opened: false } });
  assert.match(note, /Sell fees/);
  assert.match(note, /\$161k/);
  assert.match(note, /by weight/);
  assert.match(note, /green/);
});

// Le pot ne tombe pas toutes les 3,5 jours : il tombe quand un bulletin se
// clôt. Annoncer une cadence que le protocole ne tient pas serait pire que se taire.
test("the note promises no rhythm the protocol does not keep", () => {
  const waiting = dropNote({ pot: { usd: 160790 }, vote: { opened: false } });
  assert.match(waiting, /keeps piling up until one closes/);
  const open = dropNote({ pot: { usd: 160790 }, vote: { opened: true } });
  assert.match(open, /pays out when that ballot closes/);
});

test("with no pot read the note stays silent rather than explaining nothing", () => {
  assert.equal(dropNote({ pot: { usd: null } }), "");
  assert.equal(dropNote(null), "");
});

// Les centimes ne sont pas du détail : c'est le chiffre que le porteur compare
// à celui du terminal officiel, qui affiche $84.60. Arrondir à $85 ferait
// douter de la source alors que les deux calculs concordent.
test("the return keeps its cents, so it can be checked against the terminal", () => {
  const html = halfCell(half({ entries: [{ ...entry(1, 0.1), weight: 600, epochUsd: 84.6023 }] }), "ink", { ethUsd: 1900 });
  assert.match(html, /class="earns">\$84\.60</);
});

// ---- la bande de tête ----------------------------------------------------
//
// Sept lignes de rareté ne se comparent pas entre elles : chacune tient son
// propre carnet. La bande de tête est le seul endroit où une x1 et une x10
// s'affrontent, sur la seule question qui les rapproche — combien de pot pour
// combien de dollars.

const BEST = {
  eth: { usd: 2000 },
  pot: { usd: 100000, fleetWeight: 1000000 },
  ink: { activationTotalUsd: 50 },
  rows: [
    { classValue: 100, classLabel: "x1", docCount: 1, chainCount: 1,
      // #1 : poids 100 → gagne $10, coûte $200 → 5%
      inked: half({ entries: [{ ...entry(1, 0.10), weight: 100, epochUsd: 10 }] }),
      dormant: half({ entries: [] }) },
    { classValue: 1000, classLabel: "x10", docCount: 1, chainCount: 1,
      // #2 : poids 1000 → gagne $100, coûte $400 → 25%
      inked: half({ entries: [{ ...entry(2, 0.20), weight: 1000, epochUsd: 100 }] }),
      dormant: half({ entries: [] }) },
  ],
};

test("the top strip ranks by what a machine earns for what it costs", () => {
  const html = bestRow(BEST, { ethUsd: 2000 });
  assert.ok(html.indexOf("#2<") < html.indexOf("#1<"), "la x10 rapporte 25% de son prix, la x1 5%");
  assert.match(html, /25\.0%/);
});

test("the strip spans both columns, being about neither", () => {
  const html = bestRow(BEST, { ethUsd: 2000 });
  assert.match(html, /colspan="2"/);
  assert.equal((html.match(/<td/g) ?? []).length, 2);
});

// Une dormante pèse zéro et gagnerait donc zéro pour toujours. C'est ce qu'elle
// pèsera une fois activée qui compte, contre ce qu'il faut sortir pour l'activer.
test("a dormant machine is ranked on what it would earn, against what activating costs", () => {
  // poids de classe 1000 → gagnerait $100 ; coûte $200 + $50 d'activation → 40%
  const y = yieldOf({ weight: 0 }, {
    side: "dormant", classValue: 1000, potUsd: 100000, fleetWeight: 1000000,
    activationUsd: 50, priceUsd: 200,
  });
  assert.equal(y, 0.4);
});

test("an inked machine is ranked on its price alone, having nothing left to burn", () => {
  const y = yieldOf({ weight: 1000 }, {
    side: "ink", classValue: 1000, potUsd: 100000, fleetWeight: 1000000,
    activationUsd: 50, priceUsd: 200,
  });
  assert.equal(y, 0.5);
});

test("without a pot there is no ranking to make, and no strip", () => {
  assert.equal(bestRow({ ...BEST, pot: { usd: null, fleetWeight: null } }, { ethUsd: 2000 }), "");
  assert.equal(yieldOf({ weight: 100 }, { side: "ink", potUsd: null, fleetWeight: 1e6, priceUsd: 200 }), null);
});

// Le rayon est un second marché, dans une autre monnaie : il garde sa bande
// séparée, ici comme dans les lignes de rareté.
test("the anvil keeps its own strip in the top band", () => {
  const withShelf = {
    ...BEST,
    rows: [{ ...BEST.rows[0],
      inked: half({ entries: [{ ...entry(1, 0.10), weight: 100, epochUsd: 10 }],
                    anvilEntries: [{ tokenId: 900, askPrinter: 20000, askUsd: 150, askEth: 0.075,
                                     machine: machineOf(), weight: 100 }] }) }],
  };
  const html = bestRow(withShelf, { ethUsd: 2000 });
  assert.match(html, /class="shelf"/);
  assert.match(html, /On the Anvil/);
  assert.match(html, /#900</);
});

test("the top strip obeys the filter like everything else", () => {
  const filtered = bestRow(BEST, { ethUsd: 2000, filter: { ...NO_FILTER, Desk: "nowhere" } });
  assert.equal(filtered, "");
});

// Une machine qui ne gagne rien ne peut pas être « la meilleure ». Et ce n'est
// pas qu'une question de mot : inkée aujourd'hui elle serait « Lit », donc elle
// ne toucherait rien de ce pot-ci. La classer dessus promettrait un versement
// qu'elle ne recevra pas.
test("a machine that earns nothing is never among the best", () => {
  const withDormant = {
    ...BEST,
    rows: [{ classValue: 1000, classLabel: "x10", docCount: 1, chainCount: 1,
      inked: half({ entries: [{ ...entry(1, 0.10), weight: 100, epochUsd: 10 }] }),
      dormant: half({ entries: [{ ...entry(7, 0.01), weight: 0, epochUsd: 0 }] }) }],
  };
  const html = bestRow(withDormant, { ethUsd: 2000 });
  assert.match(html, /#1</);
  assert.doesNotMatch(html, /#7</);   // dix fois moins chère, et pourtant absente
  assert.doesNotMatch(html, /once inked/);
});

test("a band with nothing earning in it does not appear at all", () => {
  const allDormant = {
    ...BEST,
    rows: [{ classValue: 1000, classLabel: "x10", docCount: 1, chainCount: 1,
      inked: half({ entries: [] }),
      dormant: half({ entries: [{ ...entry(7, 0.01), weight: 0, epochUsd: 0 }] }) }],
  };
  assert.equal(bestRow(allDormant, { ethUsd: 2000 }), "");
});

// Dans les lignes de rareté en revanche, zéro est la vérité : une dormante ne
// gagne rien tant que rien n'a brûlé, et la vignette ne doit pas le maquiller.
test("outside the top strip a dormant machine still earns nothing, and says so", () => {
  const html = halfCell(half({ entries: [{ ...entry(7, 0.1), weight: 0, epochUsd: 0 }] }), "dormant", { ethUsd: 2000 });
  assert.match(html, /class="earns">\$0\.00<\/span><span class="per">this drop/);
  assert.doesNotMatch(html, /once inked/);
});

// « earns $0.00 an epoch at weight 0x » est une façon absurde de dire qu'une
// machine dort. L'infobulle annonce ce qui la réveillerait.
test("a dormant machine's tooltip names the delay, not just the zero", () => {
  const html = halfCell(half({ entries: [{ ...entry(7, 0.1), weight: 0, epochUsd: 0 }] }), "dormant", { ethUsd: 2000 });
  assert.match(html, /earns nothing until it is inked/);
  assert.match(html, /only starts earning at the next one/);
  assert.doesNotMatch(html, /at weight 0x/);
});

// La bande tient sur les deux colonnes : huit vignettes y laissaient les deux
// tiers de la ligne vides, alors que les lignes de rareté, elles, n'ont qu'une
// colonne à remplir.
test("the top band shows enough machines to fill the width it spans", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...entry(1000 + i, 0.10 + i / 1000), weight: 100, epochUsd: 10,
  }));
  const html = bestRow({ ...BEST, rows: [{ classValue: 100, classLabel: "x1", docCount: 1, chainCount: 1,
    inked: half({ entries: many }), dormant: half({ entries: [] }) }] }, { ethUsd: 2000 });
  assert.equal(countChips(html), BEST_LIMIT);
  assert.ok(BEST_LIMIT > DEFAULT_LIMIT, "elle en montre plus qu'une case de rareté");
});

test("the band still offers the rest behind its own button", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    ...entry(1000 + i, 0.10 + i / 1000), weight: 100, epochUsd: 10,
  }));
  const html = bestRow({ ...BEST, rows: [{ classValue: 100, classLabel: "x1", docCount: 1, chainCount: 1,
    inked: half({ entries: many }), dormant: half({ entries: [] }) }] }, { ethUsd: 2000 });
  assert.match(html, /data-key="best"/);
  assert.match(html, /20 left/);
});

// Vingt vignettes dans une bande qui en loge dix-neuf laissaient une orpheline
// seule sur une seconde ligne. La bande traverse les deux colonnes, donc sa
// largeur suit l'écran : un compte fixe ne peut pas convenir.
test("the band fills whole rows, never leaving one machine alone below", () => {
  // 19 tiennent dans 1615px : 19 × 78 + 18 × 7 = 1608
  assert.equal(bestFit({ availablePx: 1615 }), 38);
  assert.equal(bestFit({ availablePx: 1615, rows: 1 }), 19);
});

test("a narrow screen still gets whole rows, just fewer per row", () => {
  assert.equal(bestFit({ availablePx: 340 }), 8);   // 4 par rangée
  assert.equal(bestFit({ availablePx: 78 }), 2);    // 1 par rangée
});

test("a width too small for one machine still shows one rather than none", () => {
  assert.equal(bestFit({ availablePx: 20 }), 2);
});

// Sans mesure — le premier rendu, avant que la bande n'existe — on retombe sur
// le repli plutôt que sur zéro vignette.
test("with nothing to measure the band falls back rather than emptying", () => {
  assert.equal(bestFit({ availablePx: 0 }), BEST_LIMIT);
  assert.equal(bestFit({ availablePx: null }), BEST_LIMIT);
});

test("the band's reveal step is a whole band, so every row stays full", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({
    ...entry(1000 + i, 0.10 + i / 10000), weight: 100, epochUsd: 10,
  }));
  const data = { ...BEST, rows: [{ classValue: 100, classLabel: "x1", docCount: 1, chainCount: 1,
    inked: half({ entries: many }), dormant: half({ entries: [] }) }] };
  const html = rowsHtml(data, { bestLimit: 19 });
  const band = html.slice(0, html.indexOf("</tr>"));
  assert.equal((band.match(/class="chip/g) ?? []).length, 19);
  assert.match(band, /data-next="38"/);
});

// « Best » ne disait pas best de quoi. « ROI » est exactement ce que la bande
// classe : ce que la machine rapporte sur ce qu'elle coûte. Pas « RR » — un
// rapport risque/rendement supposerait une mesure de risque que rien ici ne calcule.
test("the band says what it ranks, not merely that something is best", () => {
  const html = bestRow(BEST, { ethUsd: 2000 });
  assert.match(html, /class="cls">Best ROI</);
  assert.match(html, /best ROI</);
  assert.doesNotMatch(html, /class="cls">Best</);
});

test("the band claims no risk measure it does not compute", () => {
  const html = bestRow(BEST, { ethUsd: 2000 });
  assert.doesNotMatch(html, /\bRR\b|risk/i);
});

// ---- le portefeuille du visiteur -----------------------------------------

const WALLET = {
  address: "0xe908ba570259e4bb1e1fdd2edd9b15e092b13211",
  machines: [
    { tokenId: 4347, weight: 200, deskIndex: 10, desk: "real estate", ticker: "SPCX", epochUsd: 27.72 },
    { tokenId: 463, weight: 100, deskIndex: 9, desk: "utilities", ticker: "GME", epochUsd: 13.86 },
  ],
  awake: 2, dormant: 0, weight: 300, share: 0.000253, cutUsd: 39.12,
  advice: { base: 39.09, best: { index: 10, desk: "real estate", ticker: "SPCX", held: true, heldWeight: 200, cutUsd: 39.12, gainUsd: 0.046 }, options: [] },
};

// Le bandeau répétait, à cent pixels d'écart, les trois chiffres des cartes du
// dessous : le verdict, la valeur et la part du pot. Ne reste que ce sur quoi
// on agit — quel portefeuille est lu, et par où en lire un autre.
test("the bar repeats none of the answers it sits above", () => {
  const html = walletCardHtml(WALLET);
  assert.match(html, /class="v">0xe908…3211</);
  assert.match(html, /another wallet/);
  assert.doesNotMatch(html, /\$/);
  assert.doesNotMatch(html, /Vote /);
  assert.doesNotMatch(html, /of the fleet/);
});

// Tant que rien n'est demandé, la carte est le champ : elle ne prend pas une
// ligne de plus que les dix autres cartes du bandeau.
test("with nothing asked the line is simply the field", () => {
  const html = walletCardHtml(null);
  assert.match(html, /id="wallet-input"/);
  assert.match(html, /nothing to sign/);
  assert.doesNotMatch(html, /class="v"/);
});

test("the detail names the desk and why it wins", () => {
  const html = walletDetailHtml(WALLET);
  assert.match(html, /real estate/);
  assert.match(html, /2\.00x of your 3\.00x sit there/);
});

// Un bulletin isolé rapporte des centimes. Le taire rendrait le conseil plus
// vendeur et ferait croire à un levier qui n'existe pas.
test("the detail says what a single vote is really worth, without dressing it up", () => {
  const html = walletDetailHtml(WALLET);
  assert.match(html, /worth <b>\$0\.05<\/b>/);
  assert.match(html, /barely moves a\s+ballot/);
});

// Cette page était la seule à parler de machines sans en montrer une.
test("the wallet shows its machines as pictures, like the market does", () => {
  const html = walletDetailHtml({ ...WALLET, machines: WALLET.machines.map((m) => ({ ...m, image: `https://img/${m.tokenId}.webp` })) });
  assert.match(html, /class="chip/);
  assert.match(html, /src="https:\/\/img\/4347\.webp"/);
  assert.match(html, /class="tok">#4347</);
  assert.match(html, /class="cls-badge">real estate</);
  assert.match(html, /class="earns">\$27\.72</);
});

// Le prix n'a pas de sens sur une machine qu'on possède : elle n'est pas en vente.
test("a machine you own carries no price, having none", () => {
  const html = walletDetailHtml({ ...WALLET, machines: [{ ...WALLET.machines[0], image: "u" }] });
  assert.doesNotMatch(html, /class="price"/);
  assert.doesNotMatch(html, /class="usd"/);
});

test("a wallet holding nothing is told so, rather than shown an empty table", () => {
  const card = walletCardHtml({ ...WALLET, machines: [], advice: null });
  assert.match(card, /holds no Machine/);
  assert.equal(walletDetailHtml({ ...WALLET, machines: [], advice: null }), "");
});

test("with no ballot open nothing is advised rather than guessed", () => {
  assert.match(walletDetailHtml({ ...WALLET, advice: null }), /class="w-big w-none">no ballot</);
  assert.match(walletDetailHtml({ ...WALLET, advice: null }), /None is open/);
});

// La carte doit dire qu'elle travaille : sans ça un clic sans effet visible
// donne l'impression que le bouton est mort.
test("the card says it is working while the chain is read", () => {
  assert.match(walletCardHtml({ pending: true }), /reading the chain/);
});

// L'adresse et le ticker viennent d'une requête réseau : ils entrent dans du
// balisage et sont échappés, quoi qu'ils contiennent.
test("nothing from the response reaches the page unescaped", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const payload = ({
    ...WALLET, address: "0x" + "a".repeat(40),
    machines: [{ tokenId: 1, weight: 100, deskIndex: 0, desk: evil, ticker: evil, epochUsd: 1 }],
    advice: { base: 1, best: { index: 0, desk: evil, ticker: evil, held: false, heldWeight: 0, cutUsd: 1, gainUsd: 0 }, options: [] },
  });
  for (const html of [walletCardHtml(payload), walletDetailHtml(payload)]) {
    assert.doesNotMatch(html, /<img src=x/);
  }
  assert.match(walletDetailHtml(payload), /&lt;img src=x/);
});

test("an error is shown in the card, and opens no empty detail", () => {
  const card = walletCardHtml({ error: "that is not an address" });
  assert.match(card, /not an address/);
  assert.match(card, /id="wallet-input"/);
  assert.equal(walletDetailHtml({ error: "that is not an address" }), "");
});

// 0,051% et 0,14% s'écrivaient tous deux « 0.1% » : un facteur trois effacé par
// l'arrondi, sur le chiffre qui dit exactement combien on pèse.
test("a tiny share keeps the digits that make it a fact", () => {
  assert.equal(fmtShare(0.00051), "0.051%");
  assert.equal(fmtShare(0.0014), "0.140%");
  assert.equal(fmtShare(0.132), "13.2%");
  assert.equal(fmtShare(null), "—");
});

test("the detail states the share precisely, not rounded into another number", () => {
  const html = walletDetailHtml({ ...WALLET, share: 0.00051 });
  assert.match(html, /0\.051%/);
});

// Dans la bande de tête les sept classes se mélangent : rien ne disait plus si
// l'on regardait une x1 ou une x10. Le badge le dit, face à celui du re-encrage.
test("every machine in the top band wears its class", () => {
  const html = bestRow(BEST, { ethUsd: 2000 });
  assert.match(html, /class="cls-badge">x10</);
  assert.match(html, /class="cls-badge">x1</);
});

test("a re-inked machine wears one badge that tells the whole story", () => {
  const html = bestRow({
    ...BEST,
    rows: [{ classValue: 300, classLabel: "x3", docCount: 1, chainCount: 1,
      inked: half({ entries: [{ ...entry(1, 0.10), weight: 600, inkMult: 2, inkPrinter: 17000, epochUsd: 60 }] }),
      dormant: half({ entries: [] }) }],
  }, { ethUsd: 2000 });
  const chip = html.match(/<a class="chip[\s\S]*?<\/a>/)[0];
  // Née x3, elle en pèse six. Deux badges se lisaient « x3 inkée six fois » ;
  // un seul, fléché, se lit « née là, arrivée ici ».
  assert.match(chip, /class="reink">x3&#8594;6x</);
  assert.doesNotMatch(chip, /cls-badge/);
});

// Dans les lignes de rareté la classe est déjà en tête de ligne : la répéter
// sur chaque vignette serait du bruit.
test("a rarity row does not repeat its own class on every machine", () => {
  const html = halfCell(half({ entries: [entry(1, 0.1)] }), "ink", { ethUsd: 2000 });
  assert.doesNotMatch(html, /cls-badge/);
});

// ---- le détail d'une machine ---------------------------------------------

const DETAIL = {
  eth: { usd: 2000 },
  pot: { usd: 100000, fleetWeight: 1000000 },
  ink: { activationTotalUsd: 50 },
  rows: [{
    classValue: 300, classLabel: "x3", docCount: 559, chainCount: 559,
    inked: half({ entries: [{
      tokenId: 3145, priceEth: 0.3,
      machine: { image: "https://img/3145.webp", headwear: "Ordinals", body: "Sky", eyes: "Rage", desk: "materials", ticker: "AMD" },
      weight: 600, inkMult: 2, inkPrinter: 17000, epochUsd: 60,
      anvilBidPrinter: 20000, anvilBidEth: 0.1, underBid: false,
    }] }),
    dormant: half({ entries: [{
      tokenId: 77, priceEth: 0.1, machine: { image: "u", headwear: "Ordinals", body: "Sky", eyes: "Rage", desk: "materials", ticker: "AMD" },
      weight: 0, inkMult: null, inkPrinter: 0, epochUsd: 0,
    }] }),
  }],
};

test("the panel tells what the machine is, and what it became", () => {
  const html = machineDetailHtml(DETAIL, 3145);
  assert.match(html, /Machine #3145/);
  assert.match(html, /Class<\/span><span class="d-v">x3</);
  assert.match(html, /Weight<\/span><span class="d-v">6x</);
  assert.match(html, /burning 4× the base ink/);
  assert.match(html, /17,000 \$PRINTER/);
});

test("the panel prices it, and says what it pays back", () => {
  const html = machineDetailHtml(DETAIL, 3145);
  assert.match(html, /0\.3000 ETH/);
  assert.match(html, /\$600\.00/);
  assert.match(html, /\$60\.00 of the pot/);
  assert.match(html, /up to \$120\.00/);
  assert.match(html, /10\.0%/);            // 60 / 600
});

// Le ticker nomme le desk, le secteur le situe : on ne demande pas « les
// machines du secteur materials », on demande AMD.
test("the panel names the desk by its ticker, and places it by its sector", () => {
  const withSector = { ...DETAIL, rows: [{ ...DETAIL.rows[0],
    inked: half({ entries: [{ ...DETAIL.rows[0].inked.entries[0],
      machine: { ...DETAIL.rows[0].inked.entries[0].machine, desk: "AMD", sector: "materials" } }] }) }] };
  const html = machineDetailHtml(withSector, 3145);
  assert.match(html, /Desk<\/span><span class="d-v">AMD</);
  assert.match(html, /the materials desk/);
  assert.match(html, /counts 2× on that slice/);
});

test("a desk left off this epoch's ballot says so, rather than nothing", () => {
  const off = { ...DETAIL, rows: [{ ...DETAIL.rows[0],
    inked: half({ entries: [{ ...DETAIL.rows[0].inked.entries[0],
      machine: { ...DETAIL.rows[0].inked.entries[0].machine, desk: "CRCL", sector: "tech", ticker: null } }] }) }] };
  assert.match(machineDetailHtml(off, 3145), /not on this epoch's ballot/);
});

// Une dormante ne gagne rien, et le panneau doit le dire en entier : ni ce
// pot-ci ni le suivant tant que rien n'a brûlé.
test("a dormant machine is told plainly what it is missing", () => {
  const html = machineDetailHtml(DETAIL, 77);
  assert.match(html, /dormant/);
  assert.match(html, /nothing burned/);
  assert.match(html, /until it is inked/);
});

test("the panel points at the market the machine is actually on", () => {
  assert.match(machineDetailHtml(DETAIL, 3145), /View on OpenSea/);
  const shelf = {
    ...DETAIL,
    rows: [{ ...DETAIL.rows[0],
      inked: half({ entries: [], anvilEntries: [{ tokenId: 900, askPrinter: 20000, askUsd: 150, askEth: 0.075,
        machine: machineOf({ desk: "materials", ticker: "AMD" }), weight: 300, inkMult: 1, epochUsd: 30 }] }) }],
  };
  const html = machineDetailHtml(shelf, 900);
  assert.match(html, /Buy on the Anvil/);
  assert.match(html, /20,000 \$PRINTER/);
  assert.doesNotMatch(html, /View on OpenSea/);
});

// Une machine peut se vendre entre le moment où la page est peinte et le clic.
test("a machine that has left the book says so instead of breaking", () => {
  const html = machineDetailHtml(DETAIL, 999999);
  assert.match(html, /Not in the book right now/);
  assert.match(html, /d-close/);
});

test("nothing about a machine reaches the panel unescaped", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const html = machineDetailHtml({
    ...DETAIL,
    rows: [{ ...DETAIL.rows[0], classLabel: evil,
      inked: half({ entries: [{ tokenId: 1, priceEth: 0.1, weight: 100, epochUsd: 1,
        machine: { image: evil, headwear: evil, body: evil, eyes: evil, desk: evil, ticker: evil } }] }) }],
  }, 1);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("a machine is found wherever it sits, in either state or market", () => {
  assert.equal(findMachine(DETAIL, 3145).side, "ink");
  assert.equal(findMachine(DETAIL, 77).side, "dormant");
  assert.equal(findMachine(DETAIL, 3145).market, "opensea");
  assert.equal(findMachine(DETAIL, 4242), null);
});

// La formule seule ment sur les machines au plafond : le contrat tronque le
// multiplicateur au pourcent entier. Une x4 à 17 150 d'encre pèse 800, pas 803,5.
const CEIL = {
  ...DETAIL,
  protocol: { ceiling: 200n, nextGate: { needed: 24000000n * 10n ** 18n, unlocks: 300n } },
};

test("the ink line names the flooring and the ceiling, not just the square root", () => {
  const html = machineDetailHtml(CEIL, 3145);
  assert.match(html, /floored to whole percent/);
  assert.match(html, /capped at the x2 ink ceiling/);
});

test("a machine at the ceiling is told so, and told what would lift it", () => {
  const html = machineDetailHtml(CEIL, 3145);
  assert.match(html, /At the ceiling/);
  assert.match(html, /x2, the most ink can give today/);
  assert.match(html, /x3 opens when 24\.0M more/);
});

test("a machine below the ceiling makes no claim about being at it", () => {
  const below = { ...CEIL, rows: [{ ...CEIL.rows[0],
    inked: half({ entries: [{ ...DETAIL.rows[0].inked.entries[0], weight: 300, inkMult: 1, inkPrinter: 4250 }] }) }] };
  const html = machineDetailHtml(below, 3145);
  assert.doesNotMatch(html, /At the ceiling/);
  assert.match(html, /floored to whole percent/);
});

// Sans plafond lu, on n'invente pas de limite.
test("with no ceiling read the line claims none", () => {
  const html = machineDetailHtml(DETAIL, 3145);
  assert.doesNotMatch(html, /ink ceiling/);
  assert.doesNotMatch(html, /At the ceiling/);
});

// Le montant tenait en petit au bout d'une phrase, entre une adresse tronquée
// et un poids. C'est pourtant le chiffre qu'on vient chercher.
test("what the wallet is owed is read as a figure, not as the end of a sentence", () => {
  const html = walletDetailHtml(WALLET);
  assert.match(html, /These 2 machines take <b>\$39\.12<\/b> of the pot waiting now/);
});

// Vert pour ce que le protocole verse, ambre pour l'ordre à donner : les deux
// grands nombres de la ligne ne disent pas la même chose.
// Ambre pour ce sur quoi on agit, vert pour ce que le protocole verse. La
// barre n'a plus qu'un sujet — le portefeuille lu — et aucune règle morte ne
// traîne derrière les chiffres qui en sont partis.
test("the bar wears the colour of what one acts on, and nothing else", () => {
  const css = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
  assert.match(css, /\.w-said \.v \{[^}]*var\(--ink\)/);
  assert.match(css, /\.w-big \{[^}]*var\(--under\)/);
  assert.doesNotMatch(css, /\.w-cut|\.w-worth/);
});

// L'état n'était qu'en tête de tableau. Passé la première ligne, deux cases
// côte à côte affichant l'une $14.81 et l'autre $0.00 devenaient inexplicables.
test("every cell says which side it speaks for, beside the market it names", () => {
  const ink = halfCell(half({ entries: [entry(1, 0.1)] }), "ink", { ethUsd: 2000 });
  const dor = halfCell(half({ entries: [entry(2, 0.1)] }), "dormant", { ethUsd: 2000 });
  assert.match(ink, /On OpenSea <span class="st">inked</);
  assert.match(dor, /On OpenSea <span class="st">dormant</);
});

test("an empty cell says it too, having nothing else to explain itself with", () => {
  const html = halfCell(half({ entries: [] }), "dormant", { ethUsd: 2000 });
  assert.match(html, /On OpenSea <span class="st">dormant</);
});

test("the anvil strip carries the same state as the half it sits in", () => {
  const html = halfCell(half({ entries: [entry(1, 0.1)], anvilEntries: [shelfEntry()] }), "dormant", { ethUsd: 2000 });
  assert.match(html, /On the Anvil <span class="st">dormant</);
});

// « x2 » et « 4x » côte à côte ne différaient que par la place du x, et l'on
// comprenait « inkée deux fois ». Elle a brûlé quatre fois l'encre de base ;
// le poids n'en gagne que le double, parce qu'il suit une racine carrée.
test("the detail says how much ink was burned, not just what it multiplied", () => {
  const html = machineDetailHtml(DETAIL, 3145);
  assert.match(html, /born x3/);
  assert.match(html, /burning 4× the base ink/);
  assert.match(html, /lifts it to 6x/);
  assert.match(html, /square root/);
  assert.doesNotMatch(html, /re-inked ×2\.00/);
});

test("a machine that never burned more claims no journey", () => {
  const plain = { ...DETAIL, rows: [{ ...DETAIL.rows[0],
    inked: half({ entries: [{ ...DETAIL.rows[0].inked.entries[0], weight: 300, inkMult: 1, inkPrinter: 4250 }] }) }] };
  const html = machineDetailHtml(plain, 3145);
  assert.match(html, /activated at the base burn/);
  assert.doesNotMatch(html, /lifts it to/);
});

// Le pot n'a jamais rien versé : aucun chiffre de la page ne peut se présenter
// comme un rythme. Le contrôle porte sur ce qui est rendu, pas sur la source —
// une expression régulière ne sait pas lire du JavaScript, et la première
// version de ce test traversait un commentaire pour se croire en faute.
test("nowhere on the page does an amount claim to arrive every epoch", () => {
  const e = { ...entry(1, 0.1), weight: 100, epochUsd: 12.6, inkMult: 1, inkPrinter: 4250 };
  const rendered = [
    halfCell(half({ entries: [e] }), "ink", { ethUsd: 2000 }),
    bestRow(BEST, { ethUsd: 2000 }),
    walletCardHtml(WALLET),
    walletDetailHtml(WALLET),
    machineDetailHtml(DETAIL, 3145),
    dropNote({ pot: { usd: 170000 }, vote: { opened: true }, printer: { volume24h: 250000 }, protocol: { sellFeeBps: 500 } }),
  ].join("\n");

  for (const line of rendered.split(/(?=<)/)) {
    if (!/an epoch/.test(line)) continue;
    // Seule exception : le délai « Lit », où l'epoch est bien le sujet et non
    // le rythme d'un montant.
    assert.match(line, /only starts earning at the next one/,
      `un montant se présente comme récurrent ici : ${line.slice(0, 120)}`);
  }
});

test("the amounts say what they are — a share of the pot as it stands", () => {
  assert.match(halfCell(half({ entries: [{ ...entry(1, 0.1), weight: 100, epochUsd: 12.6 }] }), "ink", { ethUsd: 2000 }),
    /class="per">this drop</);
  // La bande compte deux choses — la part du pot et les actions dedans — donc
  // son unité ne peut pas dire « of the pot ».
  assert.match(bestRow(BEST, { ethUsd: 2000 }), /class="unit">back</);
  assert.match(walletDetailHtml(WALLET), /of the pot waiting/);
  assert.match(dropNote({ pot: { usd: 170000 }, vote: { opened: false } }), /never yet paid out/);
});

// La collection migre vers un nouveau contrat. Les liens doivent suivre le
// snapshot, pas une adresse recopiée dans la page.
test("item links follow the contract the service serves", () => {
  const before = itemUrl(42);
  assert.match(before, /0xb509e195bcb3e4461e235ff152c68d66915f67b5\/42$/);
  setContract("0xABCdef0123456789012345678901234567890123");
  assert.match(itemUrl(42), /0xabcdef0123456789012345678901234567890123\/42$/);
  setContract(before.match(/robinhood\/(0x[a-f0-9]+)\//)[1]);   // on remet, les tests partagent le module
});

test("a snapshot that names no contract leaves the link alone", () => {
  const before = itemUrl(7);
  setContract(null);
  setContract(undefined);
  assert.equal(itemUrl(7), before);
});

// Le desk est un secteur, mais celui qui vote cherche le ticker qu'il porte
// ce tour-ci. Le menu doit donner les deux.
test("the desk menu leads with the ticker and places it by sector", () => {
  const html = filterBarHtml(
    { Desk: [{ value: "SPCX", listed: 40, total: 623 }], Headwear: [], Body: [], Eyes: [] },
    NO_FILTER,
    { opened: true, closesAt: null, finalized: false,
      desks: [{ index: 10, desk: "SPCX", sector: "real estate", ticker: "SPCX", votedWeight: 40, share: 0.042 }] });
  assert.match(html, /SPCX · real estate — 4\.2% of the pot \(40 on sale of 623\)/);
});

// Sur l'ancien contrat tout le monde plafonnait au même endroit et les poids
// tombaient ronds. Une machine qui a brûlé 16 750 au lieu de 17 000 pèse
// 3,96x, et « x2→3.96x » dans un badge se lit « 96x ».
test("a weight is cut to one decimal in a badge, never rounded up", () => {
  assert.equal(fmtWeightX(400), "4x");
  assert.equal(fmtWeightX(396), "3.9x");     // pas « 4x » : elle n'y est pas
  assert.equal(fmtWeightX(105), "1.0x");     // pas « 1x » : elle a brûlé plus
  assert.equal(fmtWeightX(120), "1.2x");
  assert.equal(fmtWeightX(1200), "12x");
  assert.equal(fmtWeightX(0), "0x");
});

test("a badge never claims a class the machine has not reached", () => {
  for (const w of [396, 399, 105, 199, 1199]) {
    const shown = Number(fmtWeightX(w).replace("x", ""));
    assert.ok(shown <= w / 100, `${fmtWeightX(w)} annonce plus que ${w / 100}`);
  }
});

test("the badge is short while the tooltip keeps the exact figure", () => {
  const e = { ...entry(1, 0.1), weight: 396, inkMult: 1.98, inkPrinter: 16750, epochUsd: 50 };
  const html = bestRow({ ...BEST, rows: [{ classValue: 200, classLabel: "x2", docCount: 1, chainCount: 1,
    inked: half({ entries: [e] }), dormant: half({ entries: [] }) }] }, { ethUsd: 2000 });
  assert.match(html, /class="reink">x2&#8594;3\.9x</);
  assert.match(html, /weight 3\.96x/);
});

// Deux décimales seulement si elles disent quelque chose : « 4× » au plafond,
// « 3.94× » pour celle qui s'en approche.
test("an exact figure carries decimals only when they mean something", () => {
  assert.equal(fmtExact(4), "4");
  assert.equal(fmtExact(3.9411), "3.94");
  assert.equal(fmtExact(3.96), "3.96");
  assert.equal(fmtExact(12), "12");
  assert.equal(fmtExact(1.0), "1");
});

// Le compte appartient au jeton : ce qu'il contient part avec la machine à la
// vente. Une x1 à $100 avec $12 dedans n'est pas la même affaire que la même vidée.
const HELD = { ...entry(1, 0.1), weight: 100, epochUsd: 12.6,
  holds: { usd: 12.48, lines: [{ symbol: "NVDA", amount: 0.03705, usd: 8.06 }, { symbol: "SPCX", amount: 0.004425, usd: 0.6 }] } };

test("a chip says what the machine is carrying, apart from its price", () => {
  const html = halfCell(half({ entries: [HELD] }), "ink", { ethUsd: 2000 });
  assert.match(html, /class="holds"[^>]*>\+\$12\.48 inside</);
  assert.match(html, /0\.03705 NVDA · 0\.004425 SPCX/);
});

test("an emptied machine claims nothing, rather than nothing-dollars", () => {
  const html = halfCell(half({ entries: [{ ...HELD, holds: null }] }), "ink", { ethUsd: 2000 });
  assert.doesNotMatch(html, /class="holds"/);
  assert.doesNotMatch(html, /inside/);
});

test("the panel lists every stock inside, and says it travels with the sale", () => {
  const d = { ...DETAIL, rows: [{ ...DETAIL.rows[0], inked: half({ entries: [{ ...HELD, tokenId: 3145 }] }) }] };
  const html = machineDetailHtml(d, 3145);
  assert.match(html, /Inside the machine/);
  assert.match(html, /they go with it if it sells/);
  assert.match(html, /NVDA<\/span><span class="h-amt">0\.03705<\/span><span class="h-usd">\$8\.06</);
  assert.match(html, /\$12\.48 in all/);
});

// Une action sans prix garde sa quantité : la compter à zéro ferait passer une
// machine pleine pour une machine vide.
test("a stock nobody quotes still shows its amount, with no dollar figure", () => {
  const d = { ...DETAIL, rows: [{ ...DETAIL.rows[0], inked: half({ entries: [{ ...HELD, tokenId: 3145,
    holds: { usd: null, lines: [{ symbol: "MYSTERY", amount: 9, usd: null }] } }] }) }] };
  const html = machineDetailHtml(d, 3145);
  assert.match(html, /MYSTERY<\/span><span class="h-amt">9<\/span><span class="h-usd">—</);
  assert.doesNotMatch(html, /in all/);
});

// Les actions arrivent par fractions minuscules. Deux décimales les
// écraseraient toutes à « 0.04 » et une machine chargée ressemblerait à une
// machine à peine servie.
test("a token amount keeps the digits that tell two machines apart", () => {
  assert.equal(fmtAmount(0.037050014664164968), "0.03705");
  assert.equal(fmtAmount(0.004424788452893450), "0.004425");
  assert.equal(fmtAmount(0.000076247801140718), "0.00007625");
  assert.equal(fmtAmount(9), "9");
});

// La vignette annonçait « +$82 » et la fiche ne le disait pas : elle donnait
// l'offre de l'anvil sans l'écart, c'est-à-dire sans l'information.
test("the panel carries the gap the chip advertises, and what it is paid in", () => {
  const d = { ...DETAIL, rows: [{ ...DETAIL.rows[0], inked: half({ entries: [{
    ...DETAIL.rows[0].inked.entries[0], tokenId: 3145, priceEth: 0.3,
    anvilBidEth: 0.34, anvilBidPrinter: 21073, underBid: true }] }) }] };
  const html = machineDetailHtml(d, 3145);
  assert.match(html, /Anvil bid<\/span><span class="d-v">0\.3400 ETH · \$680\.00</);
  assert.match(html, /\$80\.00 more than it is listed for, but paid in \$PRINTER/);
});

// De quoi vérifier soi-même plutôt que de nous croire.
test("the panel names the machine's own account and who holds it", () => {
  const d = { ...DETAIL, rows: [{ ...DETAIL.rows[0], inked: half({ entries: [{
    ...DETAIL.rows[0].inked.entries[0], tokenId: 3145,
    account: "0x7fe0c060547Be83af5947a956F0d4dAcabC647A8",
    owner: "0xE908ba570259E4bB1e1fDd2EDd9B15E092B13211" }] }) }] };
  const html = machineDetailHtml(d, 3145);
  assert.match(html, /Its account<\/span><span class="d-v">0x7fe0…47A8</);
  assert.match(html, /where the stock lands, and it goes with the sale/);
  assert.match(html, /Held by<\/span><span class="d-v">0xE908…3211</);
});

test("a machine whose account or owner we could not read claims neither", () => {
  const html = machineDetailHtml(DETAIL, 3145);
  assert.doesNotMatch(html, /Its account/);
  assert.doesNotMatch(html, /Held by/);
});

test("the panel shows the background, the one trait it was leaving out", () => {
  const d = { ...DETAIL, rows: [{ ...DETAIL.rows[0], inked: half({ entries: [{
    ...DETAIL.rows[0].inked.entries[0], tokenId: 3145,
    machine: { ...DETAIL.rows[0].inked.entries[0].machine, background: "Acid Lime" } }] }) }] };
  assert.match(machineDetailHtml(d, 3145), /Background<\/span><span class="d-v">Acid Lime</);
});

// L'offre de l'anvil est la même pour toutes les machines et la bande est
// triée par prix : une phrase par case répétait ce que l'ordre porte déjà.
test("the OpenSea book says nothing about the anvil's bid", () => {
  const html = halfCell(half({ entries: [withBid()] }), "ink", { ethUsd: 1896 });
  assert.doesNotMatch(html, /The Anvil pays/);
  assert.doesNotMatch(html, /class="under"/);
});

// Le rayon garde la sienne : lui vend, et ce qu'il vend change d'une case à
// l'autre — c'est une information par case, pas une constante répétée.
test("the shelf keeps its own note, which is not a constant", () => {
  const html = halfCell(half({ floorEth: 0.2, anvilEntries: [shelfEntry({ askEth: 0.1 })] }), "ink", { ethUsd: 1896 });
  assert.match(html, /Cheaper than anything on OpenSea here/);
});

// Le compte appartient au jeton : les actions qu'il contient sont à l'acheteur
// à la seconde où il achète. Les ignorer faisait passer une machine à $261
// contenant $26 pour l'égale d'une machine vide au même prix.
test("the ranking counts the stock already sitting in the machine", () => {
  const common = { side: "ink", classValue: 100, potUsd: 100000, fleetWeight: 1000000, priceUsd: 200 };
  const vide = yieldOf({ weight: 100 }, common);
  const pleine = yieldOf({ weight: 100, holds: { usd: 20 } }, common);
  assert.equal(vide.toFixed(4), "0.0500");        // 10 de pot sur 200
  assert.equal(pleine.toFixed(4), "0.1500");      // 10 de pot + 20 dedans
  assert.ok(pleine > vide);
});

test("a machine holding nothing is ranked exactly as before", () => {
  const common = { side: "ink", classValue: 100, potUsd: 100000, fleetWeight: 1000000, priceUsd: 200 };
  assert.equal(yieldOf({ weight: 100, holds: null }, common), yieldOf({ weight: 100 }, common));
  assert.equal(yieldOf({ weight: 100, holds: { usd: null } }, common), yieldOf({ weight: 100 }, common));
});

test("a dormant machine still carries its activation, and its stock too", () => {
  const y = yieldOf({ weight: 0, holds: { usd: 20 } },
    { side: "dormant", classValue: 100, potUsd: 100000, fleetWeight: 1000000, activationUsd: 50, priceUsd: 200 });
  assert.equal(y.toFixed(4), "0.1200");           // (10 + 20) sur (200 + 50)
});

test("the band says the figure covers both, not the pot alone", () => {
  const html = bestRow(BEST, { ethUsd: 2000 });
  assert.match(html, /pot \+ stock inside/);
  assert.match(html, /most back per dollar first/);
});

// Le grand chiffre doit être celui que le pourcentage mesure : il annonçait la
// seule part du pot pendant que le ratio comptait aussi les actions dedans.
test("the band's headline figure is the one its percentage measures", () => {
  const held = { ...entry(9, 0.10), weight: 1000, epochUsd: 100, holds: { usd: 20, lines: [] } };
  const html = bestRow({ ...BEST, rows: [{ classValue: 1000, classLabel: "x10", docCount: 1, chainCount: 1,
    inked: half({ entries: [held] }), dormant: half({ entries: [] }) }] }, { ethUsd: 2000 });
  assert.match(html, /class="price">\$120\.00<\/span> <span class="unit">back</);
  assert.match(html, /for \$200</);
  assert.match(html, /60\.0%/);   // 120 sur 200
});

// Quatre choses vivent dans un portefeuille et ne se valorisent pas pareil.
const WORTH = {
  ...WALLET,
  worth: {
    machinesUsd: 1115.84, unpriced: 0, insideUsd: 76.17,
    stockUsd: 30, ownStock: [{ symbol: "NVDA", amount: 0.1434, usd: 30 }],
    printerUsd: 121.92, printerAmount: 11104, total: 1343.93,
  },
};

// Elle était dite deux fois : en tête de barre, puis en grand dans la carte.
test("what the whole thing is worth is stated once, in the card", () => {
  assert.doesNotMatch(walletCardHtml(WORTH), /1,344/);
  assert.match(walletDetailHtml(WORTH), /What it is worth<\/span><span class="w-big">\$1,344</);
});

// Deux questions, deux cartes : ce que ça vaut, et quoi en faire.
test("the worth card breaks the total into the four things it counts", () => {
  const html = walletDetailHtml(WORTH);
  assert.match(html, /What it is worth<\/span><span class="w-big">\$1,344</);
  assert.match(html, /2 machines<\/span><span class="ww-v">\$1,116<\/span><span class="ww-x">at their class floor/);
  assert.match(html, /stock inside them.*\$76\.17.*goes with the machine if it sells/s);
  assert.match(html, /stock withdrawn.*\$30\.00.*0\.1434 NVDA/s);
  assert.match(html, /\$PRINTER<\/span><span class="ww-v">\$121\.92<\/span><span class="ww-x">11,104 held/);
});

// L'identité était dite deux fois : dans le verdict et de nouveau en dessous.
test("the address and the count are stated once, at the head", () => {
  const html = walletCardHtml(WORTH) + walletDetailHtml(WORTH);
  assert.equal((html.match(/0xe908…3211/g) ?? []).length, 1);
  assert.match(html, /class="w-who"/);
  // 6.00x est un poids ; la part du parc est le pourcentage, pas le multiple.
  assert.doesNotMatch(html, /x<\/b> of the fleet/);
  assert.match(html, /3\.00x<\/b> of weight/);
});

// Un gain de quatre dixièmes de centime s'écrivait « $0.00 », ce qui fait
// passer le conseil pour inutile.
test("a gain under a cent is said in words, not rounded to nothing", () => {
  assert.equal(fmtTiny(0.004), "less than a cent");
  assert.equal(fmtTiny(0.05), "$0.05");
  assert.equal(fmtTiny(null), "—");
  const html = walletDetailHtml({ ...WORTH, advice: { ...WORTH.advice, best: { ...WORTH.advice.best, gainUsd: 0.004 } } });
  assert.match(html, /worth <b>less than a cent<\/b>/);
  assert.doesNotMatch(html, /worth <b>\$0\.00<\/b>/);
});

// Un floor est un prix demandé, pas un prix obtenu. Le dire vaut mieux que le
// sous-entendre sous un total qui a l'air d'un solde bancaire.
// Un floor est un prix demandé, pas un prix obtenu. Le dire vaut mieux que le
// sous-entendre sous un total qui a l'air d'un solde bancaire.
test("the panel says a floor is an asking price, not a payout", () => {
  const html = walletDetailHtml(WORTH);
  assert.match(html, /what others are asking, not what you would be paid/);
  assert.match(html, /a thin class can move on one listing/);
  // Le portefeuille ne se valorise pas sur un marché dont il n'a pas été question.
  assert.doesNotMatch(html, /Anvil/);
});

test("a machine nothing can price is left out, and counted out loud", () => {
  const html = walletDetailHtml({ ...WORTH, worth: { ...WORTH.worth, unpriced: 2 } });
  assert.match(html, /2 machine\(s\) left out/);
  assert.match(html, /nothing comparable is on sale/);
});

test("a wallet whose worth could not be read shows none rather than zero", () => {
  assert.doesNotMatch(walletDetailHtml({ ...WALLET, worth: null }), /What it is worth/);
  assert.doesNotMatch(walletDetailHtml({ ...WALLET, worth: null }), /w-worth-block/);
});

test("a wallet holding no token claims none of it", () => {
  const bare = { ...WORTH, worth: { ...WORTH.worth, printerUsd: null, stockUsd: null, insideUsd: null } };
  const html = walletDetailHtml(bare);
  assert.doesNotMatch(html, /\$PRINTER<\/span>/);
  assert.doesNotMatch(html, /stock withdrawn/);
  assert.doesNotMatch(html, /stock inside them/);
  assert.match(html, /machines/);
});

// « $1344 » se lit moins bien que « $1,344 », et c'est le chiffre de tête.
test("a round amount keeps its thousands", () => {
  assert.equal(fmtUsdRound(1343.93), "$1,344");
  assert.equal(fmtUsdRound(76), "$76");
  assert.equal(fmtUsdRound(null), "—");
});

// ---- le dépouillement, sur sa page ---------------------------------------

const BALLOT = {
  opened: true, finalized: false, closesAt: null,
  desks: [
    { index: 0, desk: "NVDA", sector: "energy", ticker: "NVDA", votedWeight: 3785, share: 0.3818 },
    { index: 1, desk: "AMD", sector: "materials", ticker: "AMD", votedWeight: 1868, share: 0.1884 },
    { index: 7, desk: "CRCL", sector: "tech", ticker: null, votedWeight: 0, share: 0 },
  ],
};

test("the ballot shows every desk and what it drew", () => {
  const html = ballotHtml(BALLOT, 2);
  assert.match(html, /class="b-name">NVDA<\/span><span class="b-sector">energy</);
  assert.match(html, /38\.2%/);
  assert.match(html, /3,785x/);
});

// Un desk absent du bulletin n'a pas perdu le vote : on n'a pas pu voter pour
// lui, et une barre à zéro le ferait passer pour un candidat rejeté.
test("a desk left off the ballot is not shown as one that lost", () => {
  const html = ballotHtml(BALLOT, 2);
  assert.match(html, /class="b-off"/);
  assert.match(html, /not on the ballot/);
});

// Les barres se mesurent sur le premier : à 38%, le vainqueur remplirait à
// peine un tiers et l'écart entre les seconds deviendrait illisible.
test("the bars are drawn against the leader, not against a hundred", () => {
  const html = ballotHtml(BALLOT, 2);
  assert.match(html, /width:100%/);
  assert.match(html, /width:49%/);
});

test("no ballot open says what that means for the pot", () => {
  const html = ballotHtml({ ...BALLOT, opened: false }, 3);
  assert.match(html, /No ballot has opened for epoch 3/);
  assert.match(html, /the pot rolls forward/);
});

test("an open ballot nobody has voted in says exactly that", () => {
  const html = ballotHtml({ ...BALLOT, desks: BALLOT.desks.map((d) => ({ ...d, votedWeight: 0 })) }, 2);
  assert.match(html, /not one Machine has voted/);
});

test("a ballot that could not be read says so rather than showing nothing", () => {
  assert.match(ballotHtml(null, 2), /could not be read/);
});

test("a closed ballot says it is closed", () => {
  assert.match(ballotHtml({ ...BALLOT, finalized: true }, 2), /closed and been finalised/);
});

// Sans ticker, le nom du desk EST son secteur : l'écrire deux fois donnait
// « consumer staples consumer staples ».
test("a desk with no ticker is named once, not twice", () => {
  const html = ballotHtml({ ...BALLOT, desks: [
    { index: 4, desk: "consumer staples", sector: "consumer staples", ticker: null, votedWeight: 0, share: 0 },
    ...BALLOT.desks,
  ] }, 2);
  assert.doesNotMatch(html, /consumer staples<\/span><span class="b-sector">consumer staples/);
  assert.match(html, /class="b-name">consumer staples<\/span><span class="b-sector"><\/span>/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtEth, fmtRatio, halfCell, cellKey,
  bannerMessage, rowsHtml, contextHtml, legendHtml,
  matchesFilter, filterBarHtml, filterSummary, freshness, fmtCompact, crateLine,
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
  assert.match(html, /re-inked ×2\.00/);
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

test("a listing the protocol itself would pay more for is marked", () => {
  const html = halfCell(half({ entries: [withBid()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="under"/);
});

test("a listing above the anvil's bid carries no mark", () => {
  const html = halfCell(half({ entries: [withBid({ underBid: false, anvilBidEth: 0.09 })] }), "ink", { ethUsd: 1896 });
  assert.doesNotMatch(html, /class="under"/);
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

// « under bid » ne disait rien à personne : la case explique une fois, et
// chaque vignette porte l'écart plutôt qu'un mot de jargon.
test("a cell explains once what the green marks mean", () => {
  const html = halfCell(half({ entries: [withBid()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /sell below the Anvil/i);
  assert.match(html, /0\.1170 ETH/);
});

test("each marked machine carries the gap rather than a phrase", () => {
  const html = halfCell(half({ entries: [withBid()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="under">\+11%</);
  assert.doesNotMatch(html, />under bid</);
});

test("a cell with nothing under the bid explains nothing", () => {
  const html = halfCell(half({ entries: [withBid({ underBid: false })] }), "ink", { ethUsd: 1896 });
  assert.doesNotMatch(html, /sell below the Anvil/i);
});

test("a gap smaller than a point says so rather than rounding to nothing", () => {
  const html = halfCell(half({ entries: [withBid({ priceEth: 0.1169, anvilBidEth: 0.1170 })] }), "ink", { ethUsd: 1896 });
  assert.match(html, /&lt;1%/);
  assert.doesNotMatch(html, /\+0%/);
});



// Les badges étaient positionnés sur la vignette entière : le vert, en bas,
// retombait sur la ligne du prix en dollars et la recouvrait. Ils doivent être
// ancrés sur l'image, pas sur le bloc.
test("both badges live inside the image, not over the text", () => {
  const html = halfCell(half({ entries: [withBid({ weight: 200, inkMult: 2 })] }), "ink", { ethUsd: 1896 });
  const thumb = html.match(/<span class="thumb">[^]*?<\/span><\/span>/);
  assert.ok(thumb, "the image must sit in its own positioned wrapper");
  assert.match(thumb[0], /<img/);
  assert.match(thumb[0], /class="reink"/);
  assert.match(thumb[0], /class="under"/);
  // et le prix reste dehors, donc rien ne peut le recouvrir
  assert.doesNotMatch(thumb[0], /class="price"/);
});

test("a machine with no picture still carries its marks", () => {
  const html = halfCell(half({ entries: [withBid({ machine: null })] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="thumb"/);
  assert.match(html, /class="under"/);
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
  assert.match(html, /class="market">On OpenSea</);
  assert.match(html, /class="market">On the Anvil</);
  assert.ok(html.indexOf("On OpenSea") < html.indexOf("On the Anvil"));
});

test("a cell with nothing on OpenSea still says which market is empty", () => {
  const html = halfCell(half({ entries: [], listed: 0, anvilEntries: [shelfEntry()] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="market">On OpenSea</);
  assert.match(html, /no listing/);
  assert.match(html, /class="market">On the Anvil</);
});

test("a cell the anvil holds nothing in names only the market that has something", () => {
  const html = halfCell(half({ entries: [entry(1, 0.11)], anvilEntries: [] }), "ink", { ethUsd: 1896 });
  assert.match(html, /class="market">On OpenSea</);
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
  const html = halfCell(half({ anvilEntries: [shelfEntry({ queuePrinter: 12957, queueUsd: 157 })] }), "ink", { ethUsd: 1896 });
  assert.match(html, /to pick one/i);
  assert.doesNotMatch(html.slice(html.indexOf('class="shelf"')), /floor price/i);
});

test("the cheaper way is stated beside it, not hidden", () => {
  const html = halfCell(half({ anvilEntries: [shelfEntry({ queuePrinter: 12957, queueUsd: 157 })] }), "ink", { ethUsd: 1896 });
  assert.match(html, /12,957/);
  assert.match(html, /whichever is next/i);
});

test("with no queue price read, only the named one is claimed", () => {
  const html = halfCell(half({ anvilEntries: [shelfEntry({ queuePrinter: null })] }), "ink", { ethUsd: 1896 });
  assert.match(html, /to pick one/i);
  assert.doesNotMatch(html, /whichever is next/i);
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

// Ambre veut dire « c'est un prix ». Les deux blocs qui n'en sont pas — un
// comptage et un index d'époque — restent neutres, sinon la règle ne dit plus
// rien et le bandeau est simplement plus bruyant.
test("every price in the bar is amber, and only the prices", () => {
  const html = contextHtml({ ...CTX, anvil: { spotPrinter: 14100, spotUsd: 168, shelf: 18, bidPaused: false } });
  const blocks = html.split('<div class="stat').slice(1);
  const amber = blocks.filter((b) => b.startsWith(" is-price")).map((b) => b.match(/class="label">([^<]*)/)[1]);
  const plain = blocks.filter((b) => !b.startsWith(" is-price")).map((b) => b.match(/class="label">([^<]*)/)[1]);

  assert.deepEqual(amber.sort(), ["$PRINTER", "Collection floor", "Cost of ink", "ETH", "The Anvil", "Volume traded"]);
  assert.deepEqual(plain.sort(), ["Epoch", "Inked machines"]);
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
  const cheap = halfCell(half({ anvilEntries: [shelfEntry({ tokenId: 1, askPrinter: 15217, askUsd: 133, queuePrinter: 13833 })] }), "ink", { ethUsd: 1896 });
  const dear = halfCell(half({ anvilEntries: [shelfEntry({ tokenId: 2, askPrinter: 51128, askUsd: 447, queuePrinter: 46480 })] }), "ink", { ethUsd: 1896 });

  assert.match(cheap, /class="price">15,217</);
  assert.match(dear, /class="price">51,128</);
  assert.doesNotMatch(cheap, /51,128/);
  assert.doesNotMatch(dear, /15,217/);
});

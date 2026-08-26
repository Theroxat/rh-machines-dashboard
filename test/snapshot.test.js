import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSnapshot, burnHeadline, fleetHeadline } from "../src/snapshot.js";

const base = {
  grid: {
    rows: [],
    excluded: { unknownRarity: 0, unknownInk: 0, listingsOffGrid: 0 },
    totals: { inked: 0, dormant: 0, listed: 0 },
  },
  printer: { usd: 0.0126, change24h: 598, liquidityUsd: 427948, fdv: 2165143 },
  eth: { usd: 1883.24, local: 1883.24, coingecko: 1883.81, spreadPct: 0.03 },
  protocol: { epoch: "12", activationInk: "4250000000000000000000" },
  stats: { floor: 0.0889891, symbol: "ETH", volume: 425.576, sales: 18124, owners: 2624, volume24h: 136.67, sales24h: 1896 },
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



const withGrid = {
  ...base,
  grid: {
    ...base.grid,
    rows: [{
      classLabel: "x10", classValue: 1000, docCount: 37, chainCount: 37, spreadEth: -0.5,
      inked: {
        floorEth: 2.0, floorTokenId: 1253, pelotonEth: 2.25, listed: 2, supply: 33, listedRatio: 0.06,
        entries: [{ tokenId: 1253, priceEth: 2.0 }, { tokenId: 999, priceEth: 2.4 }],
      },
      dormant: { floorEth: null, floorTokenId: null, pelotonEth: null, listed: 0, supply: 4, listedRatio: 0, entries: [] },
    }],
  },
  meta: new Map([[1253, { image: "https://img/1253.webp", headwear: "Blueberries", body: "Cobalt Stripe", eyes: "Rage" }]]),
  legend: { byClass: [], headwearClass: new Map(), ambiguous: [], unpaired: 0 },
};

test("every machine on sale carries its picture, its traits and the desk it sits on", () => {
  const s = composeSnapshot({ ...withGrid, deskIndex: new Map([[1253, 9]]) });
  assert.deepEqual(s.rows[0].inked.entries[0].machine, {
    image: "https://img/1253.webp", headwear: "Blueberries", body: "Cobalt Stripe",
    eyes: "Rage", desk: "utilities", sector: "utilities", ticker: null,
  });
});

// Le desk vient de la chaîne, plus d'une couleur interprétée. Une machine que
// la chaîne ne place pas n'emprunte le secteur de personne.
test("a machine the chain places nowhere yields a null desk, not a missing key", () => {
  const s = composeSnapshot(withGrid);
  assert.equal(s.rows[0].inked.entries[0].machine.desk, null);
});

// Le pot divisé par le poids : c'est le chiffre que le porteur vient chercher,
// et il doit tomber sur celui que le terminal officiel lui montre ailleurs.
test("every machine on sale says what it would earn if the pot dropped now", () => {
  const s = composeSnapshot({
    ...withGrid,
    protocol: { ...withGrid.protocol, totalWeight: 1140002n },
    potUsd: 160745,
    weights: new Map([[1253, 600n]]),
  });
  assert.equal(s.rows[0].inked.entries[0].epochUsd.toFixed(2), "84.60");
  assert.equal(s.pot.usd, 160745);
  assert.equal(s.pot.fleetWeight, 1140002);
});

test("with no pot read no machine claims a return", () => {
  const s = composeSnapshot({ ...withGrid, weights: new Map([[1253, 600n]]) });
  assert.equal(s.rows[0].inked.entries[0].epochUsd, null);
  assert.equal(s.pot.usd, null);
});

test("the trait index counts what is on sale against what exists", () => {
  const s = composeSnapshot(withGrid);
  const blueberries = s.traitFilters.Headwear.find((v) => v.value === "Blueberries");
  assert.equal(blueberries.total, 1);
  assert.equal(blueberries.listed, 1);   // #1253 is one of the entries
});

test("a machine with no metadata keeps its price and loses only its picture", () => {
  const s = composeSnapshot(withGrid);
  assert.equal(s.rows[0].inked.entries[1].machine, null);   // #999 is not in the meta map
  assert.equal(s.rows[0].inked.entries[1].priceEth, 2.4);

  const missing = composeSnapshot({ ...withGrid, meta: new Map() });
  assert.equal(missing.rows[0].inked.entries[0].machine, null);
  assert.equal(missing.rows[0].inked.floorEth, 2.0);
});

test("an empty cell composes to an empty book, never to a missing one", () => {
  const s = composeSnapshot(withGrid);
  assert.deepEqual(s.rows[0].dormant.entries, []);
});

test("the rarity legend travels with the snapshot", () => {
  const s = composeSnapshot(withGrid);
  assert.deepEqual(s.legend, withGrid.legend);
});

// ---- chiffres de collection ----

const withStats = {
  ...withGrid,
  stats: { floor: 0.0869, symbol: "ETH", volume: 425.576, sales: 18124, owners: 2624, volume24h: 136.67, sales24h: 1896 },
  grid: {
    ...withGrid.grid,
    rows: [
      { ...withGrid.grid.rows[0],
        inked:   { ...withGrid.grid.rows[0].inked, floorEth: 2.0 },
        dormant: { ...withGrid.grid.rows[0].dormant, floorEth: 2.5, entries: [{ tokenId: 5, priceEth: 2.5 }] } },
      { classLabel: "x1", classValue: 100, docCount: 7131, chainCount: 7131, spreadEth: null,
        inked:   { floorEth: 0.094, floorTokenId: 1, pelotonEth: null, listed: 1, supply: 10, listedRatio: 0.1, entries: [{ tokenId: 1, priceEth: 0.094 }] },
        dormant: { floorEth: null, floorTokenId: null, pelotonEth: null, listed: 0, supply: 10, listedRatio: 0, entries: [] } },
    ],
  },
};

test("the collection floor is the cheapest machine anywhere on the board", () => {
  const s = composeSnapshot(withStats);
  assert.equal(s.collection.floorEth, 0.094);
  assert.ok(Math.abs(s.collection.floorUsd - 0.094 * 1883.24) < 0.01);
});

test("the collection's market cap is the floor across all ten thousand machines", () => {
  const s = composeSnapshot(withStats);
  assert.ok(Math.abs(s.collection.marketCapEth - 940) < 1e-9);   // 0.094 x 10,000
  assert.equal(s.collection.machines, 10000);
});

test("traded volume rides along in both currencies", () => {
  const s = composeSnapshot(withStats);
  assert.equal(s.collection.volumeEth, 425.576);
  assert.ok(Math.abs(s.collection.volumeUsd - 425.576 * 1883.24) < 1);
  assert.equal(s.collection.sales, 18124);
  assert.equal(s.collection.volume24hEth, 136.67);
});

test("a board with no floor anywhere yields no floor and no market cap, not zero", () => {
  const empty = {
    ...withStats,
    grid: { ...withStats.grid, rows: [{ classLabel: "x1", classValue: 100, docCount: 1, chainCount: 1, spreadEth: null,
      inked:   { floorEth: null, floorTokenId: null, pelotonEth: null, listed: 0, supply: 1, listedRatio: 0, entries: [] },
      dormant: { floorEth: null, floorTokenId: null, pelotonEth: null, listed: 0, supply: 1, listedRatio: 0, entries: [] } }] },
  };
  const s = composeSnapshot(empty);
  assert.equal(s.collection.floorEth, null);
  assert.equal(s.collection.marketCapEth, null);
  assert.equal(s.collection.floorUsd, null);
});

test("the published floor still rides along, still labelled as uncomputed-with", () => {
  const s = composeSnapshot(withStats);
  assert.equal(s.collection.publishedFloor, 0.0869);
  assert.equal(s.collection.publishedFloorUsedInComputation, false);
});

// ---- poids effectif et re-encrage ----

const withWeights = {
  ...withStats,
  ink: new Map([[1253, 17000n * 10n ** 18n], [999, 4250n * 10n ** 18n]]),
  weights: new Map([[1253, 2000n], [999, 1000n]]),
};

test("every machine on sale carries the weight the contract computes for it", () => {
  const s = composeSnapshot(withWeights);
  const [a, b] = s.rows[0].inked.entries;
  assert.equal(a.weight, 2000);
  assert.equal(b.weight, 1000);
});

// Le multiplicateur d'encre est ce qui distingue une x10 re-inkée d'une x10
// ordinaire : même classe, poids double, et rien ne le disait.
test("a re-inked machine reports how far past activation it went", () => {
  const s = composeSnapshot(withWeights);
  const [a, b] = s.rows[0].inked.entries;
  assert.equal(a.inkMult, 2);          // 2000 / classe 1000
  assert.equal(a.inkPrinter, 17000);
  assert.equal(b.inkMult, 1);          // à l'activation, rien de plus
  assert.equal(b.inkPrinter, 4250);
});

test("a machine whose weight was never read reports null, not a weight of zero", () => {
  const s = composeSnapshot({ ...withWeights, weights: new Map() });
  assert.equal(s.rows[0].inked.entries[0].weight, null);
  assert.equal(s.rows[0].inked.entries[0].inkMult, null);
});

test("a dormant machine has no ink multiplier to report", () => {
  const s = composeSnapshot({ ...withWeights, weights: new Map([[1253, 0n]]), ink: new Map([[1253, 0n]]) });
  assert.equal(s.rows[0].inked.entries[0].weight, 0);
  assert.equal(s.rows[0].inked.entries[0].inkMult, null);
});

// ---- The Anvil ----

const withAnvil = {
  ...withWeights,
  protocol: { ...withWeights.protocol, sellFeeBps: 500 },
  anvil: {
    spotPrinter: 16082, spreadBps: 500, stepBps: 200, snipeBps: 1000,
    shelf: 30, cratePrinter: 21331, shelfAveragePrinter: 20315,
    paused: false, bidPaused: false,
    // 1253 est coté 2.0 ETH ; l'anvil en donne 400 000 PRINTER
    bids: new Map([[1253, 400000], [999, 100000]]),
  },
};

test("each machine carries what the anvil would pay for it, net of the token's sell fee", () => {
  const s = composeSnapshot(withAnvil);
  const e = s.rows[0].inked.entries[0];
  // 400 000 x $0.0126 = $5040, moins 5% = $4788, / $1883.24 = 2.5425 ETH
  assert.ok(Math.abs(e.anvilBidEth - 2.5425) < 0.002, `got ${e.anvilBidEth}`);
  assert.equal(e.anvilBidPrinter, 400000);
});

// La seule comparaison qui compte : ce listing s'échange-t-il sous ce que le
// protocole lui-même en donnerait ?
test("a listing priced under the anvil's own bid is flagged", () => {
  const s = composeSnapshot(withAnvil);
  assert.equal(s.rows[0].inked.entries[0].underBid, true);   // 2.0 ETH demandé, 2.54 offert
  assert.equal(s.rows[0].inked.entries[1].underBid, false);  // 2.4 demandé, 0.63 offert
});

test("with the bid paused nothing is flagged, because there is no bid to be under", () => {
  const s = composeSnapshot({ ...withAnvil, anvil: { ...withAnvil.anvil, bidPaused: true } });
  assert.equal(s.rows[0].inked.entries[0].underBid, false);
  assert.equal(s.anvil.bidPaused, true);
});

test("with no sell fee read, no comparison is invented", () => {
  const s = composeSnapshot({ ...withAnvil, protocol: { ...withAnvil.protocol, sellFeeBps: null } });
  assert.equal(s.rows[0].inked.entries[0].anvilBidEth, null);
  assert.equal(s.rows[0].inked.entries[0].underBid, false);
});

test("the anvil's own numbers ride along in both currencies", () => {
  const s = composeSnapshot(withAnvil);
  assert.equal(s.anvil.spotPrinter, 16082);
  assert.ok(Math.abs(s.anvil.spotUsd - 16082 * 0.0126) < 0.01);
  assert.equal(s.anvil.shelf, 30);
});

test("shelf machines carry their price in all three currencies and their picture", () => {
  const withShelf = {
    ...withAnvil,
    grid: {
      ...withAnvil.grid,
      rows: withAnvil.grid.rows.map((r, i) => i === 0
        ? { ...r, inked: { ...r.inked, anvilEntries: [{ tokenId: 1253, askPrinter: 23465 }] } }
        : r),
    },
  };
  const s = composeSnapshot(withShelf);
  const a = s.rows[0].inked.anvilEntries[0];
  assert.equal(a.askPrinter, 23465);
  assert.ok(Math.abs(a.askUsd - 23465 * 0.0126) < 0.01);
  assert.ok(Math.abs(a.askEth - (23465 * 0.0126) / 1883.24) < 0.0001);
  assert.equal(a.machine.headwear, "Blueberries");
});

test("with no token price read, a shelf price stays in $PRINTER alone", () => {
  const withShelf = {
    ...withAnvil,
    printer: { usd: null },
    grid: {
      ...withAnvil.grid,
      rows: withAnvil.grid.rows.map((r, i) => i === 0
        ? { ...r, inked: { ...r.inked, anvilEntries: [{ tokenId: 1253, askPrinter: 23465 }] } }
        : r),
    },
  };
  const s = composeSnapshot(withShelf);
  const a = s.rows[0].inked.anvilEntries[0];
  assert.equal(a.askPrinter, 23465);
  assert.equal(a.askUsd, null);
  assert.equal(a.askEth, null);
});

// Une machine du rayon peut avoir été re-inkée comme n'importe quelle autre :
// #4173 est une x10 au plafond, donc poids 2000. Sans ces champs, la vignette
// du rayon ne pouvait pas le dire.
test("a shelf machine carries its weight like any other", () => {
  const s = composeSnapshot({
    ...withAnvil,
    weights: new Map([[1253, 2000n]]),
    grid: {
      ...withAnvil.grid,
      rows: withAnvil.grid.rows.map((r, i) => i === 0
        ? { ...r, inked: { ...r.inked, anvilEntries: [{ tokenId: 1253, askPrinter: 318395 }] } }
        : r),
    },
  });
  const a = s.rows[0].inked.anvilEntries[0];
  assert.equal(a.weight, 2000);
  assert.equal(a.inkMult, 2);      // 2000 / classe 1000
});

// Le ticker voyageait avec les machines d'un portefeuille mais pas avec celles
// du carnet : le panneau annonçait « pas de ticker au bulletin » pour les dix
// desks qui en avaient un.
test("a listed machine carries the ticker its desk wears this epoch", () => {
  const s = composeSnapshot({
    ...withGrid,
    deskIndex: new Map([[1253, 10]]),
    tickers: Array.from({ length: 16 }, (_, i) => (i === 10 ? "SPCX" : null)),
  });
  const m = s.rows[0].inked.entries[0].machine;
  assert.equal(m.desk, "real estate");
  assert.equal(m.ticker, "SPCX");
});

test("a desk with no ticker this epoch says null, not the neighbour's", () => {
  const s = composeSnapshot({
    ...withGrid,
    deskIndex: new Map([[1253, 7]]),
    tickers: Array.from({ length: 16 }, (_, i) => (i === 10 ? "SPCX" : null)),
  });
  assert.equal(s.rows[0].inked.entries[0].machine.ticker, null);
});

// La part brûlée est un chiffre de tête : elle vient d'une lecture directe de
// l'offre, pas d'une capitalisation servie par un tiers, et l'offre frappée au
// départ est scellée à deux cents millions.
test("the burn share is a subtraction from a sealed mint, not an estimate", () => {
  const b = burnHeadline({ printerSupply: 155_000_000, totalInkBurned: 43_285_199n * 10n ** 18n });
  assert.equal(b.minted, 200_000_000);
  assert.equal(Math.round(b.burned), 45_000_000);
  assert.equal((b.share * 100).toFixed(1), "22.5");
  assert.equal(Math.round(b.ink), 43_285_199);
});

test("an unread supply yields no share rather than a share of nothing", () => {
  assert.equal(burnHeadline({ printerSupply: null }), null);
  assert.equal(burnHeadline({}), null);
  assert.equal(burnHeadline(null), null);
  // Une offre à zéro serait une lecture ratée, pas un jeton entièrement brûlé.
  assert.equal(burnHeadline({ printerSupply: 0 }), null);
});

// `JSON.stringify` refuse un BigInt, et il emporte alors toute la réponse — pas
// seulement le champ fautif. Le snapshot part en JSON à chaque requête : aucun
// BigInt ne doit y survivre, quelle que soit la lecture qui l'a produit.
test("the whole snapshot survives being turned into JSON", () => {
  // Le décor reproduit ce que `readProtocol` rend vraiment : des chaînes pour
  // les entiers de la chaîne, des nombres pour ce qu'on a déjà converti. Un
  // décor en BigInt aurait décrit un service qui n'existe pas.
  const snap = composeSnapshot({
    ...base,
    protocol: {
      sellFeeBps: 500,
      epoch: "4", ceiling: "200", activeMachines: "7502", totalWeight: "1515549",
      totalInkBurned: "43548632351295000000000000",
      activationInk: "4250000000000000000000",
      printerSupply: 155_086_367.648,
    },
    // Les poids et l'encre arrivent bien en BigInt, eux : ils viennent de
    // `readInk` et traversent le snapshot machine par machine.
    weights: new Map([[1, 100n]]),
    ink: new Map([[1, 4250n * 10n ** 18n]]),
  });
  assert.doesNotThrow(() => JSON.stringify(snap),
    "un BigInt a atteint le snapshot et emporte toute la réponse avec lui");
  const walk = (v, path = "") => {
    if (typeof v === "bigint") assert.fail(`BigInt dans le snapshot à ${path}`);
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(snap);
});

/* ── ce qui ne circule plus ────────────────────────────────────────────────
   Le coffre du Proton avale une machine à chaque fusion, et `totalSupply` la
   compte encore. Elles ne sont pas détruites — le coffre peut les ressortir —
   mais elles ne sont plus achetables, et c'est le chiffre qui intéresse. */
test("what the vault holds is out of circulation without being destroyed", () => {
  const f = fleetHeadline({ vault: 255, dead: 1 });
  assert.equal(f.minted, 10000);
  assert.equal(f.circulating, 9744);
  assert.equal(f.vault, 255);
  assert.equal(f.dead, 1);
});

test("an empty vault leaves the whole fleet in circulation", () => {
  assert.equal(fleetHeadline({ vault: 0, dead: 0 }).circulating, 10000);
});

// Une lecture ratée n'est pas un coffre vide : annoncer dix mille en
// circulation quand on n'a rien lu serait une affirmation qu'on n'a pas mesurée.
test("an unread vault yields no count rather than a full fleet", () => {
  assert.equal(fleetHeadline({ vault: null, dead: null }), null);
  assert.equal(fleetHeadline(null), null);
  // Une seule des deux lisible reste exploitable : l'autre vaut zéro connu.
  assert.equal(fleetHeadline({ vault: 255, dead: null }).circulating, 9745);
});

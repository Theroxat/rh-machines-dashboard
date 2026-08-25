import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openHistory } from "../src/history.js";

// Une base sur disque : la reprise après redémarrage ne se teste pas en mémoire,
// puisque c'est précisément la relecture d'un fichier qui est en cause.
const tmp = () => join(mkdtempSync(join(tmpdir(), "rh-hist-")), "h.db");

const snap = (over = {}) => ({
  at: 1000,
  pot: { usd: 160000, fleetWeight: 1140000 },
  eth: { usd: 2000 },
  printer: { usd: 0.008, marketCap: 1.4e6, volume24h: 3e5, liquidityUsd: 3.5e5 },
  protocol: { epoch: 2n, activeMachines: 6900n, totalInkBurned: 36000000n * 10n ** 18n, ceiling: 200n, sellFeeBps: 500 },
  collection: { floorEth: 0.05, volumeEth: 645, sales: 20421 },
  anvil: { spotPrinter: 14000, shelf: 0, cratePrinter: 20000, paused: false },
  book: { listed: 2 },
  totals: { inked: 6900, dormant: 3100 },
  vote: { desks: [{ index: 0, ticker: "NVDA", votedWeight: 100 }, { index: 10, ticker: "SPCX", votedWeight: 40 }] },
  rows: [{
    classValue: 300, classLabel: "x3",
    inked: { floorEth: 0.3, listed: 1, pelotonEth: 0.31, entries: [{ tokenId: 1, priceEth: 0.3 }], anvilEntries: [] },
    dormant: { floorEth: 0.1, listed: 1, pelotonEth: 0.11, entries: [{ tokenId: 2, priceEth: 0.1 }], anvilEntries: [] },
  }],
  ...over,
});

test("a sweep writes one tick, and the whole of what it saw", () => {
  const h = openHistory(":memory:");
  const c = h.record(snap());
  assert.equal(c.tick, 1);
  assert.equal(c.floor, 2);
  assert.equal(c.tally, 2);
  assert.equal(c.ballot, 2);
  assert.equal(c.listing, 2);
  const row = h.db.prepare("SELECT * FROM tick").get();
  assert.equal(row.pot, 160000);
  assert.equal(row.sellFeeBps, 500);
  assert.equal(row.inkBurned, 36000000);
  h.close();
});

// La règle qui fait tenir l'année dans quelques dizaines de mégaoctets : ce qui
// n'a pas bougé ne s'écrit pas. Le carnet est presque immobile.
test("a second identical sweep writes a tick and nothing else", () => {
  const h = openHistory(":memory:");
  h.record(snap());
  const c = h.record(snap({ at: 2000 }));
  assert.equal(c.tick, 1);
  assert.equal(c.floor, 0);
  assert.equal(c.listing, 0);
  assert.equal(c.tally, 0);
  h.close();
});

test("a price that moves is written, and only that one", () => {
  const h = openHistory(":memory:");
  h.record(snap());
  const moved = snap({ at: 2000 });
  moved.rows[0].inked.entries[0].priceEth = 0.25;
  const c = h.record(moved);
  assert.equal(c.listing, 1);
  const rows = h.db.prepare("SELECT * FROM listing WHERE tokenId = 1 ORDER BY t").all();
  assert.deepEqual(rows.map((r) => [r.priceEth, r.kind]), [[0.3, "new"], [0.25, "price"]]);
  h.close();
});

// Une annonce qui disparaît est un fait, et c'est même le plus intéressant :
// c'est une vente ou un retrait.
test("a listing that leaves the book is recorded as gone, once", () => {
  const h = openHistory(":memory:");
  h.record(snap());
  const empty = snap({ at: 2000 });
  empty.rows[0].inked.entries = [];
  assert.equal(h.record(empty).listing, 1);
  assert.equal(h.record(snap({ at: 3000, rows: empty.rows })).listing, 0);
  const gone = h.db.prepare("SELECT * FROM listing WHERE kind = 'gone'").all();
  assert.equal(gone.length, 1);
  assert.equal(gone[0].tokenId, 1);
  h.close();
});

test("a machine that burns more ink is written; one that does not is not", () => {
  const h = openHistory(":memory:");
  const weights = new Map([[1, 300n]]);
  const ink = new Map([[1, 4250n * 10n ** 18n]]);
  assert.equal(h.record(snap(), { weights, ink }).machine, 1);
  assert.equal(h.record(snap({ at: 2000 }), { weights, ink }).machine, 0);
  const burned = h.record(snap({ at: 3000 }), { weights: new Map([[1, 600n]]), ink: new Map([[1, 17000n * 10n ** 18n]]) });
  assert.equal(burned.machine, 1);
  const rows = h.db.prepare("SELECT weight, ink FROM machine WHERE tokenId = 1 ORDER BY t").all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ weight: 300, ink: 4250 }, { weight: 600, ink: 17000 }]);
  h.close();
});

// Le bulletin est réattribué en cours de scrutin quand une action n'a pas de
// pool. Ces remaniements sont exactement ce qu'un historique doit retenir.
test("a desk remapped mid-ballot leaves both its names behind it", () => {
  const h = openHistory(":memory:");
  h.record(snap());
  const remapped = snap({ at: 2000, vote: { desks: [
    { index: 0, ticker: "NVDA", votedWeight: 100 },
    { index: 10, ticker: "SPY", votedWeight: 40 },
  ] } });
  assert.equal(h.record(remapped).ballot, 1);
  const rows = h.db.prepare("SELECT ticker FROM ballot WHERE desk = 10 ORDER BY t").all();
  assert.deepEqual(rows.map((r) => r.ticker), ["SPCX", "SPY"]);
  h.close();
});

test("a floor that moves is written against its own cell, not the row's", () => {
  const h = openHistory(":memory:");
  h.record(snap());
  const moved = snap({ at: 2000 });
  moved.rows[0].dormant.floorEth = 0.09;
  assert.equal(h.record(moved).floor, 1);
  const rows = h.db.prepare("SELECT side, floorEth FROM floor ORDER BY t, side").all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ side: "dormant", floorEth: 0.1 }, { side: "inked", floorEth: 0.3 }, { side: "dormant", floorEth: 0.09 }]);
  h.close();
});

// Rien à moitié écrit : un balayage entre en une transaction ou pas du tout.
test("a sweep that throws leaves nothing behind", () => {
  const h = openHistory(":memory:");
  h.record(snap());
  const before = h.db.prepare("SELECT COUNT(*) n FROM listing").get().n;
  assert.throws(() => h.record(snap({ at: 2000, rows: [{ classValue: 300, inked: null, dormant: null }] })));
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM listing").get().n, before);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM tick").get().n, 1);
  h.close();
});

// Une annonce qui reste en place des heures ne doit réveiller personne deux
// fois, et la note survit aux redémarrages — sinon chaque déploiement
// rejouerait toutes les alertes en cours.
test("a deal sounds once, however many sweeps see it", () => {
  const h = openHistory(":memory:");
  assert.equal(h.claimAlert("gap:7:0.05", 7, "gap", 1000), true);
  assert.equal(h.claimAlert("gap:7:0.05", 7, "gap", 2000), false);
  assert.equal(h.claimAlert("gap:7:0.05", 7, "gap", 3000), false);
  h.close();
});

test("the same machine at another price is another deal", () => {
  const h = openHistory(":memory:");
  assert.equal(h.claimAlert("gap:7:0.05", 7, "gap", 1000), true);
  assert.equal(h.claimAlert("gap:7:0.04", 7, "gap", 2000), true);
  h.close();
});

// Une annonce retirée et remise à un centime près est la même : la machine ne
// doit pas sonner deux fois dans la journée, quel que soit son prix.
test("a machine that already sounded stays quiet for its cooldown", () => {
  const h = openHistory(":memory:");
  const day = 6 * 60 * 60 * 1000;
  assert.equal(h.claimAlert("margin:7:0.052", 7, "margin", 1000, day), true);
  assert.equal(h.claimAlert("margin:7:0.051", 7, "margin", 2000, day), false);
  assert.equal(h.claimAlert("margin:7:0.051", 7, "margin", 1000 + day + 1, day), true);
  h.close();
});

test("without a cooldown only the exact same deal is refused", () => {
  const h = openHistory(":memory:");
  assert.equal(h.claimAlert("margin:7:0.052", 7, "margin", 1000), true);
  assert.equal(h.claimAlert("margin:7:0.051", 7, "margin", 2000), true);
  h.close();
});

// La reprise après redémarrage ne servait à rien : `seed()` reconstruit ses
// clés depuis SQLite avec un join(":") — donc des chaînes — pendant que les
// tables à clé unique écrivent avec le tokenId tel que la chaîne le donne, un
// nombre. Map.get(463) ne trouve pas Map.set("463"), et les dix mille machines
// se réécrivaient à l'identique à chaque démarrage : 98% de la table.
test("a restart re-reads what it already knows, and writes none of it again", () => {
  const path = tmp();
  const weights = new Map([[463, 100n], [464, 200n]]);
  const ink = new Map([[463, 4250n * 10n ** 18n], [464, 8500n * 10n ** 18n]]);

  const first = openHistory(path);
  first.record(snap({ at: 1000 }), { ink, weights });
  first.close();

  // Un second processus, sur la même base, avec un état inchangé.
  const second = openHistory(path);
  const counts = second.record(snap({ at: 2000 }), { ink, weights });
  assert.equal(counts.machine, 0, "un redémarrage ne doit rien réécrire d'inchangé");

  // Et une vraie brûlure passe toujours.
  const burned = new Map([[463, 17000n * 10n ** 18n], [464, 8500n * 10n ** 18n]]);
  assert.equal(second.record(snap({ at: 3000 }), { ink: burned, weights }).machine, 1);
  second.close();

  const db = new DatabaseSync(path, { readOnly: true });
  assert.equal(db.prepare("SELECT COUNT(*) c FROM machine").get().c, 3);
  db.close();
});

// Le pad tourne sur sa propre cadence, donc il a sa propre écriture. Ce qui n'a
// pas bougé ne s'écrit pas, ici comme ailleurs.
test("the pad records only the curves that moved", () => {
  const h = openHistory(":memory:");
  const coins = [
    { token: "0xA", realBaseUnits: 10, graduated: false },
    { token: "0xB", realBaseUnits: 0, graduated: false },
  ];
  assert.equal(h.recordPad(coins, 1000), 2);
  assert.equal(h.recordPad(coins, 2000), 0);
  assert.equal(h.recordPad([{ ...coins[0], realBaseUnits: 12 }, coins[1]], 3000), 1);
  h.close();
});

// Au premier jour, tout ce qu'on a est plus récent que la fenêtre demandée.
// Sans repli, la ligne de base est vide et la page n'affiche aucun mouvement
// alors qu'elle en a mesuré un.
test("a baseline older than the record falls back to the oldest reading there is", () => {
  const h = openHistory(":memory:");
  h.recordPad([{ token: "0xA", realBaseUnits: 10, graduated: false }], 100000);
  h.recordPad([{ token: "0xA", realBaseUnits: 30, graduated: false }], 200000);

  // Une coupure antérieure à tout ce qu'on a.
  const b = h.padBaseline(1);
  assert.equal(b.at.get("0xA"), 10);
  assert.equal(b.oldest, 100000);
  assert.equal(b.firstSeen.get("0xA"), 100000);

  // Et une coupure qui tombe entre les deux relevés rend bien le premier.
  assert.equal(h.padBaseline(150000).at.get("0xA"), 10);
  h.close();
});

test("a pad never recorded yields an empty baseline rather than throwing", () => {
  const h = openHistory(":memory:");
  const b = h.padBaseline(Date.now());
  assert.equal(b.at.size, 0);
  assert.equal(b.oldest, null);
  h.close();
});

// Le site officiel annonce 175 000 $PRINTER brûlés par heure « en moyenne
// depuis le lancement », sous un bandeau « live ». Le rythme réel du moment est
// trois à treize fois plus bas : la ruée d'activation initiale écrase la
// moyenne, et une moyenne sous un bandeau « live » se lit comme un rythme.
test("the burn rate is measured over a window, not averaged since the dawn of time", () => {
  const h = openHistory(":memory:");
  const H = 3600000;
  const now = 100 * H;
  // 1 000 000 brûlés en 10 h → 100 000 / h
  const at = (t, supply) => h.record(snap({ at: t, printer: { usd: 0.01, marketCap: supply * 0.01, volume24h: 1, liquidityUsd: 1 } }));
  at(now - 10 * H, 160_000_000);
  at(now - 5 * H, 159_500_000);
  at(now, 159_000_000);

  const r = h.burnRate(24 * H, now);
  assert.equal(Math.round(r.perHour), 100_000);
  assert.equal(Math.round(r.burned), 1_000_000);
  assert.equal(r.hours, 10);
  assert.equal(r.suspect, false);

  // Une fenêtre plus courte voit un rythme différent — c'est tout l'intérêt.
  const short = h.burnRate(6 * H, now);
  assert.equal(Math.round(short.perHour), 100_000);
  assert.equal(short.hours, 5);
  h.close();
});

// Deux relevés espacés d'une minute donneraient un taux horaire tiré du bruit.
test("too short a span yields no rate rather than one drawn from noise", () => {
  const h = openHistory(":memory:");
  const now = 100 * 3600000;
  const at = (t, s) => h.record(snap({ at: t, printer: { usd: 0.01, marketCap: s * 0.01, volume24h: 1, liquidityUsd: 1 } }));
  at(now - 60000, 160_000_000);
  at(now, 159_999_000);
  assert.equal(h.burnRate(24 * 3600000, now), null);
  h.close();
});

test("a single reading is not a rate", () => {
  const h = openHistory(":memory:");
  h.record(snap({ at: 1000 }));
  assert.equal(h.burnRate(86400000, 1000), null);
  h.close();
});

// Le $PRINTER ne peut pas être frappé. Une offre qui monte veut dire que la
// capitalisation ou le prix a bougé sous nos pieds — on le signale plutôt que
// de publier une combustion négative.
test("a supply that rose is flagged, never published as a negative burn", () => {
  const h = openHistory(":memory:");
  const H = 3600000, now = 100 * H;
  const at = (t, s) => h.record(snap({ at: t, printer: { usd: 0.01, marketCap: s * 0.01, volume24h: 1, liquidityUsd: 1 } }));
  at(now - 10 * H, 159_000_000);
  at(now, 160_000_000);
  assert.equal(h.burnRate(24 * H, now).suspect, true);
  h.close();
});

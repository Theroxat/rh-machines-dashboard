import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseWallet, cutUsd, voteAdvice, sweepCut, isAddress } from "../src/wallet.js";

// Les chiffres du scrutin de l'epoch 2, relevés le 2026-08-18. Le portefeuille
// est celui de cinq machines réelles : health 1x, utilities 2x, real estate 3x.
const FLEET = 1183333;
const POT = 164023;
const SECTOR = [153065, 139895, 104044, 111741, 98931, 156731, 111424, 62927, 65667, 76845, 62308, 8000, 7550, 5750, 12355, 6100];
const TALLY  = [157848,  93223,  42032,  56514,      0,  22550,  26624,      0,  52718,  15800,  17450,     0,     0,     0,     0,    0];
const TICKERS = ["NVDA","AMD","MSFT","GOOGL",null,"AAPL","AMZN",null,"TSLA","GME","SPCX",null,"PLTR",null,null,null];
const MINE = new Array(16).fill(0);
MINE[5] = 100; MINE[9] = 200; MINE[10] = 300;

// Depuis le 27 août le desk en tête rafle le pot. Ce portefeuille ne détient
// rien sur NVDA, en tête : il touche sa part simple, diluée par le double des
// machines NVDA — moins que le partage naïf.
test("a wallet's cut follows the winner-takes-all formula", () => {
  const c = cutUsd({ tally: TALLY, myWeight: 600, myByDesk: MINE, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR });
  const naive = (POT * 600) / FLEET;
  assert.ok(c < naive, "le double des machines du desk gagnant dilue votre part");
  assert.equal(c.toFixed(2), ((POT * 600) / (FLEET + SECTOR[0])).toFixed(2));
});

test("with no vote cast the wallet's cut is the flat split", () => {
  const c = cutUsd({ tally: new Array(16).fill(0), myWeight: 600, myByDesk: MINE, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR });
  assert.equal(c.toFixed(2), ((POT * 600) / FLEET).toFixed(2));
});

test("the best vote is the smallest desk you hold the most of", () => {
  const { best, options } = voteAdvice({
    tally: TALLY, myWeight: 600, myByDesk: MINE, potUsd: POT, fleetWeight: FLEET,
    sectorWeight: SECTOR, tickers: TICKERS,
  });
  assert.equal(best.ticker, "SPCX");        // real estate : 3x sur 6x, et le plus petit
  assert.equal(best.desk, "real estate");
  assert.equal(options[1].ticker, "GME");   // utilities : 2x, un peu plus gros
  assert.equal(options[2].ticker, "AAPL");  // health : 1x, et le plus gros des trois
});

// Un portefeuille pèse rarement assez pour déplacer un scrutin. Gonfler le
// chiffre ferait croire à un levier qui n'existe pas.
test("the advice says plainly how little a single ballot moves", () => {
  const { best } = voteAdvice({
    tally: TALLY, myWeight: 600, myByDesk: MINE, potUsd: POT, fleetWeight: FLEET,
    sectorWeight: SECTOR, tickers: TICKERS,
  });
  // 600 de poids ne déplacent pas NVDA, en tête à 157 848 : le bulletin seul ne
  // change rien, et la page ne prétend pas le contraire.
  assert.equal(best.gainUsd, 0);
  // Ce qui compte : ce que rapporterait la victoire de ce desk.
  assert.ok(best.ifWinsUsd > best.cutUsd);
});

// Ce que le vote pèse vraiment n'est pas dans le bulletin d'un seul : c'est
// l'issue du scrutin qui déplace des dizaines de dollars.
test("a desk sweeping the ballot is worth forty times a single vote", () => {
  const base = cutUsd({ tally: TALLY, myWeight: 600, myByDesk: MINE, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR });
  const swept = sweepCut(10, { myWeight: 600, myByDesk: MINE, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR });
  assert.ok(swept - base > 35, `real estate raflant tout vaut +$${(swept - base).toFixed(0)}`);
});

// Un desk sans ticker n'est pas sur le bulletin : on ne peut pas y voter, donc
// il ne peut pas être conseillé.
test("a desk with no ticker this epoch is never advised", () => {
  const { options } = voteAdvice({
    tally: TALLY, myWeight: 600, myByDesk: MINE, potUsd: POT, fleetWeight: FLEET,
    sectorWeight: SECTOR, tickers: TICKERS,
  });
  assert.equal(options.length, TICKERS.filter(Boolean).length);
  for (const o of options) assert.ok(o.ticker, "chaque option est votable");
});

test("a wallet holding nothing is analysed without inventing a cut", () => {
  const w = analyseWallet({
    address: "0x" + "1".repeat(40), tokenIds: [], weightOf: () => 0, deskOf: () => null,
    tally: TALLY, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR, tickers: TICKERS,
  });
  assert.equal(w.weight, 0);
  assert.equal(w.cutUsd, null);
  assert.equal(w.advice, null);
  assert.deepEqual(w.machines, []);
});

// Une dormante est là, ne vote pas et ne touche rien. La compter comme absente
// cacherait qu'il suffit de l'activer.
test("a dormant machine is listed and counted apart, not dropped", () => {
  const w = analyseWallet({
    address: "0x" + "1".repeat(40), tokenIds: [1, 2],
    weightOf: (id) => (id === 1 ? 300 : 0), deskOf: () => 10,
    tally: TALLY, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR, tickers: TICKERS,
  });
  assert.equal(w.machines.length, 2);
  assert.equal(w.awake, 1);
  assert.equal(w.dormant, 1);
  assert.equal(w.weight, 300);
});

test("machines come back heaviest first, which is the order that matters", () => {
  const w = analyseWallet({
    address: "0x" + "1".repeat(40), tokenIds: [7, 8, 9],
    weightOf: (id) => ({ 7: 100, 8: 600, 9: 200 })[id], deskOf: () => 5,
    tally: TALLY, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR, tickers: TICKERS,
  });
  assert.deepEqual(w.machines.map((m) => m.tokenId), [8, 9, 7]);
  assert.equal(w.advice.best.ticker, "AAPL");   // un seul desk détenu
});

test("every machine carries the ticker its desk wears this epoch", () => {
  const w = analyseWallet({
    address: "0x" + "1".repeat(40), tokenIds: [1], weightOf: () => 300, deskOf: () => 10,
    tally: TALLY, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR, tickers: TICKERS,
  });
  assert.equal(w.machines[0].desk, "real estate");
  assert.equal(w.machines[0].ticker, "SPCX");
});

// Ce qui entre ici interroge un index et ressort dans du balisage.
test("only a plain forty-hex address is accepted", () => {
  assert.ok(isAddress("0x" + "aF3d".repeat(10)));
  assert.ok(isAddress("  0x" + "0".repeat(40) + "  "));
  assert.equal(isAddress("0x" + "0".repeat(39)), false);
  assert.equal(isAddress("0x" + "0".repeat(41)), false);
  assert.equal(isAddress("vitalik.eth"), false);
  assert.equal(isAddress("0x<script>alert(1)</script>"), false);
  assert.equal(isAddress(null), false);
  assert.equal(isAddress(undefined), false);
  assert.equal(isAddress({ toString: () => "0x" + "0".repeat(40) }), false);
});

// Le Meltdown du 2026-09-23 : la chaîne laisse son poids à une brûlée, l'équipe
// dit qu'elle ne touchera plus rien. Le portefeuille le dit et ne promet rien.
test("a machine burned in the Meltdown is marked and promised no drop", () => {
  const w = analyseWallet({
    address: "0x" + "1".repeat(40), tokenIds: [1, 2],
    weightOf: () => 100, deskOf: () => 10,
    epochUsdOf: () => 5, burnedOf: (id) => id === 2,
    tally: TALLY, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR, tickers: TICKERS,
  });
  const byId = new Map(w.machines.map((m) => [m.tokenId, m]));
  assert.equal(byId.get(1).burned, false);
  assert.equal(byId.get(1).epochUsd, 5);
  assert.equal(byId.get(2).burned, true);
  assert.equal(byId.get(2).epochUsd, null);
});

test("a Dark Machine is marked and promised no drop from the pot", () => {
  const w = analyseWallet({
    address: "0x" + "1".repeat(40), tokenIds: [1],
    weightOf: () => 100, deskOf: () => 10, epochUsdOf: () => 5, darkOf: () => true,
    tally: TALLY, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR, tickers: TICKERS,
  });
  assert.equal(w.machines[0].dark, true);
  assert.equal(w.machines[0].epochUsd, null);
});

test("a Blue Machine is marked and promised no drop from the pot", () => {
  const w = analyseWallet({
    address: "0x" + "1".repeat(40), tokenIds: [1523],
    weightOf: () => 100, deskOf: () => 10, epochUsdOf: () => 5, blueOf: () => true,
    tally: TALLY, potUsd: POT, fleetWeight: FLEET, sectorWeight: SECTOR, tickers: TICKERS,
  });
  assert.equal(w.machines[0].blue, true);
  assert.equal(w.machines[0].epochUsd, null);
});

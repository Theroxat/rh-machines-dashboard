import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { priceCoin, padStats, readPad, FACTORY_ABI } from "../src/pad.js";

const e18 = (x) => ethers.parseUnits(String(x), 18);
const coin = (over = {}) => ({
  factory: "0xF", token: "0xT", index: 0, symbol: "MEME", name: "Meme", creator: "0xC1",
  base: "0xB", baseSymbol: "NVDA", supply: e18(1_000_000_000),
  baseReserve: e18(1000), tokenReserve: e18(800_000_000),
  realBase: e18(10), gradBase: e18(100), graduated: false, feeBps: 100, ...over,
});

test("a coin is priced from its curve and the stock behind it", () => {
  // 1000 NVDA / 800M jetons = 1.25e-6 NVDA le jeton, à $200 l'action.
  const c = priceCoin(coin(), 200);
  assert.equal(c.lockedUsd, 2000);                 // 10 NVDA immobilisées
  assert.equal(Math.round(c.nominalUsd), 250000);  // 1.25e-6 × 1e9 × 200
  assert.equal(c.progress, 0.1);                   // 10 sur 100 à graduer
});

// Sans prix pour l'action de base, les deux montants se taisent. La progression
// est un rapport entre deux quantités de la même action : elle tient debout.
test("with no price for the stock behind it, a coin claims no dollars", () => {
  const c = priceCoin(coin(), null);
  assert.equal(c.lockedUsd, null);
  assert.equal(c.nominalUsd, null);
  assert.equal(c.progress, 0.1);
});

// Une pièce graduée a quitté la courbe. Sa barre est pleine, quoi qu'il reste
// dans les réserves — sinon elle s'affiche à 31% en portant la mention « grad ».
test("a graduated coin shows a full bar, whatever is left in its reserves", () => {
  assert.equal(priceCoin(coin({ graduated: true, realBase: e18(31) }), 200).progress, 1);
});

test("a coin nobody has bought is at nothing, not at a division by zero", () => {
  const c = priceCoin(coin({ realBase: 0n, baseReserve: 0n, tokenReserve: 0n }), 200);
  assert.equal(c.lockedUsd, 0);
  assert.equal(c.nominalUsd, 0);
  assert.equal(c.progress, 0);
});

// Les deux chiffres ne disent pas la même chose et l'un ne remplace pas l'autre :
// la capitalisation porte sur tout le jeton émis, y compris ce que personne n'a
// acheté ; l'argent immobilisé est ce qui a réellement été versé.
test("the pad counts what was paid in apart from what the curve implies", () => {
  const s = padStats([priceCoin(coin(), 200), priceCoin(coin({ realBase: e18(5) }), 200)]);
  assert.equal(s.lockedUsd, 3000);
  assert.equal(Math.round(s.nominalUsd), 500000);
  assert.equal(s.launched, 2);
});

// Plus de la moitié du pad n'a jamais vu un échange. Un tableau qui ne compte
// que les vivantes donne un taux de graduation flatteur et faux.
test("coins nobody ever bought are counted, not quietly dropped", () => {
  const s = padStats([
    priceCoin(coin({ realBase: 0n }), 200),
    priceCoin(coin({ realBase: 0n, creator: "0xC2" }), 200),
    priceCoin(coin({ graduated: true }), 200),
  ]);
  assert.equal(s.launched, 3);
  assert.equal(s.untouched, 2);
  assert.equal(s.graduated, 1);
  assert.equal(s.creators, 2);
});

// Une pièce sans prix ne vaut pas zéro dollar : elle sort du total, et le
// compte le dit — même règle que pour les machines d'un portefeuille.
test("a coin that could not be priced leaves the total rather than joining it at nothing", () => {
  const s = padStats([priceCoin(coin(), 200), priceCoin(coin({ baseSymbol: "???" }), null)]);
  assert.equal(s.lockedUsd, 2000);
  assert.equal(s.unpriced, 1);
});

test("the bases are ranked by the money actually sitting in them", () => {
  const s = padStats([
    priceCoin(coin({ baseSymbol: "GME", realBase: e18(1) }), 20),
    priceCoin(coin({ baseSymbol: "NVDA" }), 200),
    priceCoin(coin({ baseSymbol: "NVDA", graduated: true }), 200),
  ]);
  assert.deepEqual(s.bases.map((b) => b.symbol), ["NVDA", "GME"]);
  assert.equal(s.bases[0].coins, 2);
  assert.equal(s.bases[0].graduated, 1);
  assert.equal(s.bases[1].lockedUsd, 20);
});

test("no coin at all yields no total rather than a confident zero", () => {
  const s = padStats([]);
  assert.equal(s.lockedUsd, null);
  assert.equal(s.launched, 0);
});

// --- la lecture on-chain, sur une chaîne simulée ---------------------------

const enc = (iface, fn, vals) => iface.encodeFunctionResult(fn, vals);
const TOK = new ethers.Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function totalSupply() view returns (uint256)",
]);

function fakeChain({ count = 2, breakOne = false } = {}) {
  const addr = (i) => "0x" + String(i + 1).padStart(40, "0");
  const provider = {
    call: async () => enc(FACTORY_ABI, "coinsCount", [count]),
  };
  const aggregate3 = async (calls) => calls.map((c) => {
    const sel = c.callData.slice(0, 10);
    if (sel === FACTORY_ABI.getFunction("allCoins").selector) {
      const [i] = FACTORY_ABI.decodeFunctionData("allCoins", c.callData);
      return [true, enc(FACTORY_ABI, "allCoins", [addr(Number(i))])];
    }
    if (sel === FACTORY_ABI.getFunction("coins").selector) {
      const [t] = FACTORY_ABI.decodeFunctionData("coins", c.callData);
      if (breakOne && t === addr(1)) return [false, "0x"];
      return [true, enc(FACTORY_ABI, "coins",
        ["0x" + "b".repeat(40), "0x" + "c".repeat(40), e18(1000), e18(800_000_000), e18(10), false,
          [0n, 0n, 0n, e18(100), 0n, 100]])];
    }
    if (sel === TOK.getFunction("symbol").selector) return [true, enc(TOK, "symbol", ["MEME"])];
    if (sel === TOK.getFunction("name").selector) return [true, enc(TOK, "name", ["Meme Coin"])];
    if (sel === TOK.getFunction("totalSupply").selector) return [true, enc(TOK, "totalSupply", [e18(1e9)])];
    return [false, "0x"];
  });
  return { provider, aggregate3 };
}

test("both factories are read end to end, and the launch order is kept", async () => {
  const { provider, aggregate3 } = fakeChain({ count: 3 });
  const coins = await readPad({ provider, aggregate3, factories: ["0xFA", "0xFB"], batchSize: 2 });
  assert.equal(coins.length, 6);
  assert.deepEqual(coins.filter((c) => c.factory === "0xFA").map((c) => c.index), [0, 1, 2]);
  assert.equal(coins[0].symbol, "MEME");
  assert.equal(coins[0].baseSymbol, "MEME");
  assert.equal(coins[0].feeBps, 100);
});

// Une pièce dont l'état ne se lit pas ne doit pas emporter les 273 autres.
test("one unreadable coin costs its own line, not the whole board", async () => {
  const { provider, aggregate3 } = fakeChain({ count: 3, breakOne: true });
  const coins = await readPad({ provider, aggregate3, factories: ["0xFA"], batchSize: 300 });
  assert.equal(coins.length, 2);
});

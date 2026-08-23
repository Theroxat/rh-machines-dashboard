import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { priceCoin, padStats, readPad, readPools, padMovement, FACTORY_ABI } from "../src/pad.js";

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

// --- les pools des graduées ------------------------------------------------

// Graduer vide la courbe. Une graduée lit donc zéro dans `realBase`, et la
// compter parmi celles que personne n'a achetées rangeait les seules réussites
// du pad au milieu des mortes, sous la mention « never traded ».
test("a graduated coin is never counted among those nobody ever bought", () => {
  const s = padStats([
    priceCoin(coin({ graduated: true, realBase: 0n }), 200),
    priceCoin(coin({ realBase: 0n }), 200),
  ]);
  assert.equal(s.untouched, 1);
  assert.equal(s.graduated, 1);
});

test("what sits in the graduated pools is counted apart from what sits in curves", () => {
  const s = padStats([
    priceCoin({ ...coin({ graduated: true, realBase: 0n }), pool: { poolUsd: 33024, vol24hUsd: 164995, trades24h: 2038 } }, 200),
    priceCoin({ ...coin({ graduated: true, realBase: 0n }), pool: { poolUsd: 878, vol24hUsd: 1057, trades24h: 53 } }, 200),
    priceCoin(coin(), 200),
  ]);
  assert.equal(s.lockedUsd, 2000);      // la seule encore sur sa courbe
  assert.equal(s.poolUsd, 33902);
  assert.equal(s.vol24hUsd, 166052);
  assert.equal(s.trades24h, 2091);
});

// Aucune pool lisible n'est pas une pool vide : zéro dollar de liquidité est une
// affirmation, et elle serait fausse.
test("with no pool read at all the pool totals stay silent rather than claim zero", () => {
  const s = padStats([priceCoin(coin({ graduated: true, realBase: 0n }), 200)]);
  assert.equal(s.poolUsd, null);
  assert.equal(s.vol24hUsd, null);
});

test("a pool is read at its deepest pair, never at the thinnest", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ pairs: [
      { priceUsd: "9", liquidity: { usd: 12 }, marketCap: 99, volume: { h24: 1 }, txns: { h24: { buys: 1, sells: 0 } } },
      { priceUsd: "0.0001068", liquidity: { usd: 33024 }, marketCap: 106850, volume: { h24: 164995 }, txns: { h24: { buys: 1200, sells: 838 } } },
    ] }),
  });
  const pools = await readPools([{ token: "0xT" }], fetchImpl);
  const p = pools.get("0xT");
  assert.equal(p.poolUsd, 33024);
  assert.equal(p.capUsd, 106850);
  assert.equal(p.vol24hUsd, 164995);
  assert.equal(p.trades24h, 2038);
});

// Une pool illisible coûte sa propre ligne, pas la page : la pièce garde sa
// place et ses montants se taisent.
test("a pool that cannot be read costs its own line, not the section", async () => {
  const fetchImpl = async (url) => url.includes("0xA")
    ? { ok: false }
    : { ok: true, json: async () => ({ pairs: [{ priceUsd: "1", liquidity: { usd: 5 }, volume: { h24: 0 }, txns: { h24: {} } }] }) };
  const pools = await readPools([{ token: "0xA" }, { token: "0xB" }], fetchImpl);
  assert.equal(pools.has("0xA"), false);
  assert.equal(pools.get("0xB").poolUsd, 5);
});

test("a pool answer with no usable pair yields nothing rather than a zero price", async () => {
  const pools = await readPools([{ token: "0xT" }],
    async () => ({ ok: true, json: async () => ({ pairs: [{ priceUsd: "0", liquidity: { usd: 900 } }] }) }));
  assert.equal(pools.size, 0);
});

// --- ce qui a bougé ---------------------------------------------------------

const H = 3600000;
const withUnits = (c, basePrice) => priceCoin(c, basePrice);
const base = (over = {}) => ({ at: new Map(), gradAt: new Set(), firstSeen: new Map(), oldest: null, ...over });

test("money in and money out are counted apart, never netted into one figure", () => {
  const coins = [
    withUnits(coin({ token: "0xA", realBase: e18(30) }), 200),   // était à 10 → +20
    withUnits(coin({ token: "0xB", realBase: e18(4) }), 200),    // était à 10 → -6
  ];
  const m = padMovement({
    coins, now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xA", 10], ["0xB", 10]]), oldest: 10 * H }),
  });
  assert.equal(m.inUsd, 4000);
  assert.equal(m.outUsd, 1200);
  assert.equal(m.touched, 2);
});

// Une courbe adossée à NVDA « gagne » quinze pour cent le jour où NVDA les
// gagne, sans que personne n'y ait mis un centime. L'écart se mesure donc en
// unités de l'action, et se convertit au cours du moment.
test("a stock that rallies is not counted as money coming in", () => {
  const coins = [withUnits(coin({ token: "0xA", realBase: e18(10) }), 400)]; // le cours a doublé
  const m = padMovement({
    coins, now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xA", 10]]), oldest: 10 * H }),
  });
  assert.equal(m.inUsd, 0);
  assert.equal(m.touched, 0);
});

test("a coin born inside the window is a launch, and what it took is money in", () => {
  const coins = [withUnits(coin({ token: "0xNEW", realBase: e18(5) }), 200)];
  const m = padMovement({
    coins, now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xOLD", 1]]), firstSeen: new Map([["0xNEW", 99 * H]]), oldest: 10 * H }),
  });
  assert.equal(m.launched, 1);
  assert.equal(m.launchedTraded, 1);
  assert.equal(m.inUsd, 1000);
});

// Rencontrer une pièce n'est pas la voir naître. Le jour où l'on commence à
// enregistrer, les deux cent quatre-vingts déjà là ont toutes leur première
// trace à cet instant : les compter comme des lancements annonce « +281 » un
// matin où pas une seule n'est née.
test("the coins already there when we started watching are not counted as born", () => {
  const start = 90 * H;
  const m = padMovement({
    coins: [withUnits(coin({ token: "0xOLD" }), 200), withUnits(coin({ token: "0xNEW" }), 200)],
    now: 100 * H, windowMs: 24 * H,
    baseline: base({
      at: new Map([["0xOLD", 10], ["0xNEW", 10]]),
      firstSeen: new Map([["0xOLD", start], ["0xNEW", 95 * H]]),
      oldest: start,
    }),
  });
  assert.equal(m.launched, 1);
});

test("a coin launched and never bought counts as launched, not as traded", () => {
  const m = padMovement({
    coins: [withUnits(coin({ token: "0xNEW", realBase: 0n }), 200)],
    now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xOLD", 1]]), firstSeen: new Map([["0xNEW", 99 * H]]), oldest: 10 * H }),
  });
  assert.equal(m.launched, 1);
  assert.equal(m.launchedTraded, 0);
});

// « 7 lancées aujourd'hui » et « 7 depuis qu'on regarde » ne sont pas la même
// affirmation. Tant que l'enregistrement est plus jeune que la fenêtre, la
// fenêtre réelle est plus courte et il faut le dire.
test("a window longer than the record is announced as the shorter one it is", () => {
  const m = padMovement({
    coins: [withUnits(coin({ token: "0xA" }), 200)],
    now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xA", 10]]), oldest: 98 * H }),
  });
  assert.equal(m.partial, true);
  assert.equal(m.since, 98 * H);
});

test("a record older than the window is the window itself, and says nothing is missing", () => {
  const m = padMovement({
    coins: [withUnits(coin({ token: "0xA" }), 200)],
    now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xA", 10]]), oldest: 10 * H }),
  });
  assert.equal(m.partial, false);
  assert.equal(m.since, 76 * H);
});

// Sans rien d'enregistré, il n'y a pas un mouvement nul : il n'y a pas de
// mesure, et la page doit dire qu'elle vient d'ouvrir les yeux.
test("with nothing recorded there is no movement, rather than a movement of zero", () => {
  assert.equal(padMovement({ coins: [], baseline: base(), now: 1, windowMs: H }), null);
});

test("the biggest movers are ranked each way, and a coin appears on one side only", () => {
  const coins = [
    withUnits(coin({ token: "0xA", symbol: "UP1", realBase: e18(40) }), 200),
    withUnits(coin({ token: "0xB", symbol: "UP2", realBase: e18(20) }), 200),
    withUnits(coin({ token: "0xC", symbol: "DOWN", realBase: e18(1) }), 200),
  ];
  const m = padMovement({
    coins, now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xA", 10], ["0xB", 10], ["0xC", 10]]), oldest: 10 * H }),
  });
  assert.deepEqual(m.climbing.map((x) => x.symbol), ["UP1", "UP2"]);
  assert.deepEqual(m.cooling.map((x) => x.symbol), ["DOWN"]);
});

// D'où elle vient compte autant que où elle est : 45% depuis deux jours et 45%
// atteints ce matin ne se ressemblent que sur une page qui ne sait pas compter
// le temps.
test("a mover carries where it came from, not only where it stands", () => {
  const m = padMovement({
    coins: [withUnits(coin({ token: "0xA", realBase: e18(61), gradBase: e18(100) }), 200)],
    now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xA", 45]]), oldest: 10 * H }),
  });
  assert.equal(m.climbing[0].wasProgress, 0.45);
  assert.equal(m.climbing[0].progress, 0.61);
});

// Graduer vide la courbe dans une vraie pool. Compté comme un flux sortant,
// TONER prenait la tête des courbes qui refroidissent le jour même où elle
// réussissait, à −$6 760 — le plus gros « départ » de la fenêtre.
test("a graduation is not counted as money leaving the pad", () => {
  const m = padMovement({
    coins: [withUnits(coin({ token: "0xT", symbol: "TONER", realBase: 0n, graduated: true }), 200)],
    now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xT", 34]]), oldest: 10 * H }),
  });
  assert.equal(m.outUsd, 0);
  assert.equal(m.cooling.length, 0);
  assert.equal(m.graduatedIn, 1);
  assert.deepEqual(m.graduated.map((g) => g.symbol), ["TONER"]);
});

// Une pièce graduée avant la fenêtre n'a pas gradué pendant : elle ne compte
// pas une seconde fois à chaque relevé.
test("a coin already graduated before the window is not counted as graduating in it", () => {
  const m = padMovement({
    coins: [withUnits(coin({ token: "0xJ", realBase: 0n, graduated: true }), 200)],
    now: 100 * H, windowMs: 24 * H,
    baseline: base({ at: new Map([["0xJ", 0]]), gradAt: new Set(["0xJ"]), oldest: 10 * H }),
  });
  assert.equal(m.graduatedIn, 0);
  assert.equal(m.graduated.length, 0);
});

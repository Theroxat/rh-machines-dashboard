import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPrinter, fetchEthUsd, fetchStockPrices } from "../src/prices.js";
import { ADDRESSES } from "../src/config.js";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

const ethPair = (over = {}) => ({
  pairs: [{
    baseToken: { address: ADDRESSES.USDG, symbol: "USDG" },
    quoteToken: { address: ADDRESSES.WETH, symbol: "WETH" },
    priceNative: "0.0005310",
    priceUsd: "1.0012",
    ...over,
  }],
});

test("the printer price is read with its context", async () => {
  const p = await fetchPrinter(async () => ok({
    pairs: [{ priceUsd: "0.01260", priceChange: { h24: 598 }, liquidity: { usd: 427948.51 },
              volume: { h24: 1170239.13 }, fdv: 2165143, marketCap: 2165143 }],
  }));
  assert.equal(p.usd, 0.0126);
  assert.equal(p.change24h, 598);
  assert.equal(p.liquidityUsd, 427948.51);
  assert.equal(p.marketCap, 2165143);
  assert.equal(p.volume24h, 1170239.13);
});

test("an absent pair is an error, not a price of zero", async () => {
  await assert.rejects(fetchPrinter(async () => ok({ pairs: [] })), /PRINTER/);
});

test("ETH is priced from the pool and cross-checked against coingecko", async () => {
  const res = await fetchEthUsd(async (url) =>
    ok(String(url).includes("coingecko") ? { ethereum: { usd: 1883.81 } } : ethPair()),
  );
  assert.ok(Math.abs(res.local - 1885.5) < 1);   // (1 / 0.0005310) * 1.0012
  assert.equal(res.coingecko, 1883.81);
  assert.ok(res.spreadPct < 0.5);
  assert.equal(res.usd, res.local);              // le pool on-chain est la source
});

test("a pair whose tokens are not the expected addresses is refused outright", async () => {
  await assert.rejects(
    fetchEthUsd(async (url) =>
      ok(String(url).includes("coingecko")
        ? { ethereum: { usd: 1883.81 } }
        : ethPair({ baseToken: { address: "0x63575aA902DE35ef2dc3a3D32355233bbb44CDa7", symbol: "USDG" } })),
    ),
    /unexpected token/i,
  );
});

test("a depegged USDG invalidates the whole conversion", async () => {
  await assert.rejects(
    fetchEthUsd(async (url) =>
      ok(String(url).includes("coingecko") ? { ethereum: { usd: 1883.81 } } : ethPair({ priceUsd: "1.053" })),
    ),
    /depeg/i,
  );
});

test("coingecko being unreachable does not take the pool price down with it", async () => {
  const res = await fetchEthUsd(async (url) => {
    if (String(url).includes("coingecko")) throw new Error("network down");
    return ok(ethPair());
  });
  assert.ok(res.local > 1800);
  assert.equal(res.coingecko, null);
  assert.equal(res.spreadPct, null);
});

// DexScreener cote les actions tokenisées. Un jeton sans paire garde sa
// quantité et reste hors des totaux : un prix inventé ferait plus de dégâts.
test("a stock is priced on its deepest pair, not on the thinnest", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ pairs: [
    { priceUsd: "999", liquidity: { usd: 12 } },
    { priceUsd: "217.66", liquidity: { usd: 400000 } },
  ] }) });
  const p = await fetchStockPrices([{ address: "0x1", symbol: "NVDA" }], fetchImpl);
  assert.equal(p.get("NVDA"), 217.66);
});

test("a stock nobody quotes gets no price rather than a wrong one", async () => {
  const none = await fetchStockPrices([{ address: "0x1", symbol: "X" }], async () => ({ ok: true, json: async () => ({ pairs: [] }) }));
  assert.equal(none.has("X"), false);
  const down = await fetchStockPrices([{ address: "0x1", symbol: "X" }], async () => { throw new Error("offline"); });
  assert.equal(down.size, 0);
});

// DexScreener a retourné la paire un matin : base et quote ont changé de place
// sans prévenir, et le garde par adresse a refusé la vraie paire pendant que le
// site ne servait plus rien. Les deux jetons comptent, leur ordre non.
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const pairOf = (b, q, priceNative, priceUsd) => async () => ({
  ok: true, json: async () => ({ pairs: [{ baseToken: { address: b }, quoteToken: { address: q }, priceNative, priceUsd }] }),
});

test("eth is priced with USDG in base, as it always was", async () => {
  const r = await fetchEthUsd(pairOf(USDG, WETH, "0.00025", "1.0"));
  assert.equal(Math.round(r.local), 4000);
});

test("eth is priced just the same when the pair comes back flipped", async () => {
  const r = await fetchEthUsd(pairOf(WETH, USDG, "4000", "4000"));
  assert.equal(Math.round(r.local), 4000);
});

// Le garde reste : le faux USDG doit toujours être écarté, dans les deux sens.
test("a pair holding neither of the pinned tokens is still refused", async () => {
  await assert.rejects(fetchEthUsd(pairOf("0x" + "9".repeat(40), WETH, "1", "1")), /unexpected tokens/);
});

test("a depegged USDG is caught whichever side it sits on", async () => {
  await assert.rejects(fetchEthUsd(pairOf(USDG, WETH, "0.00025", "0.90")), /depeg/);
  await assert.rejects(fetchEthUsd(pairOf(WETH, USDG, "4000", "3600")), /depeg/);
});

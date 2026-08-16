import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPrinter, fetchEthUsd } from "../src/prices.js";
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
    pairs: [{ priceUsd: "0.01260", priceChange: { h24: 598 }, liquidity: { usd: 427948.51 }, fdv: 2165143 }],
  }));
  assert.equal(p.usd, 0.0126);
  assert.equal(p.change24h, 598);
  assert.equal(p.liquidityUsd, 427948.51);
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

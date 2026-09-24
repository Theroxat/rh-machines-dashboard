import { test } from "node:test";
import assert from "node:assert/strict";
import { readUnpaid, unpaidLines, DROP_ABI } from "../src/drops.js";

const E18 = 10n ** 18n;
const DROP = "0x" + "d".repeat(40);
const TOKEN = "0x" + "e".repeat(40);
const ok = (fn, v) => [true, DROP_ABI.encodeFunctionResult(fn, [v])];
const fakeAggregate = (state, left = 0n) => async (calls) => calls.map((c) => {
  if (c.target === TOKEN) return [true, "0x" + left.toString(16).padStart(64, "0")];
  const x = DROP_ABI.parseTransaction({ data: c.callData });
  if (x.name === "roundId") return ok("roundId", 1n);
  const s = state.get(Number(x.args[0]));
  if (!s) return [false, "0x"];
  return x.name === "shareOf" ? ok("shareOf", s.share) : ok("paidThisRound", s.paid);
});

test("only a share recorded and not paid is owed", async () => {
  const state = new Map([
    [5949, { share: 85n * E18 / 1000n, paid: false }],
    [4347, { share: 74n * E18 / 1000n, paid: true }],
    [1, { share: 0n, paid: false }],
  ]);
  const r = await readUnpaid({ aggregate3: fakeAggregate(state), contract: DROP, ids: [5949, 4347, 1, 77], token: TOKEN });
  assert.equal(r.round, 1);
  assert.deepEqual([...r.owed.keys()], [5949]);
  assert.equal(r.left, 0n);
});

test("owed shares are named with the round's token and priced, and say whether they are funded", () => {
  const u = unpaidLines({
    owed: new Map([[5949, 85n * E18 / 1000n]]), round: 1, left: 0n,
    rounds: { 1: { symbol: "NVDA", decimals: 18, date: "2026-09-03" } },
    priceOf: (s) => (s === "NVDA" ? 200 : null),
  });
  assert.deepEqual(u.lines, [{ tokenId: 5949, amount: 0.085, symbol: "NVDA", usd: 17 }]);
  assert.equal(u.date, "2026-09-03");
  assert.equal(u.funded, false);
});

// Le jeton d'un tour n'est exposé par aucune vue : un tour inconnu se dit
// « une part », jamais sous un symbole deviné.
test("an unknown round is reported without guessing its token", () => {
  const u = unpaidLines({ owed: new Map([[1, E18]]), round: 2, left: null, rounds: { 1: {} }, priceOf: () => 1 });
  assert.deepEqual(u.lines, [{ tokenId: 1, amount: null, symbol: null, usd: null }]);
  assert.equal(u.funded, null);
});

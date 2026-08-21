import { test } from "node:test";
import assert from "node:assert/strict";
import { findDeals, dealMessage, dealKey, postToDiscord, MIN_GAP_PCT } from "../src/alert.js";

const CONTRACT = "0x8c71d170fbd94bcba93bb08fc2cfd0e8620cd9ce";
const at = (tokenId, priceEth, over = {}) => ({
  tokenId, priceEth, weight: 100, machine: { desk: "GME" }, holds: null,
  anvilBidEth: null, ...over,
});
const cell = (entries) => ({ floorEth: entries[0]?.priceEth ?? null, listed: entries.length, supply: 100, pelotonEth: null, entries, anvilEntries: [] });
const snap = (entries, over = {}) => ({
  eth: { usd: 2000 },
  rows: [{ classValue: 200, classLabel: "x2", inked: cell(entries), dormant: cell([]) }],
  ...over,
});

// Une annonce très en dessous de la suivante de sa propre case est une erreur
// de prix, pas un marché. C'est la seule chose qui sortait vraiment du lot.
test("a listing far below the next one in its cell is a deal", () => {
  const deals = findDeals(snap([at(1, 0.05), at(2, 0.15)]));
  assert.equal(deals.length, 1);
  assert.equal(deals[0].kind, "gap");
  assert.equal(deals[0].tokenId, 1);
  assert.equal(deals[0].gapUsd, 200);
  assert.equal(deals[0].gapPct.toFixed(4), "0.6667");
});

// Le seuil a été calibré sur le carnet réel : un écart ordinaire ne doit rien
// déclencher, sinon l'alerte cesse d'être lue.
test("an ordinary gap between the first two says nothing", () => {
  assert.deepEqual(findDeals(snap([at(1, 0.14), at(2, 0.15)])), []);
});

// 40% d'une machine à $20 ne vaut pas un message.
test("a wide gap on a cheap machine is not worth waking anyone", () => {
  assert.deepEqual(findDeals(snap([at(1, 0.005), at(2, 0.015)])), []);
});

test("a cell with a single listing has nothing to compare against", () => {
  assert.deepEqual(findDeals(snap([at(1, 0.01)])), []);
});

// Acheter, retirer le contenu, revendre à l'anvil. Le maximum observé le jour
// du calibrage était 54% : le seuil est au-dessus, exprès.
test("a margin over the anvil's bid and the stock inside is a deal", () => {
  const deals = findDeals(snap([at(1, 0.05, { anvilBidEth: 0.08, holds: { usd: 20 } })]));
  assert.equal(deals.length, 1);
  assert.equal(deals[0].kind, "margin");
  assert.equal(deals[0].marginUsd, 80);          // 160 + 20 − 100
  assert.equal(deals[0].marginPct.toFixed(2), "0.80");
});

test("the margins the book is full of stay quiet", () => {
  // +54%, ce que le carnet offrait partout le jour du calibrage
  assert.deepEqual(findDeals(snap([at(1, 0.05, { anvilBidEth: 0.077 })])), []);
});

test("without an eth rate nothing is called a deal", () => {
  assert.deepEqual(findDeals(snap([at(1, 0.05), at(2, 0.15)], { eth: {} })), []);
});

test("the biggest deal comes first, so one line is enough to read", () => {
  const deals = findDeals(snap([
    at(1, 0.05, { anvilBidEth: 0.09 }),
    at(2, 0.30),
  ]));
  assert.ok(deals.length >= 2);
  assert.ok((deals[0].gapUsd ?? deals[0].marginUsd) >= (deals[1].gapUsd ?? deals[1].marginUsd));
});

// Une annonce qui reste en place des heures ne doit sonner qu'une fois. Mais
// si son prix change, c'est une autre affaire.
test("the same listing at the same price is the same deal", () => {
  const a = { kind: "gap", tokenId: 7, priceEth: 0.05 };
  assert.equal(dealKey(a), dealKey({ ...a }));
  assert.notEqual(dealKey(a), dealKey({ ...a, priceEth: 0.04 }));
  assert.notEqual(dealKey(a), dealKey({ ...a, kind: "margin" }));
});

test("the message says what it is before asking anyone to open a link", () => {
  const [gap] = findDeals(snap([at(1, 0.05), at(2, 0.15)]));
  const msg = dealMessage(gap, CONTRACT);
  assert.match(msg, /#1/);
  assert.match(msg, /x2/);
  assert.match(msg, /\$100/);
  assert.match(msg, /\$300/);
  assert.match(msg, /67% below/);
  assert.match(msg, new RegExp(`${CONTRACT}/1`));
});

test("a margin message names what you would be paid in", () => {
  const [d] = findDeals(snap([at(1, 0.05, { anvilBidEth: 0.08, holds: { usd: 20 } })]));
  const msg = dealMessage(d, CONTRACT);
  assert.match(msg, /Anvil bids \$160/);
  assert.match(msg, /\$20 of stock inside/);
  assert.match(msg, /paid in \$PRINTER/);
});

// Un webhook injoignable est un message perdu, pas un balayage perdu.
test("a webhook that fails loses the message and nothing else", async () => {
  assert.equal(await postToDiscord("https://x", "hi", async () => { throw new Error("down"); }), false);
  assert.equal(await postToDiscord("", "hi"), false);
  assert.equal(await postToDiscord("https://x", "hi", async () => ({ ok: false, status: 500 })), false);
  assert.equal(await postToDiscord("https://x", "hi", async () => ({ ok: true, status: 200 })), true);
});

test("nobody gets pinged by a machine's name", async () => {
  let body;
  await postToDiscord("https://x", "@everyone look", async (u, o) => { body = JSON.parse(o.body); return { ok: true }; });
  assert.deepEqual(body.allowed_mentions, { parse: [] });
});

test("the gap threshold is a real bar, not a formality", () => {
  assert.ok(MIN_GAP_PCT >= 0.3, "un seuil trop bas rend l'alerte illisible");
});

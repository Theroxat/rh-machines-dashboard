import { test } from "node:test";
import assert from "node:assert/strict";
import { findDeals, dealEmbed, dealMessage, dealKey, postToDiscord, MIN_GAP_PCT, MAX_PER_SWEEP } from "../src/alert.js";

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

// Un seuil absolu mesurait l'état du $PRINTER, pas une affaire : quarante-deux
// annonces le dépassaient trois heures après l'avoir posé. Ce qui sort du lot
// ne se mesure que contre le reste du carnet.
test("a margin the whole book shares is not an exception", () => {
  const commun = [
    at(1, 0.05, { anvilBidEth: 0.09 }),   // +80%
    at(2, 0.05, { anvilBidEth: 0.089 }),  // +78%
    at(3, 0.05, { anvilBidEth: 0.088 }),  // +76%
  ];
  assert.deepEqual(findDeals(snap(commun)).filter((x) => x.kind === "margin"), []);
});

test("a margin that clearly leads the rest is one", () => {
  const deals = findDeals(snap([
    at(1, 0.05, { anvilBidEth: 0.12 }),   // +140%
    at(2, 0.05, { anvilBidEth: 0.089 }),  // +78%
    at(3, 0.05, { anvilBidEth: 0.088 }),
  ])).filter((x) => x.kind === "margin");
  assert.equal(deals.length, 1);
  assert.equal(deals[0].tokenId, 1);
  assert.ok(deals[0].leadPct > 0.5);
});

// « La moins mauvaise d'un carnet médiocre » ne sonne pas non plus.
test("the best of a poor book is still not a deal", () => {
  assert.deepEqual(findDeals(snap([
    at(1, 0.05, { anvilBidEth: 0.06 }),   // +20%, seule
  ])).filter((x) => x.kind === "margin"), []);
});

// Le prix brut faisait de « 0.052 » et « 0.0519999998 » deux affaires
// distinctes, et la même machine a sonné quatre-vingt-quatorze fois.
test("floating point noise in a price is not a new deal", () => {
  const a = { kind: "margin", tokenId: 6622, priceEth: 0.052 };
  const b = { kind: "margin", tokenId: 6622, priceEth: 0.0519999998 };
  assert.equal(dealKey(a), dealKey(b));
});

// Au-delà de trois, ce n'est plus une alerte, c'est un flux.
test("a sweep never sends more than a handful", () => {
  const many = Array.from({ length: 40 }, (_, i) => at(i + 1, 0.001 + i / 1000));
  assert.ok(findDeals(snap(many)).length <= MAX_PER_SWEEP);
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

// Le message arrive sur un téléphone, loin du tableau. Une ligne obligeait à
// ouvrir le lien pour savoir si l'affaire valait quelque chose.
const rich = (over = {}) => findDeals({
  eth: { usd: 2000 },
  pot: { usd: 100000, fleetWeight: 1000000 },
  ink: { activationTotalUsd: 50 },
  rows: [{ classValue: 200, classLabel: "x2", dormant: cell([]), inked: cell([
    at(1, 0.05, { weight: 400, inkMult: 2, inkPrinter: 17000, epochUsd: 40,
      holds: { usd: 12.5, lines: [] }, anvilBidEth: 0.06,
      machine: { desk: "GME", sector: "utilities", ticker: "GME", headwear: "Halo", image: "https://img/1.webp" }, ...over }),
    at(2, 0.15),
  ]) }],
})[0];

test("the card carries what the machine is, without opening the link", () => {
  const e = dealEmbed(rich(), CONTRACT);
  assert.match(e.title, /Machine #1 — x2 → 4x/);
  assert.equal(e.url, `https://opensea.io/assets/robinhood/${CONTRACT}/1`);
  assert.equal(e.thumbnail.url, "https://img/1.webp");
  const by = Object.fromEntries(e.fields.map((f) => [f.name, f.value]));
  assert.equal(by.Weight, "4x (born x2)");
  assert.equal(by["Ink burned"], "17,000 $PRINTER");
  assert.equal(by.Desk, "GME");
  assert.equal(by["Takes from the pot"], "$40.00");
  assert.equal(by["Stock inside"], "$12.50");
  assert.equal(by["Anvil bids"], "$120");
  assert.equal(by.Headwear, "Halo");
});

test("a machine holding nothing says nothing rather than nothing-dollars", () => {
  const by = Object.fromEntries(dealEmbed(rich({ holds: null }), CONTRACT).fields.map((f) => [f.name, f.value]));
  assert.equal(by["Stock inside"], "nothing");
});

test("a desk left off this epoch's ballot is marked as such", () => {
  const by = Object.fromEntries(dealEmbed(rich({
    machine: { desk: "CRCL", sector: "tech", ticker: null, headwear: "Halo" } }), CONTRACT).fields.map((f) => [f.name, f.value]));
  assert.equal(by.Desk, "CRCL (off ballot)");
});

test("the card says why it was sent, in its own first line", () => {
  assert.match(dealEmbed(rich(), CONTRACT).description, /the next one in its cell asks/);
  assert.match(dealEmbed(rich(), CONTRACT).footer.text, /well under its own cell/);
});

// Si Discord refuse la fiche, un message dégradé vaut mieux qu'un silence.
test("a card and a plain line are both accepted by the poster", async () => {
  let sent;
  const spy = async (u, o) => { sent = JSON.parse(o.body); return { ok: true }; };
  await postToDiscord("https://x", dealEmbed(rich(), CONTRACT), spy);
  assert.equal(sent.embeds.length, 1);
  assert.equal(sent.content, undefined);
  await postToDiscord("https://x", "plain", spy);
  assert.equal(sent.content, "plain");
  assert.equal(sent.embeds, undefined);
});

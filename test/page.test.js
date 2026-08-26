import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  heroHtml, statsHtml, cardHtml, chipsHtml, pickMachines, mineHtml,
  stepsHtml, voteHtml, scarcityHtml, padHtml, sourcesHtml, bannerMessage,
  setContract, itemUrl, esc, ADDRESS_RE, SORTS,
} from "../src/public/app.js";

const page = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
const css = page.slice(page.indexOf("<style>"), page.indexOf("</style>"));

const entry = (over = {}) => ({
  tokenId: 9769, priceEth: 0.087, machine: { image: "https://i2c.seadn.io/x.webp" },
  weight: 100, epochUsd: 2.01, holds: { usd: 15.6 }, inkMult: 1, ...over,
});
const DATA = {
  eth: { usd: 2460 },
  pot: { usd: 32000, fleetWeight: 1500000 },
  ink: { activationTotalUsd: 151 },
  totals: { inked: 7504, dormant: 2496 },
  book: { listed: 660 },
  protocol: { epoch: 4 },
  rows: [
    { classValue: 100, classLabel: "x1",
      inked:   { floorEth: 0.072, listed: 400, entries: [entry()] },
      // Une dormante se vend moins cher qu'une allumée : elle ne rapporte rien
      // tant que personne n'a brûlé pour elle.
      dormant: { floorEth: 0.070, listed: 200, entries: [entry({ tokenId: 8630, priceEth: 0.070, epochUsd: 0, weight: 0, holds: null })] } },
    { classValue: 400, classLabel: "x4",
      inked:   { floorEth: 0.26, listed: 40, entries: [entry({ tokenId: 7866, priceEth: 0.26, weight: 800, epochUsd: 14.4, inkMult: 2 })] },
      dormant: { floorEth: 0.20, listed: 4, entries: [] } },
  ],
};

/* ── la seule règle de couleur ─────────────────────────────────────────────
   Le lime ne dit qu'une chose : cette machine imprime. L'employer pour l'état
   d'un bouton lui volerait exactement ce qui lui donne du sens, et la page
   redeviendrait un arc-en-ciel qu'il faut apprendre à lire. */
test("green marks a Machine that prints, and a dormant card carries none", () => {
  const lit = cardHtml({ ...entry(), lit: true, classLabel: "x1", priceUsd: 214 });
  const off = cardHtml({ ...entry({ epochUsd: 0, weight: 0 }), lit: false, classLabel: "x1", priceUsd: 177 }, { light: 151 });
  assert.match(lit, /class="card-earn">\$2\.01 a drop</);
  assert.match(off, /class="card-earn off">\$151 to switch on</);
  assert.doesNotMatch(off, /card-earn"/);
});

test("nothing but an earning Machine wears the live colour", () => {
  // Un jeton de couleur employé ailleurs que là où il classe quelque chose
  // rendrait la règle illisible. Le rose marque ce sur quoi on agit, le jaune
  // ce qu'il faut payer, le bleu l'état du parc — chacun une seule fois.
  const uses = [...css.matchAll(/([^\n{]*)\{[^}]*var\(--lime\)[^}]*\}/g)].map((m) => m[1].trim());
  for (const u of uses) {
    assert.match(u, /card-earn|st-live|\.bar\b|vt:first-child/,
      `--lime employé hors de son rôle : ${u}`);
  }
});

/* ── contraste, mesuré et non jugé ────────────────────────────────────────
   Les montants et les mentions étaient sous le seuil du petit texte : ils
   devenaient illisibles plutôt que discrets. Rien d'autre ne l'attrape. */
test("every ink density clears the contrast threshold on paper", () => {
  const value = (name) => {
    const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `${name} n'est pas défini`);
    return m[1];
  };
  const lum = (hex) => {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const paper = lum(value("--paper"));
  for (const name of ["--ink", "--ink-2", "--ink-3"]) {
    const l = lum(value(name));
    const ratio = (Math.max(l, paper) + 0.05) / (Math.min(l, paper) + 0.05);
    assert.ok(ratio >= 4.5, `${name} est à ${ratio.toFixed(2)}:1, sous les 4.5:1 du petit texte`);
  }
});

/* ── l'ouverture ─────────────────────────────────────────────────────────── */
test("the page opens on a sentence, not on a wall of figures", () => {
  const html = heroHtml(DATA);
  assert.match(html, /Nobody has been paid <mark>yet<\/mark>/);
  assert.match(html, /\$32k is sitting in the pot/);
});

test("with nothing read the page says so rather than showing zeros", () => {
  assert.match(heroHtml({}), /Reading the chain/);
  assert.match(bannerMessage({}), /Warming up/);
  assert.match(bannerMessage({ data: {}, at: Date.now() - 600000, staleAfterMs: 180000 }), /10 minutes old/);
  assert.equal(bannerMessage({ data: {}, at: Date.now() }), "");
});

test("four figures, and each carries the colour of what it classifies", () => {
  const html = statsHtml(DATA);
  assert.match(html, /st-live"><b>7,504<\/b><u>printing now/);
  assert.match(html, /st-pot"><b>\$32k<\/b><u>in the pot/);
  assert.match(html, /st-cost"><b>\$151<\/b><u>to switch one on/);
  assert.match(html, /st-book"><b>\$177<\/b><u>cheapest way in/);
});

/* ── le classement ───────────────────────────────────────────────────────── */
test("machines are ranked by what they give back per dollar spent", () => {
  const picked = pickMachines(DATA, { sort: "back" });
  assert.equal(picked[0].tokenId, 9769);
  assert.ok(picked[0].ratio > picked[picked.length - 1].ratio);
});

// Une dormante rend zéro : classée par retour elle tombe toujours en dernier,
// et l'entrée la moins chère du carnet devient inatteignable.
test("sorting by price is what makes a dormant Machine reachable at all", () => {
  const back = pickMachines(DATA, { sort: "back" });
  const cheap = pickMachines(DATA, { sort: "cheap" });
  assert.equal(back[back.length - 1].lit, false, "classée par retour, une dormante finit dernière");
  assert.equal(cheap[0].lit, false, "classée par prix, elle passe devant");
  assert.deepEqual(SORTS.map((s) => s.key), ["back", "cheap"]);
});

// À prix égal l'allumée est le meilleur achat : elle rapporte, l'autre non.
test("at the same asking price, the one that earns comes first", () => {
  const same = { ...DATA, rows: [{ classValue: 100, classLabel: "x1",
    inked:   { entries: [entry({ tokenId: 1, priceEth: 0.1 })] },
    dormant: { entries: [entry({ tokenId: 2, priceEth: 0.1, epochUsd: 0, weight: 0, holds: null })] } }] };
  assert.equal(pickMachines(same, { sort: "cheap" })[0].tokenId, 1);
});

// Le coût d'une dormante inclut son allumage, sans quoi elle passerait devant
// à prix égal en ne rapportant rien.
test("a dormant Machine carries the price of lighting it in its cost", () => {
  const d = pickMachines(DATA, { sort: "back" }).find((m) => !m.lit);
  assert.equal(Math.round(d.cost), Math.round(d.priceUsd + 151));
});

test("a class filter narrows the book, and the chips say which one is on", () => {
  assert.ok(pickMachines(DATA, { klass: "x4" }).every((m) => m.classLabel === "x4"));
  const chips = chipsHtml(DATA, "x4", "cheap");
  assert.match(chips, /data-k="x4" aria-pressed="true"/);
  assert.match(chips, /data-k="" aria-pressed="false"/);
  assert.match(chips, /data-s="cheap" aria-pressed="true"/);
});

/* ── une carte ───────────────────────────────────────────────────────────── */
test("a card carries what it costs, what it returns and what it is holding", () => {
  const html = cardHtml({ ...entry(), lit: true, classLabel: "x1", priceUsd: 214 });
  assert.match(html, /class="card-price">\$214<small>0\.0870 ETH/);
  assert.match(html, /carrying \$15\.60 of stock/);
  assert.match(html, /href="https:\/\/opensea\.io\/assets\/robinhood\//);
});

// Une machine re-encrée pèse plus que sa classe ne le dit. C'est la seule
// anomalie utile du carnet : une x4 qui pèse comme une x8.
test("a re-inked Machine is marked as one", () => {
  const html = cardHtml({ ...entry({ inkMult: 2, weight: 800 }), lit: true, classLabel: "x4", priceUsd: 640 });
  assert.match(html, /<span class="re">re-inked<\/span>/);
});

test("the links follow the contract the service serves", () => {
  setContract("0x8C71D170fBd94BCba93bB08FC2CFD0e8620cD9cE");
  assert.match(itemUrl(1), /0x8c71d170fbd94bcba93bb08fc2cfd0e8620cd9ce\/1$/);
});

/* ── le portefeuille ─────────────────────────────────────────────────────── */
const WALLET = {
  address: "0xE908ba570259E4bB1e1fDd2EDd9B15E092B13211",
  machines: [
    { tokenId: 463, weight: 100, desk: "utilities", epochUsd: 1.7, holds: { usd: 12.3 }, image: "https://i2c.seadn.io/a.webp" },
    { tokenId: 8630, weight: 0, desk: "health", epochUsd: 0, holds: null, image: null },
  ],
  cutUsd: 3.4, advice: { best: { ticker: "SPCX" } },
  worth: { total: 400, machinesUsd: 380, insideUsd: 12.3, printerUsd: 7.7,
    lines: [{ tokenId: 463, machineUsd: 214 }, { tokenId: 8630, machineUsd: 166 }] },
};

test("a wallet leads with what it is all worth, and says what that means", () => {
  const html = mineHtml(WALLET, { light: 151 });
  assert.match(html, /<b>\$400<\/b><u>all of it, together/);
  assert.match(html, /<b>1<\/b><u>of yours printing/);
  // Un floor est un prix demandé, pas un prix obtenu. Le total a l'air d'un
  // solde bancaire et n'en est pas un.
  assert.match(html, /what others are asking, not what you would be paid/);
});

test("an address that is not one is refused before the network is touched", () => {
  assert.ok(ADDRESS_RE.test(WALLET.address));
  assert.ok(!ADDRESS_RE.test("0x123"));
  assert.ok(!ADDRESS_RE.test("nonsense"));
  assert.match(mineHtml({ error: "That is not an address" }), /not an address/);
  assert.match(mineHtml({ pending: true }), /Reading the chain/);
  assert.match(mineHtml({ machines: [] }), /holds no Machine/);
});

/* ── comprendre ──────────────────────────────────────────────────────────── */
test("how it works is five steps, in the order they happen to a Machine", () => {
  const html = stepsHtml(DATA);
  assert.equal((html.match(/class="step-n"/g) ?? []).length, 5);
  assert.match(html, /You buy a Machine/);
  assert.match(html, /5,000 \$PRINTER<\/b> — about \$151 today/);
  // Le délai « allumée pendant une epoch » coûte de l'argent à qui l'ignore.
  assert.match(html, /takes no part in the pot already waiting/);
  // Vendre la machine vend ce qu'elle contient : ça ne peut pas être tu.
  assert.match(html, /its contents go with it/);
});

test("the ballot shows what each desk drew, and says when there is none", () => {
  const vote = { opened: true, desks: [
    { index: 0, ticker: "AMD", sector: "semis", share: 0.53, votedWeight: 900 },
    { index: 5, ticker: "GME", sector: "retail", share: 0.15, votedWeight: 250 },
  ] };
  const html = voteHtml(vote, 4);
  assert.match(html, /AMD<\/span><u>53\.0%/);
  assert.match(voteHtml({ opened: false }, 4), /No ballot has opened for epoch 4/);
  assert.match(voteHtml(null), /could not be read/);
  assert.match(voteHtml({ opened: true, desks: [] }), /not one Machine has voted/);
});

/* ── ce qui quitte la circulation ────────────────────────────────────────── */
const SC = {
  vault: { held: 178, awake: 6, dormant: 172, total: 10000, share: 0.0178, circulating: 9822 },
  burn: { minted: 200000000, supply: 155814801, burnedShare: 0.2209, ink: 43285199, other: 900000, proton: 425000 },
  proton: { released: 0 },
  odds: { done: 76, failRate: 0.289, claimedFailRate: 0.2, expected: 15.2, oneIn: 25 },
};

// La distinction porte toute la section : un jeton brûlé est détruit, une
// machine au coffre peut revenir demain. Les confondre change ce qu'un floor
// veut dire.
test("a Machine in the vault is never called burned", () => {
  const html = scarcityHtml(SC);
  assert.match(html, /It is <b>not burned<\/b> — the collection is still ten thousand strong/);
  assert.match(html, /Locked is not burned, and this page will not call it that/);
  assert.match(html, /owned by a single key, not a multi-signature wallet/);
  assert.match(html, /Nothing has ever come back out so far/);
});

test("a Machine taken back out of the vault is reported", () => {
  assert.match(scarcityHtml({ ...SC, proton: { released: 3 } }), /3 have come back out/);
});

// Publier le compte d'échecs seul accuse ; le taire cache. Les deux, donc.
test("the observed failure rate comes with the odds it is merely chance", () => {
  const html = scarcityHtml(SC);
  assert.match(html, /claims <b>80\.0%<\/b> success/);
  assert.match(html, /<b>28\.9%<\/b> of 76 rolls have failed/);
  assert.match(html, /once in 25\. Worth watching, not yet worth believing/);
});

test("with too few rolls read, no rate is presented", () => {
  assert.doesNotMatch(scarcityHtml({ ...SC, odds: null }), /have failed/);
});

test("with nothing read the section says so rather than showing an empty vault", () => {
  assert.match(scarcityHtml(null), /Not read yet/);
});

/* ── le memepad ──────────────────────────────────────────────────────────── */
test("the pad states what was launched and what nobody ever bought", () => {
  const html = padHtml({ launched: 326, graduated: 4, untouched: 174, lockedUsd: 12500,
    vol24hUsd: 92000, coins: [] });
  assert.match(html, /<b>326<\/b><u>coins launched/);
  assert.match(html, /<b>174<\/b><u>never bought/);
  assert.match(html, /<b>1% of every trade<\/b> buys back and burns/);
  // Leur propre tableau annonce zéro volume dans le même document que vingt-cinq
  // échanges horodatés : on lit les factories, pas le tableau.
  assert.match(html, /Read from the two factories, not from the pad's own board/);
});

/* ── la provenance ───────────────────────────────────────────────────────── */
test("the page says out loud that its own subject is not read from the chain", () => {
  const SOURCES = [
    { what: "Weight and ink of every Machine", kind: "chain", from: "MINE contract" },
    { what: "Every asking price on this site", kind: "api", from: "OpenSea" },
    { what: "Price per weight point", kind: "derived", from: "asking price and weight" },
  ];
  const KINDS = {
    chain: { label: "read from the chain", blurb: "anyone can repeat the read" },
    api: { label: "served by a third party", blurb: "trusted, not verifiable here" },
    derived: { label: "computed here", blurb: "our arithmetic, and so where our mistakes live" },
  };
  const html = sourcesHtml(SOURCES, KINDS);
  assert.match(html, /Every asking price on this site/);
  assert.match(html, /served by a third party/);
  assert.match(html, /A price in dollars cannot come from the chain/);
  assert.match(html, /Those are limits, not shortcuts/);
});

/* ── ce qui vient du réseau ──────────────────────────────────────────────── */
test("nothing from the network reaches the page unescaped", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  assert.doesNotMatch(esc(evil), /<img/);
  const html = cardHtml({ ...entry({ machine: { image: evil } }), lit: true, classLabel: evil, priceUsd: 1 });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.doesNotMatch(mineHtml({ error: evil }), /<img src=x/);
});

/* ── la page elle-même ───────────────────────────────────────────────────── */
test("three tabs, and the old six-tab links still land somewhere", () => {
  assert.match(page, /data-tab="buy">Buy</);
  assert.match(page, /data-tab="mine">Mine</);
  assert.match(page, /data-tab="learn">Learn</);
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  for (const old of ["market", "wallet", "vote", "pad", "scarcity", "how", "protocol"]) {
    assert.match(app, new RegExp(`${old}: "(buy|mine|learn)"`), `#${old} ne mène nulle part`);
  }
});

// Le mot vit dans le titre et dans les balises de partage : un lien envoyé sur
// Discord l'affiche avant que qui que ce soit n'ouvre la page.
test("the page says it is unofficial before anyone opens it", () => {
  assert.match(page, /<title>Unofficial/);
  assert.match(page, /og:title" content="Unofficial/);
  assert.match(page, /class="tag">Unofficial</);
  const head = page.indexOf('class="tag">Unofficial');
  assert.ok(head < page.indexOf('id="pane-buy"'), "la mention doit précéder les chiffres");
});

test("every section the site carries has somewhere to be drawn", () => {
  for (const id of ["hero", "stats", "chips", "cards", "mine-out",
                    "learn-steps", "vote", "scarcity", "pad", "sources"]) {
    assert.match(page, new RegExp(`id="${id}"`), `#${id} manque à la page`);
  }
});

// Une ombre portée dure qui glisse au survol suffit. Qui refuse le mouvement ne
// doit perdre aucune information.
test("motion is optional, and refusing it costs nothing", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  const block = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(block, /transform: none/);
});

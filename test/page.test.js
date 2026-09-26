import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  heroHtml, statsHtml, cardHtml, chipsHtml, floorsHtml, detailHtml, bestPick, pickMachines, walletHtml,
  stepsHtml, voteHtml, scarcityHtml, padHtml, sourcesHtml, bannerMessage, potNote,
  setContract, itemUrl, esc, ADDRESS_RE, SORTS, STATES, fmtBig, ANVIL_URL, ritualHtml, DARK_LABEL, darkCountHtml, darkGalleryHtml, dormantOnSale, unpaidHtml, nextGate,
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
  collection: { machines: 10000 },
  burn: { minted: 200000000, supply: 155000000, burned: 45000000, share: 0.225, ink: 43285199 },
  fleet: { minted: 10000, vault: 255, dead: 1, circulating: 9744, share: 0.0256 },
  protocol: { epoch: 4 },
  rows: [
    { classValue: 100, classLabel: "x1",
      inked:   { floorEth: 0.072, listed: 400, entries: [entry()] },
      // Une dormante se vend moins cher qu'une allumée : elle ne rapporte rien
      // tant que personne n'a brûlé pour elle.
      dormant: { floorEth: 0.070, listed: 200, entries: [entry({ tokenId: 8630, priceEth: 0.070, epochUsd: 0, weight: 0, holds: null })] } },
    { classValue: 200, classLabel: "x2",
      // Le rayon de l'anvil : achetable, libellé en $PRINTER, et absent
      // d'OpenSea. Il ne figurait nulle part sur la page.
      inked: { floorEth: 0.09, listed: 5, entries: [],
        anvilEntries: [{ tokenId: 584, askPrinter: 9113.6, askUsd: 174, askEth: 0.0699,
          weight: 200, inkMult: 1, epochUsd: 5.2, machine: { image: "https://i2c.seadn.io/a.webp" } }] },
      dormant: { floorEth: 0.08, listed: 2, entries: [],
        anvilEntries: [{ tokenId: 2461, askPrinter: 9113.6, askUsd: 174, askEth: 0.0699,
          weight: 0, inkMult: 1, epochUsd: 0, machine: null }] } },
    { classValue: 400, classLabel: "x4",
      inked:   { floorEth: 0.26, listed: 40, entries: [entry({ tokenId: 7866, priceEth: 0.26, weight: 800, epochUsd: 14.4, inkMult: 2 })] },
      dormant: { floorEth: 0.20, listed: 4, entries: [] } },
  ],
};

const OFFICIAL = {
  potUsd: 63496, lockedUsd: 18805, buildingUsd: 44690,
  distributedUsd: 189350, check: { swapperUsdg: 38686, potUsd: 63496, ratio: 0.61, disagrees: false },
};

/* ── la seule règle de couleur ─────────────────────────────────────────────
   Le lime ne dit qu'une chose : cette machine imprime. L'employer pour l'état
   d'un bouton lui volerait exactement ce qui lui donne du sens, et la page
   redeviendrait un arc-en-ciel qu'il faut apprendre à lire. */
// L'état se lit sur l'image, avant le prix. En bas de carte, sous deux lignes
// de chiffres, il fallait scruter quatre vignettes pour savoir laquelle
// travaille.
test("a card says on its face whether the Machine is printing", () => {
  const lit = cardHtml({ ...entry(), lit: true, classLabel: "x1", priceUsd: 214 });
  const off = cardHtml({ ...entry({ epochUsd: 0, weight: 0 }), lit: false, classLabel: "x1", priceUsd: 177 });
  assert.match(lit, /class="card-state">Printing</);
  assert.match(off, /class="card-state off">Dormant</);
  // Sur l'image, pas sous les chiffres.
  assert.ok(lit.indexOf("card-state") < lit.indexOf("card-price"));
  // Et la même règle de couleur qu'ailleurs : le lime ne dit que « ça imprime ».
  assert.match(css, /\.card-state \{[^}]*var\(--lime\)/);
  assert.match(css, /\.card-state\.off \{[^}]*var\(--paper\)/);
});

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
    assert.match(u, /card-earn|card-state|pick-back|st-live|\.bar\b|vt:first-child/,
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
/* ── l'ouverture ───────────────────────────────────────────────────────────
   Le titre porte ce qui ne bouge pas — dix mille machines — et ce qui ne
   remonte jamais : la part du jeton déjà détruite. */
test("the page opens on the fleet and on what has been burned for good", () => {
  const html = heroHtml(DATA);
  // Le nombre qui compte n'est pas celui qui a été frappé, c'est celui qu'on
  // peut encore acheter : le coffre du Proton en avale une à chaque fusion.
  assert.match(html, /<mark class="stamp">9,744<\/mark> Machines still out there\. <mark>22\.5%<\/mark> of the \$PRINTER already burned/);
  assert.match(html, /45,000,000 of the 200,000,000 ever minted are gone for good/);
  assert.match(html, /43,285,199 of it as ink/);
  assert.match(html, /there is no way to mint more/);
});

// « 10,000 Machines, and 22.5% of the $PRINTER already burned » se lit aussi
// comme dix mille machines brûlées. Il n'en existe aucune : `totalSupply` n'a
// jamais bougé, et la page doit le dire au lieu de laisser le doute.
test("the headline cannot be read as ten thousand Machines burned", () => {
  const html = heroHtml(DATA);
  // Le point sépare les deux affirmations ; une virgule les enchaînait.
  assert.match(html, /out there\. <mark>/);
  assert.doesNotMatch(html, /Machines, and <mark>/);
  assert.match(html, /10,000 were minted:/);
});

/* ── hors circulation n'est pas détruite ───────────────────────────────────
   Le coffre du Proton a un propriétaire qui peut ressortir ce qu'il garde ;
   l'adresse morte, non. La page compte les deux séparément plutôt que de les
   fondre dans une perte, parce que la différence décide de ce qu'un floor
   veut dire. */
test("machines out of circulation are counted apart from machines destroyed", () => {
  const html = heroHtml(DATA);
  assert.match(html, /10,000 were minted: 1 went to a dead address, where nothing comes back/);
  assert.match(html, /255 sit in the Proton's vault, which can send them back out/);
});

test("with nothing in the vault the page says the whole fleet is still out there", () => {
  const html = heroHtml({ ...DATA, fleet: { minted: 10000, vault: 0, dead: 0, circulating: 10000, share: 0 } });
  assert.match(html, /All 10,000 ever minted are still in circulation/);
  assert.doesNotMatch(html, /vault/);
});

// Sans la lecture, on annonce ce qui a été frappé — c'est vrai — plutôt qu'un
// « en circulation » qu'on n'a pas mesuré.
test("with no vault reading, the minted count is used and nothing is claimed about it", () => {
  const html = heroHtml({ ...DATA, fleet: null, collection: { machines: 10000 } });
  assert.match(html, /<mark class="stamp">10,000<\/mark> Machines\. <mark>/);
  assert.doesNotMatch(html, /still out there/);
  assert.doesNotMatch(html, /vault/);
});

/* Le titre porte deux faits, et ils ne se mettent pas en évidence pareil.
   Le jaune dit ce qu'on paie — ici l'encre brûlée ; le parc n'est pas un coût.
   Deux fois la même couleur dans une phrase ne met rien en évidence. */
test("the two facts in the headline are marked apart, not twice the same", () => {
  const html = heroHtml(DATA);
  assert.match(html, /<mark class="stamp">9,744<\/mark>/);
  assert.match(html, /<mark>22\.5%<\/mark>/);
  assert.match(css, /\.hero h2 mark\.stamp \{[^}]*background: var\(--ink\)/);
  assert.match(css, /\.hero h2 mark\.stamp \{[^}]*color: var\(--paper\)/);
  // Le jaune reste ce qu'on paie : le parc ne doit pas le porter.
  assert.doesNotMatch(css, /\.hero h2 mark\.stamp \{[^}]*var\(--sun\)/);
});

/* Le fond d'un mark en ligne se peint sur la boîte de la fonte, pas sur celle
   de la ligne : à 0,94 d'interlignage il débordait de vingt pixels sur la
   ligne du dessus. En bloc en ligne, le fond suit la hauteur donnée. */
test("the highlight box is contained by the line it belongs to", () => {
  const rule = css.match(/\.hero h2 mark \{[^}]*\}/)[0];
  assert.match(rule, /display: inline-block/);
  const lh = Number(rule.match(/line-height: ([\d.]+)/)[1]);
  const h2 = Number(css.match(/\.hero h2 \{[^}]*line-height: ([\d.]+)/)[1]);
  const pad = [...rule.matchAll(/padding: ([\d.]+)em [^;]*? ([\d.]+)em/g)][0];
  const total = lh + Number(pad[1]) + Number(pad[2]);
  assert.ok(total <= h2, `la boîte fait ${total}em pour une ligne de ${h2}em`);
});

test("with no supply read it still says where the missing Machines went", () => {
  assert.match(heroHtml({ ...DATA, burn: null }), /10,000 were minted: 1 went to a dead address/);
});

// Le Meltdown du 2026-09-23 : l'adresse morte, les brûlées encore détenues et
// le coffre sont trois choses, et la phrase les compte une par une.
test("the Meltdown's burned are counted apart from the destroyed and the vaulted", () => {
  const html = heroHtml({ ...DATA,
    fleet: { minted: 10000, vault: 1, dead: 3497, circulating: 6502, share: 0.35 },
    collection: { machines: 2121, burned: 4381 } });
  assert.match(html, /<mark class="stamp">6,502<\/mark> Machines still out there/);
  assert.match(html, /3,497 went to a dead address, where nothing comes back; 4,381 more were marked burned in the Meltdown and still sit in wallets/);
  assert.match(html, /1 sits in the Proton's vault, which can send it back out/);
});

// Une part manquante n'est pas une part nulle : sans l'offre lue on annonce ce
// qu'on sait, et rien de plus.
test("with no supply read, no burn share is invented", () => {
  const html = heroHtml({ ...DATA, burn: null });
  assert.match(html, /<mark class="stamp">9,744<\/mark> Machines still out there, and a \$PRINTER supply that only ever falls/);
  assert.doesNotMatch(html, /[\d.]+%<\/mark>/);
  assert.doesNotMatch(html, /gone for good/);
});

// Le pot vaut zéro le jour où le protocole vient de le dépenser en actions —
// c'est un état normal, pas une absence de lecture. La vitrine le prenait pour
// un premier balayage en cours et effaçait tout : le titre, la meilleure
// affaire, et la grille des planchers qui est rendue à l'intérieur. Un
// instantané complet et juste s'annonçait comme vide.
test("an emptied pot is not an empty dashboard", () => {
  const html = heroHtml({ ...DATA, pot: { usd: 0, fleetWeight: 1638939 } });
  assert.doesNotMatch(html, /Reading the chain/,
    "un pot dépensé n'est pas un balayage en cours");
  assert.match(html, /Machines still out there/, "le titre doit rester");
  assert.match(html, /Cheapest by class/, "la grille des planchers doit rester");
});

test("with nothing read the page says so rather than showing zeros", () => {
  assert.match(heroHtml({}), /Reading the chain/);
  assert.match(bannerMessage({}), /Warming up/);
  assert.match(bannerMessage({ data: {}, at: Date.now() - 600000, staleAfterMs: 180000 }), /10 minutes old/);
  assert.equal(bannerMessage({ data: {}, at: Date.now() }), "");
});

/* ── les chiffres d'état ───────────────────────────────────────────────────
   Ils étaient quatre. Le prix du $PRINTER manquait, alors que c'est lui qui
   décide de ce que coûte un allumage : la case « to switch one on » bougeait
   de trente pour cent en deux jours sans que rien n'explique pourquoi. */
test("five figures on one line, each carrying the colour of what it classifies", () => {
  const html = statsHtml({ ...DATA, printer: { usd: 0.0188, change24h: -24.1, marketCap: 2915894 } });
  assert.match(html, /st-live"><b>7,504<\/b><u>printing now/);
  assert.match(html, /st-pot"><b>\$32k<\/b><u>in the pot/);
  assert.match(html, /st-cost"><b>\$177<\/b><u>cheapest way in/);
  assert.match(html, /st-cost"><b>\$151<\/b><u>to switch one on/);
  assert.match(html, /st-fuel"><b>\$2\.92M<\/b><u>\$PRINTER market/);
  assert.equal((html.match(/class="st /g) ?? []).length, 5);
  // Le marché du jeton ferme la ligne : c'est un contexte, pas une décision.
  assert.ok(html.lastIndexOf("$PRINTER market") > html.lastIndexOf("to switch one on"));
});

// Le cours brut du jeton a disparu : ce qui compte à l'achat est ce que
// l'allumage coûte, et cette case est juste à côté, déjà convertie.
test("the raw token price is gone, its converted cost is not", () => {
  const html = statsHtml({ ...DATA, printer: { usd: 0.0188, change24h: -24.1, marketCap: 2915894 } });
  assert.doesNotMatch(html, /a \$PRINTER<\/u>/);
  assert.doesNotMatch(html, /in a day/);
  assert.match(html, /to switch one on/);
});

test("a figure that could not be read shows a dash, never a zero", () => {
  const html = statsHtml({ ...DATA, printer: {}, ink: {} });
  assert.match(html, /<b>—<\/b><u>\$PRINTER market/);
  assert.match(html, /<b>—<\/b><u>to switch one on/);
});

// « $2,915,894 » dans une case de cent pixels se lit moins vite que « $2.92M ».
test("a market is written at the scale it is read", () => {
  assert.equal(fmtBig(2915894), "$2.92M");
  assert.equal(fmtBig(1570297), "$1.57M");
  assert.equal(fmtBig(63496), "$63k");
  assert.equal(fmtBig(1.4e9), "$1.40B");
  assert.equal(fmtBig(null), "—");
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
  // Le prix d'abord : c'est la première question devant un carnet, et le seul
  // tri qui fait apparaître une dormante.
  assert.deepEqual(SORTS.map((s) => s.key), ["cheap", "back"]);
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

/* ── les prix planchers ───────────────────────────────────────────────────
   Ce que le site promet dans son titre depuis le début, et qui tenait sous six
   cents vignettes. Les blocs sont aussi le filtre : lire le prix puis cliquer
   dessus est un seul geste, là où un tableau plus des pastilles disaient la
   même chose deux fois. */
test("the hero carries the floor of every class that has something listed", () => {
  const html = heroHtml(DATA);
  // x1 allumée : 0.072 ETH × 2460 = $177
  assert.match(html, /class="fl-cls">x1<\/span><b>\$177<\/b><u>printing<\/u><span class="fl-alt"><i>dormant<\/i>\$172<\/span>/);
  assert.match(html, /class="fl-cls">x4<\/span><b>\$640<\/b><u>printing<\/u><span class="fl-alt"><i>dormant<\/i>\$492<\/span>/);
  assert.match(html, /Cheapest by class — tap one to filter/);
});

test("a class with nothing listed is not given a price it does not have", () => {
  const bare = { ...DATA, rows: [{ classValue: 600, classLabel: "x6",
    inked: { listed: 0, entries: [] }, dormant: { listed: 0, entries: [] } }] };
  assert.equal(floorsHtml(bare), "");
});

// Sept « none dormant » quand il n'en reste que deux ne disaient plus rien.
// Un état sans annonce n'a pas de ligne — et surtout pas de prix inventé.
test("a class listed only lit gets no dormant line, and no invented dormant floor", () => {
  const one = { ...DATA, rows: [{ classValue: 100, classLabel: "x1",
    inked: { floorEth: 0.072, listed: 3, entries: [] },
    dormant: { floorEth: null, listed: 0, entries: [] } }] };
  const html = floorsHtml(one);
  assert.doesNotMatch(html, /dormant/);
  assert.match(html, /<b>\$177<\/b><u>printing<\/u>/);
});

test("a class with only burned Machines on sale says none is printing, not a price", () => {
  const only = { ...DATA, rows: [{ classValue: 600, classLabel: "x6",
    inked: { floorEth: null, listed: 0, entries: [] },
    dormant: { floorEth: null, listed: 0, entries: [] },
    burned: { floorEth: 0.5, listed: 1, entries: [] } }] };
  assert.match(floorsHtml(only), /<b>—<\/b><u>none printing<\/u><span class="fl-alt fl-burned"><i>burned<\/i>\$1,230<\/span>/);
});

test("a floor block is the filter, and it says which one is on", () => {
  assert.ok(pickMachines(DATA, { klass: "x4" }).every((m) => m.classLabel === "x4"));
  const html = heroHtml(DATA, "x4");
  assert.match(html, /data-k="x4" aria-pressed="true"/);
  assert.match(html, /data-k="" aria-pressed="false"/);
  // Le tri reste à part : c'est une seconde question, pas une huitième classe.
  assert.match(chipsHtml(DATA, "x4", "cheap"), /data-s="cheap" aria-pressed="true"/);
  assert.doesNotMatch(chipsHtml(DATA, "x4", "cheap"), /data-k=/);
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
  const html = walletHtml(WALLET, { light: 151 });
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
  assert.match(walletHtml({ error: "That is not an address" }), /not an address/);
  assert.match(walletHtml({ pending: true }), /Reading the chain/);
  assert.match(walletHtml({ machines: [] }), /holds no Machine/);
});

/* ── comprendre ──────────────────────────────────────────────────────────── */
test("how it works is five steps, in the order they happen to a Machine", () => {
  const html = stepsHtml(DATA);
  assert.equal((html.match(/class="step-n"/g) ?? []).length, 5);
  assert.match(html, /You buy a Machine/);
  assert.match(html, /5,000 \$PRINTER<\/b> — about \$151 today/);
  // Le délai « allumée pendant une epoch » coûte de l'argent à qui l'ignore.
  assert.match(html, /takes no part in\s+the pot already waiting/);
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
  assert.match(html, /It is <b>not burned<\/b> by the fuse/);
  assert.doesNotMatch(html, /come back out\./);
  assert.match(html, /Locked is not burned, and this page will not call it that/);
  assert.match(html, /owned by a single key, not a multi-signature wallet/);
  assert.match(html, /None has ever come back out to a wallet/);
});

// Le protocole annonce que le coffre allume ce qu'il garde. Le compte des
// allumées n'a pas bougé pendant que le coffre passait de 178 à 255 : ce n'est
// pas « pas encore », c'est « pas du tout ».
test("the page checks the vault against what the protocol says it does", () => {
  const html = scarcityHtml(SC);
  assert.match(html, /the vault activates what it holds and shares the stock back/);
  assert.match(html, /<b>172 of the 178 are dormant<\/b>/);
});

test("a vault whose machines all run makes no such claim", () => {
  const html = scarcityHtml({ ...SC, vault: { ...SC.vault, dormant: 0, awake: 178 } });
  assert.doesNotMatch(html, /are dormant/);
});

test("a Machine taken back out of the vault is reported", () => {
  assert.match(scarcityHtml({ ...SC, proton: { released: 3 } }), /3 came back out to a wallet/);
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
  assert.doesNotMatch(walletHtml({ error: evil }), /<img src=x/);
});

/* ── la page elle-même ───────────────────────────────────────────────────── */
test("three tabs, and every hash the site has ever served still lands", () => {
  assert.match(page, /data-tab="buy">Buy</);
  assert.match(page, /data-tab="wallet">My wallet</);
  assert.match(page, /data-tab="learn">Learn</);
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  const tabs = app.match(/const TABS = \[([^\]]*)\]/)[1].match(/"(\w+)"/g).map((q) => q.slice(1, -1));
  const moved = app.match(/const MOVED = \{([^}]*)\}/)[1];
  // Une adresse ancienne est servie soit parce qu'elle est redevenue un
  // onglet, soit parce qu'elle est redirigée. Les deux comptent ; ce qui ne
  // compte pas, c'est de n'être ni l'un ni l'autre.
  for (const hash of ["market", "wallet", "mine", "vote", "pad", "scarcity", "how", "protocol"]) {
    const lands = tabs.includes(hash) ||
      new RegExp(`\\b${hash}: "(${tabs.join("|")})"`).test(moved);
    assert.ok(lands, `#${hash} ne mène nulle part`);
  }
});

// « Mine » se lit d'abord comme le verbe : tout le vocabulaire du protocole
// parle de machines qui produisent, et l'écosystème a jusqu'à un contrat qui
// s'appelle MINE. Le possessif anglais arrive en second, et pour un lecteur
// non anglophone il n'arrive pas toujours.
test("the wallet tab is named by what it holds, not by a verb", () => {
  const nav = page.slice(page.indexOf('id="nav"'), page.indexOf("</nav>"));
  assert.doesNotMatch(nav, />Mine</, "le libellé se lit comme « miner »");
  assert.match(nav, />My wallet</);
});

/* L'ancienne version n'est plus maintenue depuis le 2026-09-24 : ses chiffres
   datent d'avant le Meltdown. On n'y envoie plus personne. */
test("the page no longer sends anyone to the unmaintained old version", () => {
  assert.doesNotMatch(page, /href="https:\/\/old\.rh-machines\.sex"/);
  assert.doesNotMatch(page, /Old version/);
});

// L'apostrophe simple est échappée alors qu'aucun attribut du projet n'en
// utilise. C'est la raison même : le jour où quelqu'un écrit class='…', la
// fonction doit déjà tenir. Un échappement qui dépend d'une convention de
// guillemets n'en est pas un.
test("escaping does not depend on which quote the markup happens to use", () => {
  assert.equal(esc(`<a href='x' title="y">&</a>`),
    "&lt;a href=&#39;x&#39; title=&quot;y&quot;&gt;&amp;&lt;/a&gt;");
  for (const c of ["<", ">", '"', "'", "&"]) {
    assert.doesNotMatch(esc(`a${c}b`), new RegExp(`[<>"'&](?!#?\\w+;)`),
      `${c} ressort tel quel`);
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

// Les quatre chiffres d'état se lisent avant la phrase qui les commente : on
// regarde ce qui est vrai, puis ce qu'on en dit.
test("the state of the protocol is read before the sentence about it", () => {
  const buy = page.slice(page.indexOf('id="pane-buy"'), page.indexOf('id="pane-wallet"'));
  assert.ok(buy.indexOf('id="stats"') < buy.indexOf('id="hero"'),
    "les chiffres doivent précéder l'ouverture");
});

test("every section the site carries has somewhere to be drawn", () => {
  for (const id of ["hero", "stats", "chips", "cards", "wallet-out",
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

// Le carnet doit ouvrir sur le prix sans qu'on ait à cliquer : le défaut des
// fonctions et celui du câblage sont le même, et ils suivent l'ordre des
// boutons plutôt qu'une chaîne recopiée à trois endroits.
test("the book opens on price, and nothing hard-codes which sort that is", () => {
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /sort = SORTS\[0\]\.key/);
  assert.doesNotMatch(app, /sort = "back"/);
  // Même règle pour l'état : le défaut suit l'ordre des boutons, il ne se
  // recopie pas. Réordonner la liste suffit à le changer.
  assert.match(app, /let state = STATES\[0\]\.key/);
  assert.equal(STATES[0].key, "lit", "le carnet ouvre sur ce qui imprime");
  const picked = pickMachines(DATA);
  assert.equal(picked[0].lit, false, "sans argument, le carnet s'ouvre sur le moins cher");
  assert.match(chipsHtml(DATA, null), /data-s="cheap" aria-pressed="true"/);
});

/* ── le détail d'une machine ───────────────────────────────────────────────
   Une carte porte ce qu'il faut pour choisir ; le panneau porte ce qu'il faut
   pour vérifier. */
test("the panel shows what the chain says, not just what the card said", () => {
  const html = detailHtml({
    tokenId: 1587, classLabel: "x4", lit: true, priceEth: 0.235, epochUsd: 8.13,
    weight: 400, inkPrinter: 4331, inkMult: 1,
    machine: { image: "https://i2c.seadn.io/x.webp", headwear: "Smitten", body: "Cotton Candy", desk: "tech" },
    anvilBidPrinter: 6706, anvilBidEth: 0.075,
  }, DATA);
  assert.match(html, /#1587/);
  assert.match(html, /<span>weight<\/span><b>4&times;<\/b>/);
  assert.match(html, /<span>ink burned<\/span><b>4,331 \$PRINTER<\/b>/);
  assert.match(html, /<span>desk<\/span><b>tech<\/b>/);
  assert.match(html, /<span>headwear<\/span><b>Smitten<\/b>/);
  assert.match(html, /Open on OpenSea/);
});

// L'anvil est un acheteur permanent : ce qu'il donne est le seul prix qu'on
// obtienne à coup sûr, et il se paie en $PRINTER, pas en ETH.
test("the panel says what the Anvil would pay, and in what currency", () => {
  const html = detailHtml({ tokenId: 1, classLabel: "x1", lit: true, priceEth: 0.1,
    anvilBidPrinter: 6706, anvilBidEth: 0.075 }, DATA);
  assert.match(html, /The Anvil would pay \$185/);
  assert.match(html, /6,706 \$PRINTER, net of the sell fee/);
  assert.match(html, /the same standing bid for any Machine/);
});

/* Une machine du rayon de l'anvil est une machine comme une autre : elle a un
   panneau, et il parle de la monnaie dans laquelle elle se paie. */
test("a Machine off the Anvil's shelf opens on its own market, not on OpenSea", () => {
  const html = detailHtml({
    tokenId: 584, classLabel: "x1", lit: true, from: "anvil",
    askPrinter: 8206.652, askUsd: 173.16, askEth: 0.0684,
    weight: 100, inkPrinter: 4250, inkMult: 1, epochUsd: 2.62,
    machine: { image: "https://i2c.seadn.io/x.webp", desk: "tech" },
  }, DATA);
  assert.match(html, /#584/);
  assert.match(html, /\$173/);
  assert.match(html, /8,207 \$PRINTER at the Anvil/);
  assert.match(html, new RegExp(`href="${ANVIL_URL.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}"`));
  assert.doesNotMatch(html, /ETH on OpenSea/);
  assert.doesNotMatch(html, /Open on OpenSea/);
  assert.match(html, /Open the Anvil/);
});

// L'anvil possède ce qu'il met en rayon : afficher ce qu'il en donnerait à
// côté de ce qu'il en demande ferait passer le vendeur pour un acheteur.
test("the standing bid is not quoted on a Machine the Anvil is selling", () => {
  const shared = { tokenId: 1, classLabel: "x1", lit: true, priceEth: 0.1,
    anvilBidPrinter: 6706, anvilBidEth: 0.075 };
  assert.match(detailHtml(shared, DATA), /The Anvil would pay/);
  assert.doesNotMatch(
    detailHtml({ ...shared, from: "anvil", askPrinter: 8206, askUsd: 173 }, DATA),
    /The Anvil would pay/);
});

// La panne : la vignette du rayon avalait le clic — preventDefault partait,
// la recherche ne regardait que les annonces OpenSea, et il ne se passait
// rien du tout. Ni panneau, ni lien.
test("the detail lookup searches the shelf, not only the order book", () => {
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  const fn = app.slice(app.indexOf("const openDetail ="), app.indexOf("veil.addEventListener"));
  assert.match(fn, /anvilEntries/, "une machine du rayon reste introuvable");
  assert.ok(fn.indexOf("anvilEntries") < fn.indexOf("cell?.entries"),
    "le rayon doit primer : une annonce OpenSea sur une machine du rayon est morte");
});

// Le compte appartient au jeton : ces actions partent avec la machine si elle
// se vend, et c'est le genre de chose qu'on découvre trop tard.
test("the panel lists the stock a Machine is carrying, and says whose it is", () => {
  const html = detailHtml({ tokenId: 1, classLabel: "x1", lit: true, priceEth: 0.1,
    holds: { usd: 16.4, lines: [
      { symbol: "NVDA", amount: 0.0512, usd: 11.2 },
      { symbol: "GME", amount: 0.287, usd: 5.2 },
      { symbol: "DUST", amount: 0.0000001, usd: 0.001 },
    ] } }, DATA);
  assert.match(html, /Carrying \$16\.40 of stock/);
  assert.match(html, /goes with it if it sells/);
  // « NVDA » n'est pas « nvda » : c'est le nom d'une action, pas un intitulé.
  assert.match(html, /<span>NVDA<\/span>/);
  assert.doesNotMatch(css, /\.d-row span \{[^}]*text-transform/);
  // Les poussières à un dixième de centime n'apprennent rien et allongent la liste.
  assert.doesNotMatch(html, /DUST/);
  // Le plus gros d'abord.
  assert.ok(html.indexOf("NVDA") < html.indexOf("GME"));
});

test("a re-inked Machine says how far past activation it burned", () => {
  const html = detailHtml({ tokenId: 1, classLabel: "x1", lit: true, priceEth: 0.1,
    weight: 103, inkPrinter: 4551, inkMult: 1.03 }, DATA);
  assert.match(html, /class="d-re">re-inked</);
  assert.match(html, /burned past activation<\/span><b>1\.07&times; the base ink/);
});

test("a dormant Machine's panel carries no live colour", () => {
  const html = detailHtml({ tokenId: 1, classLabel: "x1", lit: false, priceEth: 0.07, weight: 0 }, DATA);
  assert.match(html, /class="card-earn off">Not printing</);
  assert.doesNotMatch(html, /class="card-earn">/);
  assert.match(html, /<span>weight<\/span><b>none — never inked<\/b>/);
});

// Le panneau ne vole que le clic simple : un clic modifié ou du milieu doit
// continuer de mener au marché.
test("a modified click still goes to the marketplace", () => {
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /metaKey \|\| e\.ctrlKey \|\| e\.shiftKey \|\| e\.altKey \|\| e\.button !== 0\) return/);
  // Et il rend au clavier ce qu'il prend à la souris.
  assert.match(app, /e\.key === "Escape" && !veil\.hidden/);
  assert.match(app, /lastFocus\?\.focus\?\.\(\)/);
  assert.match(page, /id="detail" hidden/);
});

/* ── le pot ────────────────────────────────────────────────────────────────
   Il ne se lit pas entièrement sur la chaîne : aucun contrat ne l'additionne.
   Le chiffre vient du protocole, et la page le coupe comme lui — parce que la
   coupe vaut de l'argent. */

test("the pot is the whole pot, not just the part already converted", () => {
  const html = statsHtml({ ...DATA, official: OFFICIAL });
  assert.match(html, /st-pot"><b>\$63k<\/b><u>in the pot/);
  // Sans le service, on retombe sur ce qu'on lit soi-même plutôt que sur zéro.
  assert.match(statsHtml({ ...DATA, official: null }), /st-pot"><b>\$32k<\/b>/);
});

// Une machine allumée aujourd'hui ne partage pas le tirage en cours : elle ne
// compte qu'à partir de l'epoch suivante. C'est la moitié « building » qui la
// concerne, et confondre les deux fait attendre un versement qui ne viendra pas.
test("the two halves of the pot are told apart, and so is which one you get", () => {
  const html = potNote({ official: OFFICIAL });
  assert.match(html, /The pot holds <b>\$63k<\/b>/);
  assert.match(html, /<b>\$19k<\/b> of it is locked for this drop/);
  assert.match(html, /<b>\$45k<\/b> is building toward the next one/);
  assert.match(html, /the half a Machine lit today will share in/);
});

// Le site a longtemps annoncé « nobody has been paid yet ». C'était vrai, puis
// ça a cessé de l'être.
test("what has already been paid out is stated, not left implied", () => {
  assert.match(potNote({ official: OFFICIAL }), /<b>\$189k<\/b> has already been paid out/);
});

// On relaie un chiffre qu'on ne dérive pas. Quand il cesse de tenir contre ce
// qu'on lit soi-même, on le dit plutôt que de le répéter.
test("a pot smaller than the USDG we can see is called out, not relayed", () => {
  const html = potNote({ official: { ...OFFICIAL,
    check: { swapperUsdg: 70000, potUsd: 63496, ratio: 1.1, disagrees: true } } });
  assert.match(html, /These two do not agree right now/);
  assert.match(html, /cannot exceed the pot it belongs to/);
});

test("with no official reading there is no note at all", () => {
  assert.equal(potNote({ official: null }), "");
  assert.equal(potNote({}), "");
});

/* ── la vitrine ────────────────────────────────────────────────────────────
   La moitié droite de l'ouverture était vide sur un écran large. Elle porte la
   machine qui rend le plus par dollar — et le taux en toutes lettres, parce que
   « best return » ne se devine pas d'un prix et d'un montant. */
test("the hero features the single best machine on the book", () => {
  const html = heroHtml(DATA);
  const best = pickMachines(DATA, { sort: "back", limit: 1 })[0];
  assert.match(html, /Best return on the book/);
  assert.match(html, new RegExp(`#${best.tokenId} &middot;`));
  // La vitrine précède le pot et les planchers : c'est la réponse, pas le décor.
  const withPot = heroHtml({ ...DATA, official: OFFICIAL });
  assert.ok(withPot.includes("pot-note"), "le décor doit contenir la note du pot pour que l'ordre se teste");
  assert.ok(withPot.indexOf("pick-lab") < withPot.indexOf("pot-note"));
  assert.ok(withPot.indexOf("pick-lab") < withPot.indexOf("floors-row"));
});

/* Le pot était posé sous la rangée entière : il attendait que la colonne la
   plus haute — la vitrine — ait fini, et ouvrait cent vingt pixels de blanc
   entre le paragraphe et lui, plus autant sous la vitrine. */
test("the pot sits in the text column, not underneath the whole row", () => {
  assert.match(css, /\.hero-cols > \.pot-note\s*\{[^}]*grid-area: 2 \/ 1/);
  assert.match(css, /\.hero-cols > \.pick\s*\{[^}]*grid-area: 1 \/ 2 \/ span 2 \/ 3/);

  const html = heroHtml({ ...DATA, official: OFFICIAL });
  // Le placement vit dans la feuille de style, pas dans le document : sur un
  // téléphone il n'y a qu'une colonne, l'ordre y est celui du document, et la
  // réponse doit continuer d'y venir avant le décor.
  assert.ok(html.indexOf("pick-lab") < html.indexOf("pot-note"));

  // Et le pot doit être un enfant de la rangée. Sorti d'elle, les deux règles
  // ci-dessus ne s'appliquent plus à rien et le trou revient sans qu'aucune
  // d'elles ne cesse d'exister.
  const seg = html.slice(html.indexOf('<div class="hero-cols"'), html.indexOf('class="pot-note"'));
  const depth = (seg.match(/<div\b/g) ?? []).length - (seg.match(/<\/div>/g) ?? []).length;
  assert.ok(depth >= 1, "le pot est retombé hors de la rangée");
});

test("the featured machine says what its return actually is, as a rate", () => {
  const m = { tokenId: 7866, classLabel: "x4", priceEth: 0.26, priceUsd: 640,
    epochUsd: 14.43, cost: 640, back: 14.43, machine: { image: "https://i2c.seadn.io/x.webp" } };
  const html = bestPick(m, DATA);
  assert.match(html, /\$14\.43 a drop/);
  assert.match(html, /2\.3% of what it costs, every drop/);
  assert.match(html, /class="pick-price">\$640<small>0\.2600 ETH/);
});

// Une machine qui ne rend rien ne peut pas être le meilleur retour : il n'y a
// pas de vitrine à montrer plutôt qu'une vitrine vide.
test("with nothing returning anything there is no featured machine", () => {
  assert.equal(bestPick({ tokenId: 1, cost: 100, back: 0 }, DATA), "");
  assert.equal(bestPick(null, DATA), "");
  const empty = { ...DATA, rows: [{ classValue: 100, classLabel: "x1",
    inked: { floorEth: 0.07, listed: 1, entries: [] }, dormant: { listed: 0, entries: [] } }] };
  assert.doesNotMatch(heroHtml(empty), /Best return on the book/);
});

/* ── le rayon de l'anvil ───────────────────────────────────────────────────
   Dix machines achetables qui n'apparaissaient nulle part. Elles ne sont pas
   sur OpenSea : elles se paient en $PRINTER au terminal du protocole. */
test("machines on the Anvil's shelf are part of the book", () => {
  const all = pickMachines(DATA, { limit: 99 });
  const shelf = all.filter((m) => m.from === "anvil");
  assert.equal(shelf.length, 2, "le rayon doit figurer dans le carnet");
  assert.ok(all.some((m) => m.from === "opensea"), "et les annonces OpenSea avec lui");
});

test("a shelf machine sends you where it is actually for sale", () => {
  const m = pickMachines(DATA, { limit: 99 }).find((x) => x.from === "anvil");
  const html = cardHtml(m, { light: 151 });
  assert.match(html, /href="https:\/\/www\.rhmachines\.com\/#anvil"/);
  assert.doesNotMatch(html, /opensea\.io/);
  assert.match(html, /class="card-from">Anvil</);
  // Et dans la monnaie où elle se paie, pas dans celle du reste du carnet.
  assert.match(html, /class="card-price">\$174<small>9,114 \$PRINTER<\/small>/);
});

test("an OpenSea listing still goes to OpenSea, priced in ETH", () => {
  const m = pickMachines(DATA, { limit: 99 }).find((x) => x.from === "opensea");
  const html = cardHtml(m, { light: 151 });
  assert.match(html, /href="https:\/\/opensea\.io/);
  assert.doesNotMatch(html, /card-from/);
  assert.match(html, /ETH<\/small>/);
});

// Deux monnaies ne se classent pas l'une contre l'autre : le rayon est en
// $PRINTER, le carnet en ETH. Trier sur l'ETH mettait le rayon nulle part.
test("sorting by price compares dollars, since the two markets differ", () => {
  const cheap = pickMachines(DATA, { sort: "cheap", limit: 99 });
  const prices = cheap.map((m) => m.priceUsd).filter((v) => v !== null);
  for (let i = 1; i < prices.length; i++) {
    assert.ok(prices[i] >= prices[i - 1], "le classement par prix doit être croissant en dollars");
  }
});

/* ── le filtre d'état ──────────────────────────────────────────────────────
   Deux boutons pour trois états : aucun enfoncé montre tout, un enfoncé ne
   montre que celui-là, et le renfoncer revient à tout. Un troisième bouton
   « All » ferait une rangée de cinq pour une question qui en compte deux. */
test("the state filter narrows the book to one side or the other", () => {
  const lit = pickMachines(DATA, { state: "lit", limit: 99 });
  const off = pickMachines(DATA, { state: "dormant", limit: 99 });
  const all = pickMachines(DATA, { limit: 99 });
  assert.ok(lit.length && off.length, "le décor doit contenir les deux états");
  assert.ok(lit.every((m) => m.lit), "« printing » ne doit rendre que des allumées");
  assert.ok(off.every((m) => !m.lit), "« dormant » ne doit rendre que des dormantes");
  assert.equal(lit.length + off.length, all.length, "les deux moitiés doivent faire le tout");
});

test("the state buttons say which one is on, and none means everything", () => {
  assert.deepEqual(STATES.map((s) => s.key), ["lit", "dormant", "burned", "dark"]);
  assert.match(chipsHtml(DATA, null, "cheap", "lit"), /data-st="lit" aria-pressed="true"/);
  assert.match(chipsHtml(DATA, null, "cheap", "lit"), /data-st="dormant" aria-pressed="false"/);
  const none = chipsHtml(DATA, null, "cheap", null);
  assert.doesNotMatch(none, /aria-pressed="true"[^>]*>Printing/);
  assert.doesNotMatch(none, /aria-pressed="true"[^>]*>Dormant/);
  assert.doesNotMatch(none, /aria-pressed="true"[^>]*>Burned/);
});

// Renfoncer le bouton actif revient à tout montrer. Sans ça, un filtre posé
// par erreur ne se retire plus.
test("pressing the active state again clears it", () => {
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /state = state === b\.dataset\.st \? null : b\.dataset\.st/);
});

// Le lime ne dit qu'une chose : cette machine imprime. Un filtre n'est pas une
// machine, il prend l'encre pleine comme les autres commandes.
test("the state filter does not steal the live colour", () => {
  assert.match(css, /\.chips-state button\[aria-pressed="true"\] \{[^}]*var\(--ink\)/);
  assert.doesNotMatch(css, /\.chips-state[^{]*\{[^}]*var\(--lime\)/);
});

// « 24 sur 757 » sous une grille filtrée sur les dormantes est faux : le total
// doit compter la même chose que la liste.
test("the count under the grid counts what the grid is showing", () => {
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /const total = pickMachines\(data, \{ klass, state, limit: Infinity \}\)\.length/);
  assert.match(app, /dormant and for sale/);
});

// La phrase sous le titre décrit ce que la grille montre. « Dormant ones are
// cheaper » sous une grille filtrée sur les allumées ne parle de rien.
test("the line under the title describes the grid actually on screen", () => {
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /What costs least among the Machines already printing/);
  assert.match(app, /These earn nothing until someone burns ink for them/);
});

// Le carburant vaut plus cher que ce qu'il alimente. Observation d'analyse :
// elle vit sur Learn, pas sur la page où l'on vient acheter.
test("the fuel is weighed against the fleet it burns for, on Learn", () => {
  const html = scarcityHtml({ ...SC, market: { printerCap: 2915894, collectionCap: 1570297 } });
  assert.match(html, /\$PRINTER is a <b>\$2\.92M<\/b> market/);
  assert.match(html, /worth <b>\$1\.57M<\/b> all together/);
  assert.match(html, /priced at <b>1\.86×<\/b> the fleet it burns for/);
  // Deux marchés indépendants : le rapport bouge, et le dire évite qu'il se
  // lise comme un jugement.
  assert.match(html, /Both move on their own, and the ratio with them/);
  // Et rien de tout ça sur la page d'accueil.
  assert.doesNotMatch(heroHtml(DATA), /the fleet it burns for/);
});

test("with either market unread the comparison is not attempted", () => {
  assert.doesNotMatch(scarcityHtml({ ...SC, market: { printerCap: 2915894, collectionCap: null } }),
    /the fleet it burns for/);
  assert.doesNotMatch(scarcityHtml(SC), /the fleet it burns for/);
});

/* ── une machine, un seul endroit ──────────────────────────────────────────
   L'anvil possède ce qu'il met en rayon. Une annonce OpenSea sur la même
   machine est donc une annonce que son ancien propriétaire n'a pas retirée :
   elle ne peut plus être exécutée, et la montrer ferait apparaître la même
   machine deux fois, à deux prix, dont un imaginaire. */
test("a machine on the shelf is not also offered as an OpenSea listing", () => {
  const both = { ...DATA, rows: [{ classValue: 100, classLabel: "x1",
    inked: { floorEth: 0.06, listed: 2, entries: [entry({ tokenId: 584, priceEth: 0.06 })],
      anvilEntries: [{ tokenId: 584, askPrinter: 9113, askUsd: 174, askEth: 0.07,
        weight: 100, inkMult: 1, epochUsd: 2.1, machine: null }] },
    dormant: { listed: 0, entries: [] } }] };
  const picked = pickMachines(both, { limit: 99 });
  assert.equal(picked.length, 1, "la machine ne doit apparaître qu'une fois");
  assert.equal(picked[0].from, "anvil", "et c'est le rayon qui gagne — lui la possède");
});

test("no machine appears twice in the book as it stands", () => {
  const seen = new Set();
  for (const m of pickMachines(DATA, { limit: 999 })) {
    assert.ok(!seen.has(m.tokenId), `#${m.tokenId} figure deux fois`);
    seen.add(m.tokenId);
  }
});

/* ── la grille des chiffres ────────────────────────────────────────────────
   Elle était figée à cinq colonnes pour la page d'achat. Les sections de Learn
   lui en passent quatre : la cinquième colonne restait vide et rétrécissait
   les autres, sur une page qui n'avait rien demandé. */
test("the figure grid counts its own cells instead of being told five", () => {
  const rule = css.match(/\.stats \{[^}]*\}/)[0];
  assert.match(rule, /repeat\(auto-fit, minmax\([\d.]+px, 1fr\)\)/);
  assert.doesNotMatch(rule, /repeat\(\d+, 1fr\)/);
  // Et les sections qui s'en servent n'en passent pas toutes le même nombre.
  const buy = (statsHtml(DATA).match(/class="st /g) ?? []).length;
  const learn = (scarcityHtml(SC).match(/class="st /g) ?? []).length;
  assert.notEqual(buy, learn, "le décor doit prouver que les deux comptes diffèrent");
});

// Comprendre est un document : il se lit d'un bout à l'autre. Étalé sur la
// largeur d'un tableau de bord, son texte tenait dans la moitié gauche et
// laissait l'autre vide — ce qui se lit comme une page cassée, pas comme un
// choix de composition.
test("the Learn page is set at a reading width, not a dashboard width", () => {
  const rule = css.match(/#pane-learn \{[^}]*\}/)[0];
  assert.match(rule, /max-width: \d+px/);
  // Alignée à gauche : centrée, elle démarrait cent soixante pixels à droite
  // de la navigation, et deux bords gauches sur la même page se lisent comme
  // un défaut.
  assert.doesNotMatch(rule, /margin: 0 auto/);
});

/* ── le Meltdown ───────────────────────────────────────────────────────────
   Le 2026-09-23, 4 381 machines encore détenues ont été marquées brûlées. Elles
   restent en vente : la page les montre, à part, et ne leur promet rien. */
const MELT = {
  ...DATA,
  rows: [
    { ...DATA.rows[0],
      burned: { floorEth: 0.004, listed: 30, entries: [entry({ tokenId: 1, priceEth: 0.004, epochUsd: null,
        machine: { image: "https://i2c.seadn.io/red.webp", burned: true } })] } },
    ...DATA.rows.slice(1),
  ],
};

test("a burned Machine says so on its face, in its own colour, and claims no drop", () => {
  const html = cardHtml({ ...entry({ epochUsd: null }), burned: true, lit: false, classLabel: "x1", priceUsd: 10 });
  assert.match(html, /class="card-state burned">Burned</);
  assert.match(html, /burned in the Meltdown/);
  assert.doesNotMatch(html, /a drop/);
  assert.doesNotMatch(html, /to switch on/);
  assert.match(css, /\.card-state\.burned \{[^}]*var\(--blood\)/);
});

test("the burned filter shows the burned only, priced without the cost of ink", () => {
  const picked = pickMachines(MELT, { state: "burned", limit: Infinity });
  assert.deepEqual(picked.map((m) => m.tokenId), [1]);
  assert.equal(picked[0].burned, true);
  assert.equal(picked[0].lit, false);
  assert.ok(Math.abs(picked[0].cost - 0.004 * 2460) < 1e-9);
  // Et « Printing » n'en montre aucune.
  assert.ok(!pickMachines(MELT, { state: "lit", limit: Infinity }).some((m) => m.tokenId === 1));
});

test("a class block shows the burned floor under the others, never as its headline", () => {
  const html = floorsHtml(MELT);
  // L'étiquette avant le prix : « $46 burned » se lisait « 46 $ brûlés ».
  assert.match(html, /<span class="fl-alt fl-burned"><i>burned<\/i>\$10<\/span>/);
  assert.doesNotMatch(html, /\$10 burned/);
  assert.match(css, /\.fl-burned i \{[^}]*var\(--blood\)/);
  // Le grand chiffre reste celui qui imprime.
  assert.match(html, /<b>\$177<\/b>/);
});

test("a wallet does not count a burned Machine among those printing", () => {
  const html = walletHtml({ machines: [
    { tokenId: 1, weight: 100, burned: true, epochUsd: null, image: null },
    { tokenId: 2, weight: 100, burned: false, epochUsd: 3, image: null },
  ] });
  assert.match(html, /<b>1<\/b><u>of yours printing/);
  assert.match(html, /card-state burned/);
});

// Le 2026-09-23 sur le banc : une brûlée bradée, lestée d'actions, sortait en
// tête du « Best return » avec « $0.00 a drop ».
test("the best-return showcase never features a burned Machine", () => {
  const rich = { ...MELT, rows: [{ ...MELT.rows[0],
    burned: { floorEth: 0.001, listed: 1, entries: [entry({ tokenId: 1, priceEth: 0.001, epochUsd: null,
      holds: { usd: 500 }, machine: { image: "https://i2c.seadn.io/red.webp", burned: true } })] } },
    ...MELT.rows.slice(1)] };
  const html = heroHtml(rich);
  assert.match(html, /Best return on the book/);
  assert.doesNotMatch(html, /#1 &middot;/);
});

/* ── le Rituel noir ────────────────────────────────────────────────────────
   Le 2026-09-23 : quatre brûlées pour forger une Dark Machine. Une case pour
   toute la collection, un bloc à part, et aucune promesse de drop. */
const DARKD = {
  ...MELT,
  darkBook: { floorEth: 1.2, listed: 2, supply: 20, entries: [
    entry({ tokenId: 93, priceEth: 1.2, epochUsd: null, machine: { image: "https://i2c.seadn.io/dark.webp", dark: true, ritualId: 4 } }),
    entry({ tokenId: 23, priceEth: 3, epochUsd: null, machine: { image: "https://i2c.seadn.io/dark.webp", dark: true, ritualId: null } }),
  ] },
  collection: { ...MELT.collection, dark: 20 },
};

test("the Dark Machines get a block of their own after the classes", () => {
  const html = floorsHtml(DARKD);
  assert.match(html, /class="fl fl-dark" data-k="Dark"[^>]*><span class="fl-cls">Dark<\/span><b>\$2,952<\/b><u>2 of 20 for sale<\/u>/);
  assert.ok(html.indexOf("fl-dark") > html.indexOf(">x4<"));
});

test("the Dark block filters the book to the Dark Machines only", () => {
  const picked = pickMachines(DARKD, { klass: DARK_LABEL, limit: Infinity });
  assert.deepEqual(picked.map((m) => m.tokenId).sort((a, b) => a - b), [23, 93]);
  assert.ok(picked.every((m) => m.dark && !m.lit));
  assert.deepEqual(pickMachines(DARKD, { state: "dark", limit: Infinity }).length, 2);
  assert.ok(!pickMachines(DARKD, { state: "lit", limit: Infinity }).some((m) => m.dark));
});

test("a Dark card says so in black and promises nothing from the pot", () => {
  const html = cardHtml({ ...entry({ epochUsd: null }), dark: true, lit: false, classLabel: "Dark", priceUsd: 2952 });
  assert.match(html, /class="card-state dark">Dark</);
  assert.match(html, /paid outside the pot/);
  assert.doesNotMatch(html, /a drop/);
  assert.match(css, /\.card-state\.dark \{[^}]*var\(--ink\)/);
});

test("the detail says which ritual forged it, or that none did", () => {
  const forged = detailHtml({ ...DARKD.darkBook.entries[0], dark: true, classLabel: "Dark", from: "opensea" }, DARKD);
  const byHand = detailHtml({ ...DARKD.darkBook.entries[1], dark: true, classLabel: "Dark", from: "opensea" }, DARKD);
  assert.match(forged, /Forged in Dark Ritual #4/);
  assert.match(byHand, /Marked Dark — no ritual on chain/);
});

test("the showcase never features a Dark Machine either", () => {
  const rich = { ...DARKD, darkBook: { ...DARKD.darkBook, entries: [entry({ tokenId: 93, priceEth: 0.0001, epochUsd: null,
    holds: { usd: 900 }, machine: { image: "https://i2c.seadn.io/dark.webp", dark: true } })] } };
  assert.doesNotMatch(heroHtml(rich), /#93 &middot;/);
});

test("the ritual section puts the claimed and the observed odds side by side", () => {
  const html = ritualHtml({ rituals: 31, won: 19, lost: 10, pending: 2, winRate: 19 / 29, claimedWinRate: 0.6,
    fuelBurned: 124, printerBurned: 310000, ethPaid: 0.51, forged: 19, unforged: [23] });
  assert.match(html, /<b>19<\/b><u>Dark Machines forged/);
  assert.match(html, /<b>124<\/b><u>burned Machines fed to it/);
  assert.match(html, /claims <b>60\.0%<\/b> success; so far <b>19<\/b> of 29 settled rituals were won, and 2 are still being played/);
  assert.match(html, /#23 is listed as Dark by the team without a ritual on chain/);
  assert.match(ritualHtml(null), /Not read yet/);
});

test("the hero counts the Dark Machines apart from the burned", () => {
  const html = heroHtml({ ...DARKD, fleet: { minted: 10000, vault: 0, dead: 3623, circulating: 6377, share: 0.36 },
    collection: { machines: 2102, burned: 4255, dark: 20 } });
  assert.match(html, /4,255 more were marked burned in the Meltdown[^;]*; 20 were forged into Dark Machines/);
});

// Le jour de l'ouverture, aucune Dark n'était en vente : la catégorie doit
// exister dans la rangée quand même, sans prix inventé.
test("the Dark block shows even with none for sale, and invents no price", () => {
  const none = { ...DARKD, darkBook: { floorEth: null, listed: 0, supply: 20, entries: [] } };
  assert.match(floorsHtml(none), /<span class="fl-cls">Dark<\/span><b>—<\/b><u>none of 20 for sale<\/u>/);
  const gone = { ...DARKD, darkBook: { floorEth: null, listed: 0, supply: 0, entries: [] } };
  assert.doesNotMatch(floorsHtml(gone), /fl-dark/);
});

/* ── le compteur des Dark, à droite des onglets ─────────────────────────── */
test("the Dark counter shows how many exist and how the rituals went", () => {
  const html = darkCountHtml({ collection: { dark: 20 }, ritual: { won: 19, lost: 10, pending: 0 } });
  assert.match(html, /<span class="dc-num">20<\/span>/);
  assert.match(html, /<b>Dark Machines<\/b><u>19 of 29 rituals won<\/u>/);
  assert.doesNotMatch(html, /dc-live/);
});

// Le point ne bat que si une partie se joue : il dit « maintenant ».
test("the counter's red dot beats only while a ritual is being played", () => {
  const html = darkCountHtml({ collection: { dark: 20 }, ritual: { won: 19, lost: 10, pending: 2 } });
  assert.match(html, /<i class="dc-live" title="2 rituals being played now"><\/i>20/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^@]*animation: none/);
});

test("no Dark Machine, no counter", () => {
  assert.equal(darkCountHtml({ collection: { dark: 0 } }), "");
  assert.equal(darkCountHtml(null), "");
});

test("the counter sits outside the tab list, which it is not part of", () => {
  const nav = page.slice(page.indexOf('<nav class="nav"'), page.indexOf("</nav>"));
  assert.doesNotMatch(nav, /dark-count/);
  assert.match(page, /<\/nav>\s*<a class="dark-count" id="dark-count"/);
});

// Le 2026-09-24 sur le banc : le bloc Dark ouvrait un carnet vide, parce que
// le filtre « Printing » par défaut écartait toutes les Dark.
test("choosing Dark shows the Dark Machines whatever state was selected", () => {
  const picked = pickMachines(DARKD, { klass: DARK_LABEL, state: "lit", limit: Infinity });
  assert.equal(picked.length, 2);
});

/* ── toutes les Dark, en vente ou non ─────────────────────────────────────── */
const FLEET = { ...DARKD, darkFleet: [
  { tokenId: 23, image: "https://i2c.seadn.io/d.webp", ritualId: null, owner: "0x6d6015e1aaaaaaaaaaaaaaaaaaaaaaaaaaaa1234", priceEth: null },
  { tokenId: 93, image: "https://i2c.seadn.io/d.webp", ritualId: 4, owner: "0x4c4d50ddbbbbbbbbbbbbbbbbbbbbbbbbbbbb5678", priceEth: 1.2 },
] };

test("every Dark Machine gets a card, for sale or not", () => {
  const html = darkGalleryHtml(FLEET);
  assert.match(html, /Every Dark Machine/);
  assert.match(html, /2 exist, 1 for sale/);
  assert.match(html, /#23 &middot; no ritual on chain<\/span><span class="card-price">Not for sale/);
  assert.match(html, /#93 &middot; ritual #4<\/span><span class="card-price">\$2,952<small>1\.2000 ETH<\/small>/);
  assert.match(html, /held by 0x6d60…1234/);
});

// Le panneau de détail parle d'une annonce : sans `data-id`, le clic mène
// simplement à la page OpenSea de la machine.
test("a gallery card links to OpenSea and opens no detail panel", () => {
  const html = darkGalleryHtml(FLEET);
  assert.doesNotMatch(html, /data-id=/);
  assert.match(html, /href="[^"]*\/23"/);
});

test("no Dark Machine, no gallery", () => {
  assert.equal(darkGalleryHtml({ darkFleet: [] }), "");
  assert.equal(darkGalleryHtml(null), "");
});

// `#dark` est une adresse qu'on partage : elle doit ouvrir le carnet filtré
// sur les Dark, et le compteur y mener.
test("#dark opens the book on the Dark Machines, and the counter links there", () => {
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /if \(name !== "dark"\) return show\(name\);\s*klass = DARK_LABEL;\s*state = null;/);
  assert.match(app, /let tab = route\(\(location\.hash/);
  assert.match(page, /<a class="dark-count" id="dark-count" href="#dark"/);
});

/* ── plus de dormante en vente ─────────────────────────────────────────────
   Après le Meltdown il en restait deux, et aucune en vente : le filtre ouvrait
   un carnet vide et « to switch one on » chiffrait un achat impossible. */
const NODORM = { ...DATA, rows: DATA.rows.map((r) => ({ ...r,
  dormant: { floorEth: null, listed: 0, supply: r.classValue === 1000 ? 2 : 0, entries: [], anvilEntries: [] } })) };

test("with no dormant Machine for sale, the switch-on figure and the Dormant button go", () => {
  assert.equal(dormantOnSale(NODORM), false);
  const stats = statsHtml(NODORM);
  assert.doesNotMatch(stats, /to switch one on/);
  assert.equal((stats.match(/class="st /g) ?? []).length, 4);
  assert.doesNotMatch(chipsHtml(NODORM, null, "cheap", null), /data-st="dormant"/);
  assert.match(chipsHtml(NODORM, null, "cheap", null), /data-st="burned"/);
});

// Le de-ink rendort une machine : une seule dormante en vente, même au rayon
// de l'Anvil, suffit à les faire revenir.
test("one dormant Machine for sale, even on the Anvil shelf, brings both back", () => {
  assert.equal(dormantOnSale(DATA), true);
  const shelfOnly = { ...NODORM, rows: [{ ...NODORM.rows[0],
    dormant: { listed: 0, entries: [], anvilEntries: [{ tokenId: 1, askPrinter: 9000 }] } }] };
  assert.equal(dormantOnSale(shelfOnly), true);
  assert.match(statsHtml(DATA), /to switch one on/);
  assert.match(chipsHtml(DATA, null, "cheap", null), /data-st="dormant"/);
});

/* ── les parts de drop jamais versées ─────────────────────────────────────── */
test("a share of a drop that was never sent is said in one line, with what it is worth", () => {
  const html = unpaidHtml({ round: 1, date: "2026-09-03", funded: false,
    lines: [{ tokenId: 5949, amount: 0.0853, symbol: "NVDA", usd: 15.4 }] });
  assert.match(html, /Still owed from the 3 Sep drop, never sent: #5949: 0\.0853 NVDA \(~\$15\.40\)/);
  assert.match(html, /Only the protocol's keeper can send it — and the drop contract holds none of it right now\./);
});

test("an unknown round names no token, and nothing owed shows nothing", () => {
  assert.match(unpaidHtml({ round: 2, date: null, funded: null, lines: [{ tokenId: 1, amount: null, symbol: null, usd: null }] }),
    /from drop round 2, never sent: #1: a share\. Only/);
  assert.equal(unpaidHtml({ lines: [] }), "");
  assert.equal(unpaidHtml(null), "");
});

test("the wallet carries the owed line between the totals and the cards", () => {
  const html = walletHtml({ machines: [{ tokenId: 5949, weight: 800, epochUsd: 6.9, image: null }],
    unpaid: { round: 1, date: "2026-09-03", funded: false, lines: [{ tokenId: 5949, amount: 0.0853, symbol: "NVDA", usd: null }] } });
  assert.ok(html.indexOf('class="unpaid"') < html.indexOf('class="grid"'));
});

// Le 2026-09-24 : « 3,477 have come back out » — elles étaient parties à
// l'adresse morte, pas revenues à quelqu'un.
test("Machines the vault sent to the dead address are not said to have come back", () => {
  const html = scarcityHtml({ ...SC, vault: { ...SC.vault, held: 2, dormant: 1 },
    proton: { released: 3480, releasedToDead: 3477 } });
  assert.match(html, /3,477 have left it for the dead address, most of them in the Meltdown of 23 September — gone for good\. 3 came back out to a wallet\./);
  assert.doesNotMatch(html, /3,480/);
  assert.doesNotMatch(html, /has not moved while the vault filled up/);
});

/* ── Learn après le Meltdown ─────────────────────────────────────────────── */
test("the first step no longer says ten thousand exist", () => {
  const html = stepsHtml({ ...NODORM, totals: { inked: 2120 } });
  assert.doesNotMatch(html, /Ten thousand exist/);
  assert.match(html, /Ten thousand were minted; <b>2,120<\/b> still print today — the Meltdown burned those below 2×/);
});

// Sans dormante à vendre, « l'allumer » ne concerne plus aucun acheteur.
test("with no dormant Machine for sale, step two is about making one heavier", () => {
  const html = stepsHtml({ ...NODORM, protocol: { ceiling: "200" }, burn: { ink: 57_501_435 } });
  assert.match(html, /You make it heavier/);
  assert.doesNotMatch(html, /You switch it on/);
  assert.match(html, /<b>2× today<\/b>, 3× once 60M has gone in as ink — 2\.50M to go/);
  // Et une dormante à vendre ramène l'allumage.
  assert.match(stepsHtml(DATA), /You switch it on/);
});

test("the ceiling gates follow the ink burned, and end uncapped", () => {
  assert.deepEqual(nextGate(57_501_435), { at: 60_000_000, mult: 3, left: 2_498_565 });
  assert.deepEqual(nextGate(120_000_000), { at: 150_000_000, mult: null, left: 30_000_000 });
  assert.equal(nextGate(200_000_000), null);
  assert.equal(nextGate(null), null);
});

// Le 2026-09-24 : l'encadré du portefeuille se collait aux onglets et le
// compteur des Dark débordait sur sa bordure. Même marge que la boutique.
test("the wallet box keeps the same distance from the tabs as the shop's figures", () => {
  const stats = css.match(/\.stats \{[^}]*margin: (\d+)px/)[1];
  assert.match(css, new RegExp(`#pane-wallet > \\.hero:first-child \\{ margin-top: ${stats}px; \\}`));
});

// Le 2026-09-24 : deux cases grises en fin de ligne se lisaient éteintes. Le
// prix d'entrée prend le jaune de ce qu'on paie, le jeton un orange à lui seul.
test("every figure in the top row wears a colour, and the token's is its own", () => {
  const html = statsHtml(NODORM);
  assert.doesNotMatch(html, /st-book/);
  assert.match(html, /st-cost"><b>[^<]*<\/b><u>cheapest way in/);
  assert.match(html, /st-fuel"><b>[^<]*<\/b><u>\$PRINTER market/);
  assert.match(css, /\.st-fuel \{ background: var\(--fuel\); \}/);
  // L'orange ne sert qu'au jeton.
  assert.equal((css.match(/var\(--fuel\)/g) ?? []).length, 1);
});

// Le 2026-09-26 : 35,8 % ici, 55,7 % sur le terminal officiel, et des porteurs
// persuadés que l'un des deux était faux. C'est le même burn, sur deux bases.
test("the burn is given against what was minted, and against what is left", () => {
  const html = heroHtml({ ...DATA, burn: { minted: 200000000, supply: 128488565, burned: 71511435, share: 0.3576, ink: 57501435 } });
  assert.match(html, /<mark>35\.8%<\/mark> of the/);
  assert.match(html, /Measured against the 128,488,565 that remain rather than everything minted, that burn is <b>55\.7%<\/b> — the figure the official site shows\./);
});

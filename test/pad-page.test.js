import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { padHtml, sinceWords } from "../src/public/app.js";

const coin = (over = {}) => ({
  token: "0xT", symbol: "MEME", name: "Meme Coin", baseSymbol: "NVDA", base: "0xB",
  lockedUsd: 100, nominalUsd: 7400, progress: 0.25, graduated: false, traded: true, ...over,
});
const PAD = {
  launched: 3, graduated: 1, untouched: 1, creators: 2,
  lockedUsd: 11737, nominalUsd: 871579, unpriced: 0,
  bases: [
    { symbol: "NVDA", coins: 2, lockedUsd: 5697, graduated: 1 },
    { symbol: "PRINTER", coins: 1, lockedUsd: 4852, graduated: 0 },
  ],
  poolUsd: 34398, vol24hUsd: 166403, trades24h: 2117,
  coins: [
    // Graduer vide la courbe : une graduée lit zéro partout côté courbe, et
    // tout ce qu'elle vaut est dans sa pool.
    coin({ symbol: "JDOG", name: "Jensen's Dog", lockedUsd: 0, nominalUsd: 0, progress: 1,
      graduated: true, traded: true,
      pool: { poolUsd: 33024, capUsd: 106850, vol24hUsd: 164995, trades24h: 2038,
        pairAddress: "0x3e8eb60b000802e22f832a412f5491dc2d092449350ffb917455429642224963" } }),
    coin({ symbol: "BSNOB", baseSymbol: "PRINTER", lockedUsd: 2043, nominalUsd: 10359, progress: 0.789 }),
    coin({ symbol: "DEAD", lockedUsd: 0, nominalUsd: 0, progress: 0, traded: false }),
  ],
  readAt: 1, site: "https://www.printer.fun/",
};

test("the head states what was launched, what graduated and what nobody touched", () => {
  const html = padHtml(PAD);
  assert.match(html, /class="p-v">3<\/span><span class="p-k">coins launched/);
  assert.match(html, /class="p-v">1<\/span><span class="p-k">graduated/);
  assert.match(html, /class="p-v">1<\/span><span class="p-k">never bought/);
  assert.match(html, /class="p-v">\$11,737<\/span><span class="p-k">in the curves/);
  assert.match(html, /class="p-v">\$34,398<\/span><span class="p-k">in the pools/);
  assert.match(html, /class="p-v">2<\/span><span class="p-k">creators/);
});

// Les deux montants ne disent pas la même chose : la capitalisation porte sur
// tout le jeton émis, dont l'essentiel n'a jamais été acheté. Afficher la
// seconde seule ferait passer douze mille dollars pour huit cent mille.
test("the nominal cap never stands in for the money actually paid in", () => {
  const html = padHtml(PAD);
  // La capitalisation vit dans la phrase qui l'explique, pas en chiffre de tête
  // à côté de l'argent réel : côte à côte, on lit la plus grosse.
  assert.match(html, /combined cap of <b>\$871,579<\/b>/);
  assert.match(html, /most of which nobody has bought/);
  // 871579 / 11737 = 74.26 — deux décimales sur un rapport qui bouge de
  // plusieurs unités à chaque échange seraient une précision inventée.
  assert.match(html, /Here the curves imply <b>74×<\/b> the money actually in them/);
});

// Le pad annonce un frais de 1% qui rachète et brûle du $PRINTER, et un dixième
// au créateur : c'est la mécanique, elle est dite sur la page qui la mesure.
test("the page states the fee that drives the whole thing", () => {
  assert.match(padHtml(PAD), /<b>1% of every trade<\/b> buys back and burns \$PRINTER/);
  assert.match(padHtml(PAD), /a tenth of that fee goes to whoever launched/);
});

// Les graduées ne sont pas sur la courbe : elles ont leur table, en tête, et le
// classement porte sur celles qui y sont encore — les mortes comprises.
// Une pièce graduée s'échange pour de bon : le graphique est ce que le visiteur
// vient chercher, et l'adresse de la paire ne se déduit pas de celle du jeton.
test("a graduated coin links to its chart", () => {
  const html = padHtml(PAD);
  assert.match(html, /href="https:\/\/www\.dextools\.io\/app\/en\/robinhood\/pair-explorer\/0x3e8eb60b000802e22f832a412f5491dc2d092449350ffb917455429642224963"/);
  assert.match(html, /target="_blank" rel="noopener">JDOG<span class="p-go">chart<\/span>/);
});

// Sans paire lisible il n'y a pas de graphique à promettre : le nom reste nu
// plutôt que de mener à une page vide.
test("with no pair read the name carries no link to nowhere", () => {
  const html = padHtml({ ...PAD, coins: [
    coin({ symbol: "JDOG", graduated: true, traded: true,
      pool: { poolUsd: 1, capUsd: 1, vol24hUsd: 0, trades24h: 0, pairAddress: null } }),
  ] });
  assert.doesNotMatch(html, /dextools/);
  assert.doesNotMatch(html, /p-go/);
});

test("every coin is listed, the graduated apart from those still on a curve", () => {
  const html = padHtml(PAD);
  // Le nom d'une graduée porte le lien vers son graphique : il est dans une
  // ancre, et le relever demande de la traverser.
  const order = [...html.matchAll(/class="p-sym">(?:<a [^>]*>)?([A-Z]+)/g)].map((m) => m[1]);
  assert.deepEqual(order, ["JDOG", "BSNOB", "DEAD"]);
  assert.match(html, /The other 2, by how close they are to graduating/);
});

// C'est la course à la graduation qu'on regarde. Trié par argent, une pièce
// chère à graduer passe devant celle qui est sur le point d'y arriver.
test("the curve board is ranked by how close a coin is, not by how rich it is", () => {
  const html = padHtml({ ...PAD, coins: [
    coin({ symbol: "RICH", lockedUsd: 5000, progress: 0.10 }),
    coin({ symbol: "CLOSE", lockedUsd: 300, progress: 0.92 }),
    coin({ symbol: "MID", lockedUsd: 900, progress: 0.40 }),
  ] });
  const order = [...html.matchAll(/class="p-sym">(?:<a [^>]*>)?([A-Z]+)/g)].map((m) => m[1]);
  assert.deepEqual(order, ["CLOSE", "MID", "RICH"]);
});

// Les cent quarante-sept mortes sont toutes à zéro pour cent : à égalité, c'est
// l'argent qui départage, sinon leur ordre est celui du hasard.
test("coins tied at nothing are still ordered by the money in them", () => {
  const html = padHtml({ ...PAD, coins: [
    coin({ symbol: "AAA", lockedUsd: 1, progress: 0 }),
    coin({ symbol: "BBB", lockedUsd: 40, progress: 0 }),
    coin({ symbol: "CCC", lockedUsd: 12, progress: 0 }),
  ] });
  assert.deepEqual([...html.matchAll(/class="p-sym">(?:<a [^>]*>)?([A-Z]+)/g)].map((m) => m[1]), ["BBB", "CCC", "AAA"]);
});

// Une graduée a vidé sa courbe. Triée par argent immobilisé elle tombait au
// rang 126 sur 274, en gris, sous la mention « never traded » — l'exact
// contraire de ce qui lui est arrivé.
test("a graduated coin is never counted among those nobody ever bought", () => {
  const html = padHtml(PAD);
  const grad = html.slice(html.indexOf("Graduated"), html.indexOf("By base stock"));
  assert.match(grad, /1 of 3 filled their curve and moved to a real pool/);
  assert.match(grad, /JDOG/);
  assert.match(grad, /\$33,024/);      // sa pool
  assert.match(grad, /\$106,850/);     // sa capitalisation réelle
  assert.match(grad, /\$164,995/);     // son volume 24 h
  assert.match(grad, /2,038/);         // ses échanges
  // Elle ne reparaît pas éteinte dans le classement des courbes.
  const board = html.slice(html.indexOf("Still on the curve"));
  assert.doesNotMatch(board, /JDOG/);
});

// Ce que les graduées échangent en un jour pèse plus que tout ce que les
// courbes retiennent : le taire donnerait un pad qui a l'air mort.
test("what the graduated pools trade in a day is stated, not left aggregated away", () => {
  assert.match(padHtml(PAD), /traded <b>\$166,403<\/b> in the last 24 hours, over 2,117 trades/);
});

// Déployer la pool est un appel séparé : une courbe peut être pleine sans que
// la pièce ait gradué, et « 100% » tout court laisse croire que rien n'est
// arrivé au bout de la barre.
test("a full curve whose pool is not deployed yet says which of the two it is", () => {
  const html = padHtml({ ...PAD, graduated: 0, poolUsd: null, vol24hUsd: null,
    coins: [coin({ symbol: "PRINTSY", progress: 1, graduated: false, lockedUsd: 4067 })] });
  assert.match(html, /full — pool not deployed yet/);
  assert.doesNotMatch(html, /class="p-pct[^"]*">100%/);
});

// Une pièce encore sur sa courbe ne s'échange que sur printer.fun. Sans le
// chemin, le tableau la nomme et n'en dit pas plus : c'est une impasse.
test("a coin still on its curve links to where it can be bought", () => {
  const html = padHtml(PAD);
  const board = html.slice(html.indexOf("Still on the curve"));
  assert.match(board, /href="https:\/\/www\.printer\.fun\/coin\/0xT" target="_blank" rel="noopener">BSNOB/);
  // Même la morte : on peut vouloir aller voir pourquoi elle l'est.
  assert.match(board, />DEAD<span class="p-go">buy<\/span>/);
});

// Les onze bases s'étalaient sur toute la largeur : le montant finissait à
// mille neuf cents pixels de l'action qu'il chiffre.
test("the base list is held to a width where a figure stays near its name", () => {
  assert.match(padHtml(PAD), /<ul class="ballot p-bases">/);
  const css = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
  assert.match(css, /\.p-bases \{[^}]*max-width/);
});

// $14 sur $5 718 arrondit à zéro pour cent. Une base à quatorze dollars et une
// base réellement vide affichaient alors la même barre — c'est-à-dire aucune.
test("a base holding a few dollars is not drawn like one holding none", () => {
  const html = padHtml({ ...PAD, bases: [
    { symbol: "NVDA", coins: 2, lockedUsd: 5718, graduated: 1 },
    { symbol: "TSLA", coins: 10, lockedUsd: 14, graduated: 0 },
    { symbol: "AMZN", coins: 4, lockedUsd: 0, graduated: 0 },
  ] });
  // Le classement porte lui aussi des barres : on ne relève que celles des bases.
  const list = html.slice(html.indexOf("p-bases"), html.indexOf("</ul>"));
  const widths = [...list.matchAll(/b-bar"><span style="width:(\d+)%/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [100, 1, 0]);
});

// Un bloc de style inséré deux fois ne se voit pas — les règles sont
// identiques — et double pourtant le poids de la feuille à chaque copie.
test("the pad's stylesheet is declared once", () => {
  const css = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
  assert.equal((css.match(/---- PRINTER\.FUN ----/g) ?? []).length, 1);
  // Des sélecteurs qui n'apparaissent qu'une fois dans le bloc : `.p-go {` en
  // compterait deux, la règle de survol le contenant dans son propre texte.
  for (const rule of [/^  \.p-figs \{/gm, /^  \.p-wrap \{/gm, /^  \.p-table \{/gm, /^  \.p-lede \{/gm]) {
    assert.equal((css.match(rule) ?? []).length, 1, `règle en double : ${rule}`);
  }
});

// Les barres doivent partir de la même abscisse. Avec `min-width`, la colonne
// du milieu grandit avec son texte : « 116 coins · 2 graduated » poussait la
// barre de NVDA trente pixels plus loin que celle de PRINTER, et les deux
// seules lignes décalées étaient les deux qui portent une graduation.
test("a longer label cannot push its own bar out of line with the others", () => {
  const css = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
  const rule = css.match(/\n  \.b-sector \{[^}]*\}/)[0];
  assert.match(rule, /flex: none/);
  assert.match(rule, /width: \d+px/);
  assert.doesNotMatch(rule, /min-width/);
  // Et rien ne déborde : ce qui ne tient pas se coupe plutôt que d'élargir.
  assert.match(rule, /text-overflow: ellipsis/);
  assert.match(css, /\.p-bases \.b-name \{[^}]*flex: none/);
});

// --- ce qui bouge ---------------------------------------------------------

const MOVE = {
  since: 1000, windowMs: 86400000, partial: false,
  launched: 7, launchedTraded: 3, graduatedIn: 1,
  graduated: [{ token: "0xT", symbol: "TONER", baseSymbol: "PRINTER" }],
  inUsd: 1240, outUsd: 380, touched: 14,
  climbing: [{ token: "0xZ", symbol: "ZBIT", baseSymbol: "GME", deltaUsd: 29, wasProgress: 0.45, progress: 0.61 }],
  cooling: [{ token: "0xP", symbol: "PAPO", baseSymbol: "NVDA", deltaUsd: -54, wasProgress: 0.31, progress: 0.28 }],
};

test("the page opens on what moved, before what merely exists", () => {
  const html = padHtml({ ...PAD, movement: MOVE });
  assert.ok(html.indexOf("What is moving") < html.indexOf("coins launched"),
    "le mouvement doit précéder le recensement");
  assert.match(html, /class="p-v">\+7<\/span><span class="p-k">launched<\/span><span class="p-x">3 already traded/);
  assert.match(html, /class="p-v">\+\$1,240<\/span><span class="p-k">money in<\/span><span class="p-x">across 14 curves/);
});

// Entré et sorti ne se compensent pas en un seul chiffre : « +$860 net » cache
// que quatorze courbes ont bougé, et dans les deux sens.
test("money in and money out are shown apart, never netted", () => {
  const html = padHtml({ ...PAD, movement: MOVE });
  assert.match(html, /money in/);
  assert.match(html, /money out/);
  assert.doesNotMatch(html, /\bnet\b/);
});

// D'où elle vient compte autant que où elle est.
test("a mover shows the arc it travelled, not only where it stands", () => {
  const html = padHtml({ ...PAD, movement: MOVE });
  assert.match(html, /ZBIT.*45<i>&#8594;<\/i>61%/s);
  assert.match(html, /class="p-delta p-up">\+\$29/);
  assert.match(html, /PAPO.*31<i>&#8594;<\/i>28%/s);
  assert.match(html, /class="p-delta p-down">\u2212\$54/);
});

// « 100% → 100% » se lit comme une panne. Sur quatorze minutes l'arrondi ne
// bouge pas, alors que le montant, lui, a bougé — et c'est lui l'information.
test("a mover whose percentage did not budge states it once, not twice", () => {
  const html = padHtml({ ...PAD, movement: { ...MOVE,
    climbing: [{ token: "0xT", symbol: "TONER", baseSymbol: "PRINTER", deltaUsd: 36,
      wasProgress: 0.999, progress: 1 }], cooling: [] } });
  assert.match(html, /class="p-arc">at 100%</);
  assert.doesNotMatch(html, /100<i>/);
});

// « 7 lancées ces 24 h » et « 7 depuis qu'on regarde » ne sont pas la même
// affirmation, et la seconde est la seule vraie au premier jour.
test("a window shorter than a day says so instead of claiming a full day", () => {
  const html = padHtml({ ...PAD, movement: { ...MOVE, partial: true, since: Date.now() - 3600000 } });
  const when = html.match(/class="p-when">([^<]*)/)[1];
  assert.equal(when, "since 1 hour ago — all we have watched");
  // « last 24 hours » vit aussi dans la section des graduées, où il est vrai :
  // c'est l'étiquette de la fenêtre qui ne doit pas le prétendre.
  assert.doesNotMatch(when, /last 24 hours/);
});

test("with a full day behind it the window is simply named", () => {
  assert.equal(padHtml({ ...PAD, movement: MOVE }).match(/class="p-when">([^<]*)/)[1], "last 24 hours");
});

// Rien enregistré n'est pas un mouvement nul : la page n'a pas encore regardé.
// Laquelle a gradué vaut mieux que « 1 » : c'est le seul évènement du pad qui
// se raconte, et il porte un nom.
test("the coin that graduated is named, not merely counted", () => {
  assert.match(padHtml({ ...PAD, movement: MOVE }), /graduated<\/span><span class="p-x">TONER</);
});

test("with nothing recorded the moving block is absent, not shown at zero", () => {
  const html = padHtml({ ...PAD, movement: null });
  assert.doesNotMatch(html, /What is moving/);
  assert.match(html, /coins launched/);
});

test("a window in which nothing moved says exactly that", () => {
  const still = { ...MOVE, launched: 0, launchedTraded: 0, inUsd: 0, outUsd: 0, touched: 0,
    graduatedIn: 0, graduated: [], climbing: [], cooling: [] };
  assert.match(padHtml({ ...PAD, movement: still }), /Not one curve moved in that time/);
});

// Une pièce jamais échangée n'est pas à 0% de sa graduation : elle n'a jamais
// commencé. Une barre vide sous un pourcentage se lit comme un échec de départ.
test("a coin nobody ever bought says so instead of showing nothing at zero", () => {
  const html = padHtml(PAD);
  assert.match(html, /class="p-cold"/);
  assert.match(html, /never traded/);
  const css = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
  assert.match(css, /\.p-cold \.b-bar \{[^}]*visibility: hidden/);
});

// Une pièce graduée a quitté la courbe. Une barre pleine se lirait « sur le
// point de graduer », ce qui est le contraire.
test("a coin at a full curve that has not graduated is not dressed as one", () => {
  const ready = padHtml({ ...PAD, graduated: 0, poolUsd: null, vol24hUsd: null,
    coins: [coin({ symbol: "PRINTSY", progress: 1, graduated: false, lockedUsd: 3469 })] });
  assert.doesNotMatch(ready, /p-tag/);
  assert.doesNotMatch(ready, /class="label">Graduated/);
});

// Sans lecture, la page dit qu'elle n'a pas lu — elle n'annonce pas un pad vide.
test("with nothing read the page says so rather than showing an empty pad", () => {
  const html = padHtml(null);
  assert.match(html, /has not been read yet/);
  assert.doesNotMatch(html, /coins launched/);
});

// Un pad qu'aucun prix ne couvre garde ses comptes et tait ses dollars.
test("with no price for any base the counts hold and the dollars keep quiet", () => {
  const html = padHtml({ ...PAD, lockedUsd: null, nominalUsd: null, unpriced: 3,
    coins: PAD.coins.map((c) => ({ ...c, lockedUsd: null, nominalUsd: null })) });
  assert.match(html, /class="p-v">3<\/span><span class="p-k">coins launched/);
  assert.match(html, /class="p-v">—<\/span><span class="p-k">in the curves/);
  assert.doesNotMatch(html, /Here the curves imply/);
});

// Le nom d'une pièce vient d'un inconnu qui l'a lancée : il entre dans du
// balisage et il est échappé, quoi qu'il contienne.
test("nothing a stranger named reaches the page unescaped", () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const html = padHtml({ ...PAD,
    bases: [{ symbol: evil, coins: 1, lockedUsd: 1, graduated: 0 }],
    coins: [coin({ symbol: evil, name: evil, baseSymbol: evil })] });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

// L'onglet doit exister et pointer sur un pane, sans quoi le lien ne mène nulle part.
test("the tab and its pane are both declared", () => {
  const page = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
  assert.match(page, /data-tab="pad">PRINTER\.FUN</);
  assert.match(page, /id="pane-pad"/);
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /TABS = \["market", "wallet", "vote", "pad", "how"\]/);
  assert.match(app, /\$\("pad"\)\.innerHTML = padHtml/);
});

// Soixante-douze kilo-octets qui ne bougent qu'aux dix minutes n'ont rien à
// faire dans un snapshot qui repart toutes les quinze secondes : embarqués, ils
// voyageraient trente-neuf fois sur quarante pour rien.
test("the board travels on its own route, not on every snapshot", () => {
  const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(server, /req\.url === "\/api\/pad"/);
  // Un 304 est le seul intérêt d'une route qui sert la même chose dix minutes.
  assert.match(server, /if \(pad && req\.headers\["if-none-match"\] === etag\)/);
  const snapshot = readFileSync(new URL("../src/snapshot.js", import.meta.url), "utf8");
  assert.doesNotMatch(snapshot, /\bpad\b/);
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /fetch\("\/api\/pad"\)/);
});

// « since 1755948000000 » ne se lit pas.
test("how long ago is said in words, at the scale that reads", () => {
  const now = 100 * 3600000;
  assert.equal(sinceWords(now - 60000, now), "1 minute ago");
  assert.equal(sinceWords(now - 40 * 60000, now), "40 minutes ago");
  // « 60 minutes ago » se lirait comme une panne de conversion.
  assert.equal(sinceWords(now - 60 * 60000, now), "1 hour ago");
  assert.equal(sinceWords(now - 5 * 3600000, now), "5 hours ago");
  assert.equal(sinceWords(now - 50 * 3600000, now), "2 days ago");
  // Jamais « 0 minute ago » : on vient de regarder, c'est une minute.
  assert.equal(sinceWords(now, now), "1 minute ago");
});

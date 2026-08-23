import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { padHtml } from "../src/public/app.js";

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
      pool: { poolUsd: 33024, capUsd: 106850, vol24hUsd: 164995, trades24h: 2038 } }),
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
test("every coin is listed, the graduated apart from those still on a curve", () => {
  const html = padHtml(PAD);
  const order = [...html.matchAll(/class="p-sym">([A-Z]+)/g)].map((m) => m[1]);
  assert.deepEqual(order, ["JDOG", "BSNOB", "DEAD"]);
  assert.match(html, /The other 2, by money locked/);
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

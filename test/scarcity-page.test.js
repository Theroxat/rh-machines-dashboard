import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scarcityHtml } from "../src/public/app.js";

const SC = {
  vault: { held: 178, awake: 6, dormant: 172, weight: 600, total: 10000, share: 0.0178, circulating: 9822 },
  burn: { minted: 200000000, supply: 155814801, burned: 44185199, burnedShare: 0.2209,
    ink: 43285199, other: 900000, proton: 395000 },
  proton: { committed: 77, won: 54, lost: 22, pending: 1, lateDraws: 0,
    printerBurned: 395000, weightAdded: 21251, released: 0, complete: true },
  odds: { won: 54, lost: 22, done: 76, failRate: 0.2895, claimedFailRate: 0.2,
    expected: 15.2, sigma: 1.95, oneIn: 25 },
  owner: "0xA08c58FCC285D9Cd48b7122293C8a62446AA3d17",
};

// La distinction qui porte toute la page : un jeton brûlé est détruit, une
// machine au coffre peut revenir demain. Les confondre change ce qu'un floor
// veut dire.
test("locked machines are never called burned", () => {
  const html = scarcityHtml(SC);
  assert.match(html, /It is <b>not burned<\/b> — the collection is still ten thousand strong/);
  assert.match(html, /locked is not burned, and this page will not call it that/);
});

test("the vault states what it holds, what sleeps there, and what is left tradeable", () => {
  const html = scarcityHtml(SC);
  assert.match(html, /class="p-v">178<\/span><span class="p-k">in the vault<\/span><span class="p-x">1\.8% of the collection/);
  assert.match(html, /class="p-v">172<\/span><span class="p-k">of them dormant<\/span><span class="p-x">earning nothing/);
  assert.match(html, /class="p-v">9,822<\/span><span class="p-k">still tradeable/);
});

// Un porteur qui lit « enfermées » suppose « scellées ». Une seule clé peut les
// ressortir, et ce n'est écrit nulle part ailleurs.
test("the page says a single key can empty the vault", () => {
  const html = scarcityHtml(SC);
  assert.match(html, /owned by a single key — not a multi-signature wallet/);
  assert.match(html, /<b>releaseMachine<\/b>, which sends any Machine it holds to any address/);
  // Et qu'aucune n'est jamais sortie : accuser sans le dire serait malhonnête.
  assert.match(html, /Nothing has ever come back out so far/);
});

test("a machine taken back out of the vault is reported", () => {
  const html = scarcityHtml({ ...SC, proton: { ...SC.proton, released: 3 } });
  assert.match(html, /class="p-v">3<\/span><span class="p-k">released/);
  assert.doesNotMatch(html, /Nothing has ever come back out so far/);
});

// --- le burn ---------------------------------------------------------------

test("the burn is split into ink, everything else, and what is left", () => {
  const html = scarcityHtml(SC);
  // « 200000k » : le formateur court s'arrête aux milliers et rendait deux cents
  // millions illisibles.
  assert.match(html, /class="p-v">200,000,000<\/span><span class="p-k">ever minted/);
  assert.match(html, /class="p-v sc-down">155,814,801<\/span><span class="p-k">left today<\/span><span class="p-x">22\.1%/);
  assert.match(html, /class="p-v">43,285,199<\/span><span class="p-k">burned as ink/);
  assert.match(html, /class="p-v">900,000<\/span><span class="p-k">burned otherwise<\/span><span class="p-x">395,000 of it by the Proton/);
});

// La barre empilée doit couvrir exactement l'offre frappée, sinon elle ment
// sur la proportion qu'elle prétend montrer.
test("the stacked bar accounts for the whole mint and nothing more", () => {
  const html = scarcityHtml(SC);
  const widths = [...html.matchAll(/class="sc-(?:ink|oth|left)" style="width:([\d.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 3);
  assert.ok(Math.abs(widths.reduce((a, b) => a + b, 0) - 100) < 0.5,
    `les trois segments font ${widths.reduce((a, b) => a + b, 0)}%, pas 100%`);
});

test("with no ink figure the split is not drawn from a missing term", () => {
  const html = scarcityHtml({ ...SC, burn: { ...SC.burn, ink: null, other: null } });
  assert.doesNotMatch(html, /sc-stack/);
  assert.match(html, /class="p-k">left today/);
});

// --- le pari ---------------------------------------------------------------

// Publier le compte seul accuse ; le taire cache. Les deux, donc.
test("the observed rate comes with the odds that it is merely chance", () => {
  const html = scarcityHtml(SC);
  assert.match(html, /claims <b>80\.0%<\/b> success/);
  assert.match(html, /<b>28\.9%<\/b> have failed, against 15 expected out of 76/);
  assert.match(html, /a run this bad turns up about <b>once in 25<\/b>/);
  assert.match(html, /Worth watching, not yet worth believing/);
});

test("a run no worse than promised is not dressed as a warning", () => {
  const html = scarcityHtml({ ...SC, odds: { ...SC.odds, failRate: 0.18, oneIn: null } });
  assert.match(html, /at or below what was promised/);
  assert.doesNotMatch(html, /Worth watching/);
});

// Un taux calculé sur un échantillon amputé par la fenêtre de journaux serait
// faux, et il aurait l'air aussi sérieux que le vrai.
test("with too few rolls read, no rate is presented at all", () => {
  const html = scarcityHtml({ ...SC, odds: null });
  assert.match(html, /Too few rolls have been read/);
  assert.doesNotMatch(html, /have failed, against/);
});

test("an incomplete log walk is admitted in the footnote", () => {
  const html = scarcityHtml({ ...SC, proton: { ...SC.proton, complete: false } });
  assert.match(html, /it does not match: some fusions are missing/);
});

// Une révélation tardive n'est pas un dé perdu.
test("late draws are told apart from rolls genuinely lost", () => {
  const html = scarcityHtml({ ...SC, proton: { ...SC.proton, lateDraws: 4 } });
  assert.match(html, /4 of the losses were late draws/);
});

test("with nothing read the page says so rather than showing an empty vault", () => {
  const html = scarcityHtml(null);
  assert.match(html, /Not read yet/);
  assert.doesNotMatch(html, /in the vault/);
});

test("the tab and its pane are declared, and the page fetches its own route", () => {
  const page = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
  assert.match(page, /data-tab="scarcity">Scarcity</);
  assert.match(page, /id="pane-scarcity"/);
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /TABS = \["market", "wallet", "vote", "pad", "scarcity", "how"\]/);
  assert.match(app, /fetch\("\/api\/scarcity"\)/);
});

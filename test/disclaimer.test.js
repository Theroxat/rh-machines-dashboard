import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Une mention de provenance qui disparaît dans un remaniement est exactement le
// genre de régression qu'aucun autre test n'attraperait : la page continuerait
// de fonctionner parfaitement tout en laissant croire qu'elle est officielle.
const page = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "public", "index.html"),
  "utf8",
);

test("the browser tab says unofficial before the page is even read", () => {
  const title = page.match(/<title>([^<]*)<\/title>/)[1];
  assert.match(title, /unofficial/i);
});

// Le navigateur replie les espaces : on compare le texte tel qu'il s'affiche,
// pas tel qu'il est indenté dans le fichier.
const flat = page.replace(/\s+/g, " ");

test("a shared link carries the disclaimer into its preview", () => {
  assert.match(flat, /property="og:title" content="[^"]*[Uu]nofficial/);
  assert.match(flat, /property="og:description" content="[^"]*[Nn]ot built by, affiliated with, or endorsed/);
  assert.match(flat, /name="description" content="[^"]*[Uu]nofficial/);
});

test("the disclaimer sits above the fold, not only in the footer", () => {
  const first = page.indexOf('class="disclaimer"');
  const context = page.indexOf('id="context"');
  assert.ok(first !== -1, "the header carries no disclaimer");
  assert.ok(first < context, "the disclaimer must come before the numbers, not after them");
});

test("the full statement disclaims affiliation, endorsement, and advice", () => {
  const footer = flat.slice(flat.indexOf("<footer"));
  assert.match(footer, /[Nn]ot built by, affiliated with, or endorsed by the RH MACHINES team/);
  assert.match(footer, /places no orders/);
  assert.match(footer, /gives no advice/);
  assert.match(footer, /verify every price/i);
});

// Le tableau est déplié en blocs sous 760 px. Tout élément resté en display
// table dans ce conteneur se retrouve dans une boîte de largeur minimale : le
// caption y descendait en colonne, un mot par ligne. Rien d'autre ne l'attrape.
test("nothing keeps a table display inside the blockified mobile table", () => {
  const mobile = flat.slice(flat.indexOf("@media (max-width: 760px)"));
  assert.match(mobile, /table, tbody, tr, td \{ display: block/);
  assert.match(mobile, /caption \{ display: block/);
});

// Deux fois de suite, le layout mobile a été cassé par une règle desktop plus
// spécifique que la règle groupée qui devait la neutraliser. Chaque sélecteur
// que le desktop contraint doit être rappelé nommément dans le bloc mobile.
test("every desktop rule that constrains a cell is named again for mobile", () => {
  const cut = flat.indexOf("@media (max-width: 760px)");
  const desktop = flat.slice(0, cut);
  const mobile = flat.slice(cut);

  assert.match(desktop, /td\.half \{ width: 46%/, "the desktop rule this guards is gone — update the test");
  assert.match(mobile, /td\.half \{ width: auto/);
  assert.match(mobile, /\.cls-cell \{[^}]*width: auto/);
  assert.match(mobile, /table \{ min-width: 0/);
});

// Deux tentatives de correction ont échoué en silence : des remplacements de
// texte qui ne correspondaient à rien, laissant la vignette à 54px pendant que
// l'image passait à 60, et le badge ancré sur le bloc entier. Ni les tests ni
// le compte d'accolades ne l'attrapaient — la page restait valide, seulement
// fausse. Ces trois invariants le disent maintenant.
test("the badges are anchored to the picture, not to the whole chip", () => {
  const rule = (sel) => {
    const i = flat.indexOf(`${sel} {`);
    return i === -1 ? null : flat.slice(i, flat.indexOf("}", i));
  };
  const thumb = rule(".thumb");
  const chip = rule(".chip");

  assert.ok(thumb, "the picture needs its own positioned wrapper");
  assert.match(thumb, /position: relative/);
  assert.ok(chip && !/position: relative/.test(chip),
    "the chip must not be the anchor, or a bottom-anchored badge lands on the price");
});

test("the chip, its wrapper and the image agree on one width", () => {
  // Seulement la partie desktop : le bloc mobile redimensionne les trois d'un
  // coup dans une règle groupée, ce qui est légitime.
  const desktop = flat.slice(0, flat.indexOf("@media"));
  const widths = [...desktop.matchAll(/\.(chip|thumb) \{[^}]*width: (\d+)px/g)].map((m) => m[2]);
  const img = desktop.match(/\.chip img, \.chip \.noimg \{[^}]*width: (\d+)px/)[1];
  assert.ok(widths.length >= 2, "both the chip and its wrapper must state a width");
  assert.deepEqual([...new Set([...widths, img])], [img],
    `chip, thumb and image disagree: ${[...widths, img].join(", ")}`);
});

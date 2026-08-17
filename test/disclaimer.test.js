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

// Le tableau est déplié en blocs sous 760 px : tout élément resté en display
// table dans ce conteneur se retrouve dans une boîte de largeur minimale, et son
// texte descend en colonne. Rien d'autre ne l'attrape.
test("the mobile table is fully blockified", () => {
  const mobile = flat.slice(flat.indexOf("@media (max-width: 760px)"));
  assert.match(mobile, /table, tbody, tr, td \{ display: block/);
  // et plus aucun caption à traiter, puisqu'il n'y en a plus
  assert.doesNotMatch(flat, /<caption/);
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

test("the page declares its icon", () => {
  assert.match(flat, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
});

test("the page links to its author, and names the link for anyone who cannot see it", () => {
  assert.match(flat, /href="https:\/\/x\.com\/Theroxat"/);
  assert.match(flat, /aria-label="Theroxat on X"/);
  // le lien s'ouvre ailleurs sans donner la main à la page cible
  const link = flat.slice(flat.indexOf('class="x-link"'), flat.indexOf("</a>", flat.indexOf('class="x-link"')));
  assert.match(link, /rel="noopener"/);
});

// Un montant en dollars accompagne toujours un prix libellé dans une autre
// monnaie : il est le second, donc en retrait. Un seul portait la couleur du
// texte et ressortait plus que le prix qu'il traduisait.
test("every dollar figure on the page is set in the same, quieter colour", () => {
  const rules = [...flat.matchAll(/([.#][\w.-]+(?:\s+[.#][\w-]+)*)\s*\{([^}]*)\}/g)]
    .filter((m) => m[1].includes("usd"))
    .map((m) => [m[1], (m[2].match(/color:\s*([^;]+)/) || [, "(inherits)"])[1].trim()]);

  assert.ok(rules.length >= 4, "expected every dollar figure to declare a colour");
  const colours = [...new Set(rules.map(([, c]) => c))];
  assert.deepEqual(colours, ["var(--muted)"], `dollar figures disagree: ${JSON.stringify(rules)}`);
});

// Le contraste se mesure, il ne se juge pas : les montants en dollars et les
// numéros de machine étaient sous le seuil du petit texte, ce qui les rendait
// illisibles plutôt que discrets. Rien d'autre ne l'attrape — surtout pas moi,
// qui ne vois pas cette page.
test("every text colour clears the contrast threshold for small text", () => {
  const value = (name) => flat.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))[1];
  const luminance = (hex) => {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const paper = luminance(value("--paper"));
  for (const name of ["--text", "--muted", "--dim", "--ink", "--dormant", "--under", "--alarm"]) {
    const l = luminance(value(name));
    const ratio = (Math.max(l, paper) + 0.05) / (Math.min(l, paper) + 0.05);
    assert.ok(ratio >= 4.5, `${name} is ${ratio.toFixed(2)}:1 against the page, under the 4.5:1 needed for small text`);
  }
});

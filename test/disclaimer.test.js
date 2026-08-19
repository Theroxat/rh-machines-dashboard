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

// Les montants en dollars doivent s'accorder entre eux : un seul portait une
// couleur différente et ressortait plus que le prix qu'il traduisait. Le test
// vérifie l'accord, pas une teinte précise — celle-ci a le droit de changer.
test("every dollar figure on the page shares one colour", () => {
  const rules = [...flat.matchAll(/([.#][\w.-]+(?:\s+[.#][\w-]+)*)\s*\{([^}]*)\}/g)]
    .filter((m) => m[1].includes("usd"))
    .map((m) => [m[1], (m[2].match(/color:\s*([^;]+)/) || [, "(inherits)"])[1].trim()]);

  assert.ok(rules.length >= 4, "expected every dollar figure to declare a colour");
  assert.equal(new Set(rules.map(([, c]) => c)).size, 1,
    `dollar figures disagree: ${JSON.stringify(rules)}`);
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

// Les deux moitiés d'une case annoncent chacune leur prix d'entrée : elles
// jouent le même rôle et doivent donc avoir le même corps.
test("both headline prices are set at the same size", () => {
  const size = (sel) => flat.match(new RegExp(sel.replace(/[.]/g, "\\.") + "\\s*\\{[^}]*font-size:\\s*([\\d.]+)px"))[1];
  assert.equal(size(".shelf-price .price"), size(".cell-floor .price"));
  assert.equal(size(".shelf-price .usd-big"), size(".cell-floor .usd-big"));
  assert.equal(size(".shelf-price .unit"), size(".cell-floor .unit"));
});

// Le menu de vue est câblé sur un conteneur nommé : si la page perd ce
// conteneur, app.js lève au chargement et le tableau ne s'affiche plus du tout.
test("the page carries the container the view menu is wired to", () => {
  assert.match(page, /id="view"/);
  assert.match(page, /#view\s*\{/);
});

// La vue se lit dans une autre unité : sur mobile le filet vertical qui la
// sépare des filtres devient horizontal, sinon il sépare deux choses empilées.
test("the view keeps a rule between itself and the filters on a phone", () => {
  const mobile = page.slice(page.indexOf("@media (max-width: 760px)"));
  assert.match(mobile, /#view\s*\{[^}]*border-bottom/);
});

// Une x3 re-inkée pèse comme une x6 et se vendait au prix d'une x3 sans que
// rien ne le crie. Elle est cerclée, et c'est la seule chose entourée de la page.
test("a re-inked machine is ringed, in a colour used for nothing else", () => {
  assert.match(page, /--reink:/);
  assert.match(page, /\.chip\.is-reinked img[^{]*\{[^}]*var\(--reink\)/);
  const uses = (page.match(/var\(--reink\)/g) ?? []).length;
  assert.ok(uses >= 3, "le cercle, son doublage et le badge");
  // Si le rouge du re-encrage servait aussi aux erreurs, un poids doublé se
  // lirait comme une panne.
  assert.doesNotMatch(page, /\.(census|banner)[^{]*\{[^}]*var\(--reink\)/);
});

test("what a machine earns is coloured apart from what it costs", () => {
  assert.match(page, /\.chip \.earns[^}]*var\(--under\)/);
});

test("the page carries the line that explains the green figure", () => {
  assert.match(page, /id="drop-note"/);
  assert.match(page, /#drop-note\s*\{/);
});

// L'en-tête de la bande porte deux fois plus de caractères que « x1.5 » : sans
// garde il se coupe en deux lignes et cesse de ressembler aux sept autres.
test("the band's heading holds on one line, like every rarity heading", () => {
  assert.match(page, /\.best-row \.cls \{[^}]*white-space: nowrap/);
});

// Le champ demande une adresse publique et ne fait lire que la chaîne. Il ne
// doit jamais ressembler à un « connect wallet » : rien à signer, rien à approuver.
test("the wallet field asks to read an address, never to connect one", () => {
  // Le champ est bâti par le script : la page ne porte que la carte qui
  // l'accueille, et la feuille de style qui l'habille.
  assert.match(page, /id="wallet-card"/);
  assert.match(page, /#wallet-input\s*\{/);
  assert.doesNotMatch(page, /connect wallet/i);
  assert.doesNotMatch(page, /type="password"/);
});

// Le portefeuille précède les filtres : on demande d'abord « qui es-tu », on
// filtre le marché ensuite. L'inverse mettait la question personnelle après
// quatre menus qui ne la concernent pas.
test("the wallet field sits between the filters and the table", () => {
  const field = page.indexOf('id="wallet-card"');
  assert.ok(field > 0, "le champ doit exister");
  assert.ok(page.indexOf('class="filter-bar"') < field);
  assert.ok(field < page.indexOf('class="scroll"'));
});

// Hors du bandeau, rien ne le redessine : une adresse à moitié tapée ne peut
// pas disparaître sous les doigts, et il n'y a aucun nœud à réattacher.
test("the field lives outside the bar that redraws itself", () => {
  const bar = page.indexOf('class="context" id="context"');
  const field = page.indexOf('id="wallet-card"');
  assert.ok(bar < field, "le champ vient après le bandeau");
  assert.doesNotMatch(page.slice(bar, bar + 200), /wallet-card/);
});

// Il se fond dans la masse : même intitulé, même champ, même bordure que les
// filtres. En carte marquée dans le bandeau il se lisait comme une publicité
// posée au milieu des chiffres.
test("the field is built like the filters, not like a banner", () => {
  assert.match(page, /#wallet-input \{[^}]*var\(--paper-2\)/);
  assert.match(page, /#wallet-input \{[^}]*1px solid var\(--rule-2\)/);
  // Un bouton bordé, comme « clear » — pas un aplat ambre.
  assert.doesNotMatch(page, /\.w-go[^{]*\{[^}]*background: var\(--ink\)/);
});

// Ailleurs sur la page l'intitulé est au-dessus de sa commande ; ici il est à
// côté. Aligner sur le bas le faisait plonger sous la boîte de saisie.
test("the wallet label faces its field rather than sinking under it", () => {
  assert.match(page, /\.wallet-line \{[^}]*align-items: center/);
  assert.doesNotMatch(page, /\.wallet-line \.label \{[^}]*padding-bottom/);
});

// Le rouge dit « re-inkée » et l'ambre dit « un prix ». La rareté n'est ni l'un
// ni l'autre : son badge reste neutre, sinon il emprunte un sens qui n'est pas le sien.
test("the class badge borrows neither the re-inking red nor the price amber", () => {
  const rule = page.match(/\.cls-badge \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /var\(--reink\)|var\(--ink\)/);
  assert.match(rule, /bottom: 0; left: 0/);
});

// La vignette reste un lien vers le marché : un clic modifié ou du milieu doit
// continuer d'y mener. Seul le clic simple ouvre le panneau.
test("a modified click still goes to the marketplace", () => {
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  assert.match(app, /closest\("a\.chip"\)[\s\S]{0,220}metaKey[\s\S]{0,80}ctrlKey/);
  assert.match(app, /Escape[\s\S]{0,60}closeDetail/);
});

test("the page carries the panel the detail is painted into", () => {
  assert.match(page, /id="detail-panel"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /id="detail"[^>]*hidden/);
});

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

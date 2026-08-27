import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { composeSnapshot } from "../src/snapshot.js";

const classic = readFileSync(new URL("../src/public/classic/index.html", import.meta.url), "utf8");
const classicApp = readFileSync(new URL("../src/public/classic/app.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");

/**
 * L'archive est figée et servie contre l'API vivante. C'est un couplage
 * silencieux : un champ retiré du snapshot ne casse rien à la construction, ni
 * aux tests de la page actuelle — il casse l'archive, en production, sans un
 * bruit. Ce test est le seul endroit où ça se voit.
 */
test("every field the archived page reads is still served", () => {
  // Relevé sur l'archive elle-même le jour où elle a été figée. Une liste
  // écrite bat une expression régulière ici : le code lit `v.data` une fois
  // puis se sert d'une variable locale, donc aucun motif ne les attrape tous,
  // et un relevé qui en manque la moitié rassure sans rien garantir.
  const wanted = ["anvil", "collection", "eth", "ink", "legend", "pot",
    "protocol", "rows", "sources", "totals", "traitFilters", "vote"];
  for (const f of wanted) {
    assert.ok(classicApp.includes(f), `${f} n'apparaît plus dans l'archive — la liste a dérivé`);
  }

  const snap = composeSnapshot({
    grid: { rows: [], excluded: { unknownRarity: 0, unknownInk: 0, listingsOffGrid: 0 },
      totals: { inked: 0, dormant: 0, listed: 0 } },
    printer: { usd: 0.02 }, eth: { usd: 2400 },
    protocol: { epoch: "4", activationInk: "4250000000000000000000", printerSupply: 155e6 },
    stats: { floor: 0.08 }, book: { listed: 300 }, inkMeta: { readAt: 1, failures: 0 }, now: 2,
  });
  for (const f of wanted) {
    assert.ok(f in snap, `l'archive lit v.data.${f}, que le snapshot ne sert plus`);
  }
});

test("the archive loads its own script, not the current one", () => {
  assert.match(classic, /src="\/classic\/app\.js"/);
  assert.doesNotMatch(classic, /src="\/app\.js"/);
  assert.match(server, /req\.url === "\/classic\/app\.js"/);
  assert.match(server, /req\.url === "\/classic" \|\| req\.url === "\/classic\/"/);
});

// Quelqu'un qui atterrit sur l'archive doit savoir que c'en est une, et savoir
// en sortir. Sans ça elle finit partagée sur Discord comme si c'était le site.
test("the archive says it is one, and how to leave it", () => {
  assert.match(classic, /class="tag">Archived</);
  assert.match(classic, /back to the current site/);
  assert.match(classic, /<title>Archived — /);
});

test("the current site offers the way back", () => {
  assert.match(page, /href="\/classic">Old version</);
});

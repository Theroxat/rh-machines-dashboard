import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Le serveur monte tout au chargement — RPC, boucles, écoute. On ne peut pas
   l'importer pour l'éprouver, alors on lit ce qu'il fait. Ces tests ne
   remplacent pas un appel réel ; ils empêchent que les corrections d'un audit
   soient défaites sans que personne ne le remarque. */
const src = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const handler = src.slice(src.indexOf("const server = createServer"), src.indexOf("const started ="));

// `/?utm_source=twitter` ne valait pas `/` : comparée entière, l'adresse porte
// la chaîne de requête. Tout lien partagé avec un paramètre de suivi tombait
// sur « not found ».
test("routes match on the path, never on the whole URL", () => {
  assert.match(handler, /const path = url\.pathname/);
  assert.doesNotMatch(handler, /req\.url ===/,
    "une route compare encore l'adresse entière, chaîne de requête comprise");
  assert.doesNotMatch(handler, /req\.url\.startsWith/);
});

// Sans ce test, un POST sur n'importe quelle route rendait 200 et le corps
// entier — de quoi faire croire qu'une écriture avait été acceptée.
test("the service refuses anything but a read", () => {
  assert.match(handler, /req\.method !== "GET" && req\.method !== "HEAD"/);
  assert.match(handler, /writeHead\(405,[^)]*allow: "GET, HEAD"/);
  // Et le refus arrive avant la première route, sinon il ne refuse rien.
  assert.ok(handler.indexOf("405") < handler.indexOf('path === "/api/snapshot"'));
});

// La 404 était la seule sortie du service sans CSP, sans nosniff et sans refus
// d'encadrement.
test("every response carries the security headers, the 404 included", () => {
  // Découpé sur `res.end` plutôt que par une expression qui compterait les
  // parenthèses : `...cacheHeaders("page")` en contient, et une expression
  // paresseuse s'arrêtait dessus en croyant tenir la fin de l'appel.
  const writes = handler.split("res.writeHead(").slice(1)
    .map((chunk) => "res.writeHead(" + chunk.slice(0, chunk.indexOf("res.end")))
    .map((t) => [t]);
  assert.ok(writes.length >= 8, `seulement ${writes.length} réponses trouvées`);
  for (const w of writes) {
    // Soit les en-têtes sont posés sur place, soit ils viennent de l'objet
    // `headers` de la route — et le second cas n'est accepté que parce que le
    // test suivant vérifie que cet objet les contient toujours.
    assert.match(w[0], /securityHeaders\(\)|\bheaders\b/,
      `une réponse sort sans en-têtes de sécurité : ${w[0].slice(0, 70)}`);
  }

  const built = [...handler.matchAll(/const headers = \{[\s\S]*?\};/g)];
  assert.ok(built.length >= 3, "aucun objet d'en-têtes trouvé");
  for (const h of built) {
    assert.match(h[0], /securityHeaders\(\)/,
      `un objet d'en-têtes est bâti sans securityHeaders() : ${h[0].slice(0, 70)}`);
  }
});

/* La route portefeuille est la seule qui lise la chaîne à la demande. Elle
   n'est pas authentifiée, et valider l'adresse ne borne rien : il en existe
   2^160 de valides. C'est le nombre de lectures simultanées qui la protège. */
test("the wallet route is capped, and the cap is released even on a throw", () => {
  assert.match(src, /const WALLET_MAX_INFLIGHT = \d+/);
  const cap = Number(src.match(/const WALLET_MAX_INFLIGHT = (\d+)/)[1]);
  assert.ok(cap > 0 && cap <= 32, `plafond hors de portée : ${cap}`);
  assert.match(handler, /walletInflight >= WALLET_MAX_INFLIGHT/);
  assert.match(handler, /writeHead\(503,[^)]*retry-after/);
  // Sans le `finally`, un lancer en pleine lecture laisse le compteur en l'air
  // et huit erreurs ferment la route pour tout le monde, définitivement.
  assert.match(handler, /\} finally \{[\s\S]{0,400}walletInflight--/);
});

// Les soldes du porteur étaient lus un par un : dix-sept allers-retours par
// requête HTTP, sur un RPC public partagé qui alimente tout le reste du site.
test("wallet balances travel in one call, not one call each", () => {
  const fn = src.slice(src.indexOf("async function readWalletBalances"),
                       src.indexOf("const WALLET_MAX_INFLIGHT"));
  assert.match(fn, /readBalances\(/);
  assert.doesNotMatch(fn, /for \(const .* of stockTokens\)[\s\S]*await/,
    "les soldes sont relus en série");
});

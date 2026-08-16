import { test } from "node:test";
import assert from "node:assert/strict";
import { assetHash, assetPath, stampPage, cacheHeaders, securityHeaders, etagOf } from "../src/http.js";

test("the asset path changes whenever the asset does", () => {
  const a = assetHash("console.log(1)");
  const b = assetHash("console.log(2)");
  assert.notEqual(a, b);
  assert.equal(assetHash("console.log(1)"), a);   // et reste stable à contenu égal
  assert.match(a, /^[0-9a-f]{10}$/);
  assert.equal(assetPath(a), `/app.${a}.js`);
});

test("the page is stamped with the exact script it was built against", () => {
  const hash = assetHash("x");
  const html = stampPage(`<script type="module" src="/app.js"></script>`, hash);
  assert.match(html, new RegExp(`src="/app\\.${hash}\\.js"`));
  assert.doesNotMatch(html, /src="\/app\.js"/);
});

test("stamping a page with no script tag leaves it alone rather than corrupting it", () => {
  const html = "<p>no script here</p>";
  assert.equal(stampPage(html, assetHash("x")), html);
});

// La cause racine du 2026-08-16 : sans en-tête, Cloudflare a appliqué son défaut
// de 4 h aux .js, servant un ancien script contre une API à jour. Le HTML et
// l'API doivent revalider ; l'asset peut être caché à vie précisément parce que
// son URL change avec son contenu.
test("the page always revalidates, so a new script is picked up at once", () => {
  assert.match(cacheHeaders("page")["cache-control"], /no-cache/);
});

test("the hashed asset may be cached forever, because its URL is its content", () => {
  const cc = cacheHeaders("asset")["cache-control"];
  assert.match(cc, /max-age=\d{7,}/);
  assert.match(cc, /immutable/);
});

test("the unhashed fallback script is never cached, since its URL cannot change", () => {
  assert.match(cacheHeaders("asset-unversioned")["cache-control"], /no-cache/);
});

test("an unknown kind refuses to guess a caching policy", () => {
  assert.throws(() => cacheHeaders("something-else"), /unknown/i);
});

// ---- en-têtes de sécurité ----

test("the page forbids everything it does not need", () => {
  const csp = securityHeaders()["content-security-policy"];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);   // aucun script en ligne : rien à autoriser
  assert.match(csp, /img-src https:\/\/i2c\.seadn\.io/);
  assert.match(csp, /connect-src 'self'/);
});

// Le tampon UNOFFICIAL ne protège de rien si la page peut être encadrée dans un
// site qui, lui, se présente comme officiel.
test("the page cannot be framed by anyone", () => {
  const h = securityHeaders();
  assert.match(h["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(h["x-frame-options"], "DENY");
});

test("the browser is told not to sniff types, and not to leak where it came from", () => {
  const h = securityHeaders();
  assert.equal(h["x-content-type-options"], "nosniff");
  assert.match(h["referrer-policy"], /no-referrer/);
});

// ---- revalidation de l'API ----

test("the api revalidates rather than refusing to be stored, so a 304 is possible", () => {
  const cc = cacheHeaders("api")["cache-control"];
  assert.match(cc, /no-cache/);
  assert.doesNotMatch(cc, /no-store/);
});

test("an etag identifies a snapshot, and changes only when the snapshot does", () => {
  const a = etagOf('{"at":1000}');
  assert.equal(etagOf('{"at":1000}'), a);
  assert.notEqual(etagOf('{"at":2000}'), a);
  assert.match(a, /^"[0-9a-f]+"$/);   // guillemets : la syntaxe qu'exige If-None-Match
});

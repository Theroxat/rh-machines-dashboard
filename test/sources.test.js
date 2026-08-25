import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { SOURCES, SOURCE_KINDS, THIRD_PARTY_HOSTS } from "../src/sources.js";

const srcDir = new URL("../src/", import.meta.url);
const serverCode = readdirSync(srcDir)
  .filter((f) => f.endsWith(".js"))
  .map((f) => readFileSync(new URL(f, srcDir), "utf8"))
  .join("\n");

/**
 * Le garde-fou qui rend cette page auto-vérifiante : toute URL interrogée par le
 * service doit correspondre à un hôte déclaré. Ajouter une source de données
 * sans la déclarer casse la suite, plutôt que de laisser la page mentir par
 * omission — ce qu'on reproche justement au terminal officiel.
 */
test("no data source is queried without being declared", () => {
  const hosts = new Set(
    [...serverCode.matchAll(/https:\/\/([a-z0-9.-]+)/gi)]
      .map((m) => m[1].toLowerCase())
      // Ce qui n'est pas une source de données : la chaîne elle-même, et les
      // liens qu'on écrit dans la page sans jamais les appeler.
      .filter((h) => !/^rpc\.|seadn\.io|^opensea\.io$|dextools\.io|printer\.fun|^www\./.test(h)),
  );
  for (const h of hosts) {
    assert.ok(THIRD_PARTY_HOSTS.includes(h),
      `${h} est interrogé par le service et n'est pas déclaré dans SOURCES`);
  }
});

test("every declared host is actually used, so the page names nothing it does not query", () => {
  for (const h of THIRD_PARTY_HOSTS) {
    assert.ok(serverCode.includes(h), `${h} est déclaré et n'est appelé nulle part`);
  }
});

test("every entry carries a kind the page knows how to render", () => {
  for (const s of SOURCES) {
    assert.ok(SOURCE_KINDS[s.kind], `genre inconnu : ${s.kind}`);
    assert.ok(s.what && s.from, `entrée incomplète : ${JSON.stringify(s)}`);
  }
});

// Les trois piliers du tableau de bord. Si l'un passait de la chaîne à une API
// sans que la page le dise, tout ce qu'on en conclut changerait en silence.
test("weights, ownership and the pot are stated as chain reads", () => {
  const chainy = SOURCES.filter((s) => s.kind === "chain").map((s) => s.what).join(" | ");
  for (const w of [/Weight and ink/, /Who owns/, /pot waiting/]) {
    assert.match(chainy, w);
  }
});

// Le point le plus facile à taire, et le plus important : le sujet même du site
// ne vient pas de la chaîne.
test("the asking prices the whole site is about are stated as third-party data", () => {
  const prices = SOURCES.find((s) => /asking price/i.test(s.what));
  assert.equal(prices.kind, "api");
  assert.match(prices.from, /OpenSea/);
  // Et pourquoi il ne peut pas en être autrement.
  assert.match(prices.note, /signed off-chain/);
});

test("every dollar figure is stated as third-party data, with the reason", () => {
  const usd = SOURCES.find((s) => /dollar figure/i.test(s.what));
  assert.equal(usd.kind, "api");
  assert.match(usd.note, /never a price in dollars/);
  // La leçon payée deux fois : les paires sont épinglées par adresse.
  assert.match(usd.note, /pinned by address/);
});

test("what we compute ourselves is owned as such, not passed off as read", () => {
  const derived = SOURCES.filter((s) => s.kind === "derived");
  assert.ok(derived.length >= 3);
  assert.match(SOURCE_KINDS.derived.blurb, /where our mistakes live/);
});

// --- l'affichage ------------------------------------------------------------

test("the page groups by what a reader can do about each kind", async () => {
  const { sourcesHtml } = await import("../src/public/app.js");
  const html = sourcesHtml(SOURCES, SOURCE_KINDS);
  for (const k of Object.values(SOURCE_KINDS)) {
    assert.ok(html.includes(k.label), `le groupe « ${k.label} » manque`);
    assert.ok(html.includes(k.blurb), `l'explication de « ${k.label} » manque`);
  }
  // Lu en premier : c'est le socle, et le reste se lit par contraste.
  assert.ok(html.indexOf(SOURCE_KINDS.chain.label) < html.indexOf(SOURCE_KINDS.api.label));
});

test("every declared line reaches the page", async () => {
  const { sourcesHtml } = await import("../src/public/app.js");
  const html = sourcesHtml(SOURCES, SOURCE_KINDS);
  for (const s of SOURCES) {
    assert.ok(html.includes(s.what.replace(/&/g, "&amp;")), `« ${s.what} » n'est pas rendu`);
  }
});

// Le point qu'il serait le plus commode de taire.
test("the page says out loud that its own subject is not read from the chain", async () => {
  const { sourcesHtml } = await import("../src/public/app.js");
  const html = sourcesHtml(SOURCES, SOURCE_KINDS);
  const api = html.slice(html.indexOf(SOURCE_KINDS.api.label), html.indexOf(SOURCE_KINDS.derived.label));
  assert.match(api, /Every asking price on this site/);
  assert.match(api, /Every dollar figure on this site/);
});

test("nothing a third party wrote reaches the page unescaped", async () => {
  const { sourcesHtml } = await import("../src/public/app.js");
  const evil = '"><img src=x onerror=alert(1)>';
  const html = sourcesHtml([{ what: evil, kind: "chain", from: evil, note: evil }], SOURCE_KINDS);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("the section is declared in the page and drawn once", () => {
  const page = readFileSync(new URL("../src/public/index.html", import.meta.url), "utf8");
  assert.match(page, /id="sources"/);
  assert.match(page, /Where every number comes from/);
  const app = readFileSync(new URL("../src/public/app.js", import.meta.url), "utf8");
  // Redessiner une déclaration scellée toutes les quinze secondes n'a pas de sens.
  assert.match(app, /if \(v\.data\.sources && !\$\("sources"\)\.innerHTML\)/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadConfig, CLASSES, CLASS_BY_VALUE, PAD, PROTON } from "../src/config.js";

const RAW = {
  port: 3050,
  bookPollIntervalMs: 60000,
  inkPollIntervalMs: 600000,
  pelotonSize: 5,
  multicallBatchSize: 500,
  maxBookPages: 200,
  maxMetadataPages: 80,
  padPollIntervalMs: 120000,
  protonPollIntervalMs: 600000,
};

test("the seven sealed classes are declared in ascending order", () => {
  assert.deepEqual(CLASSES.map((c) => c.value), [100, 150, 200, 300, 400, 600, 1000]);
  assert.deepEqual(CLASSES.map((c) => c.label), ["x1", "x1.5", "x2", "x3", "x4", "x6", "x10"]);
  assert.equal(CLASSES.reduce((n, c) => n + c.docCount, 0), 10000);
  assert.equal(CLASS_BY_VALUE.get(600).label, "x6");
});

test("a valid environment yields a frozen config", () => {
  const cfg = loadConfig({ OPENSEA_API_KEY: "k" }, RAW);
  assert.equal(cfg.openseaApiKey, "k");
  assert.equal(cfg.port, 3050);
  assert.ok(Object.isFrozen(cfg));
});

test("a missing API key is refused rather than defaulted", () => {
  assert.throws(() => loadConfig({}, RAW), /OPENSEA_API_KEY/);
  assert.throws(() => loadConfig({ OPENSEA_API_KEY: "   " }, RAW), /OPENSEA_API_KEY/);
});

test("an out-of-range tunable is refused", () => {
  assert.throws(() => loadConfig({ OPENSEA_API_KEY: "k" }, { ...RAW, pelotonSize: 1 }), /pelotonSize/);
  assert.throws(() => loadConfig({ OPENSEA_API_KEY: "k" }, { ...RAW, port: 0 }), /port/);
  assert.throws(() => loadConfig({ OPENSEA_API_KEY: "k" }, { ...RAW, bookPollIntervalMs: "60000" }), /bookPollIntervalMs/);
});

// Une clé ajoutée au chargeur et oubliée dans config.json ne se voit qu'au
// démarrage suivant, et le service refuse alors de démarrer. Le fichier livré
// passe par le chargeur, ici, avant d'atteindre un conteneur.
test("the config.json we ship satisfies the loader that reads it", () => {
  const raw = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
  const cfg = loadConfig({ OPENSEA_API_KEY: "k" }, raw);
  assert.ok(Object.isFrozen(cfg));
  assert.equal(cfg.padPollIntervalMs, raw.padPollIntervalMs);
});

// Les deux factories du pad tournent en parallèle et partagent une trésorerie ;
// la seconde n'a pas remplacé la première. Les lire toutes les deux n'est pas
// un détail : une seule manque cent vingt et une pièces.
test("both pad factories are declared, and they are not the same one twice", () => {
  assert.equal(PAD.factories.length, 2);
  assert.equal(new Set(PAD.factories.map((a) => a.toLowerCase())).size, 2);
  for (const a of PAD.factories) assert.match(a, /^0x[0-9a-fA-F]{40}$/);
  assert.match(PAD.treasury, /^0x[0-9a-fA-F]{40}$/);
});

// Le coffre n'est pas un feu : il a un propriétaire et une porte. Les trois
// adresses sont distinctes, et les confondre ferait dire à la page qu'une
// machine sacrifiée est détruite.
test("the Proton, its vault and their owner are three distinct addresses", () => {
  const a = [PROTON.contract, PROTON.factory, PROTON.owner];
  for (const x of a) assert.match(x, /^0x[0-9a-fA-F]{40}$/);
  assert.equal(new Set(a.map((x) => x.toLowerCase())).size, 3);
  assert.equal(PROTON.claimedSuccessBps, 8000);
});

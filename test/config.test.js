import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, CLASSES, CLASS_BY_VALUE } from "../src/config.js";

const RAW = {
  port: 3050,
  bookPollIntervalMs: 60000,
  inkPollIntervalMs: 600000,
  pelotonSize: 5,
  multicallBatchSize: 500,
  maxBookPages: 200,
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

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCache, writeCache } from "../src/traits.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "rh-")), "traits.json");

test("a written cache reads back as the same map", () => {
  const path = tmp();
  const traits = new Map([[1, { weightClass: 100, desk: 3 }], [2, { weightClass: 1000, desk: 0 }]]);
  writeCache(path, traits);
  const back = readCache(path);
  assert.equal(back.size, 2);
  assert.deepEqual(back.get(2), { weightClass: 1000, desk: 0 });
});

test("a missing cache is not an error, just an absence", () => {
  assert.equal(readCache(join(tmpdir(), "definitely-absent-rh-cache.json")), null);
});

test("a corrupt cache is treated as absent rather than half-trusted", () => {
  const path = tmp();
  writeFileSync(path, "{ not json");
  assert.equal(readCache(path), null);
});

test("a cache entry with no rarity is dropped on read", () => {
  const path = tmp();
  writeFileSync(path, JSON.stringify({ 1: { weightClass: null, desk: 1 }, 2: { weightClass: 200, desk: 1 } }));
  const back = readCache(path);
  assert.equal(back.has(1), false);
  assert.equal(back.get(2).weightClass, 200);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.js";

test("an empty store has no data and says so", () => {
  const s = createStore();
  const v = s.get(1000);
  assert.equal(v.data, null);
  assert.equal(v.ageMs, null);
  assert.equal(v.lastError, null);
});

test("a failed update never overwrites the last good payload", () => {
  const s = createStore();
  s.succeed({ rows: ["good"] }, 1000);
  s.fail(new Error("OpenSea 503"), 2000);
  const v = s.get(3000);
  assert.deepEqual(v.data, { rows: ["good"] });
  assert.equal(v.at, 1000);
  assert.equal(v.ageMs, 2000);
  assert.equal(v.lastError, "OpenSea 503");
});

test("a later success clears the error and moves the timestamp", () => {
  const s = createStore();
  s.succeed({ n: 1 }, 1000);
  s.fail(new Error("boom"), 2000);
  s.succeed({ n: 2 }, 3000);
  const v = s.get(3500);
  assert.deepEqual(v.data, { n: 2 });
  assert.equal(v.lastError, null);
  assert.equal(v.ageMs, 500);
});

test("staleness is measured against the caller's own clock", () => {
  const s = createStore({ staleAfterMs: 5000 });
  s.succeed({ n: 1 }, 1000);
  assert.equal(s.get(3000).stale, false);
  assert.equal(s.get(9000).stale, true);
});

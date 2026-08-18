import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTORS, deskName } from "../src/desks.js";

test("the sixteen desks are sectors, in the order the chain indexes them", () => {
  assert.equal(SECTORS.length, 16);
  assert.equal(deskName(0), "energy");
  assert.equal(deskName(5), "health");
  assert.equal(deskName(9), "utilities");
  assert.equal(deskName(10), "real estate");
  assert.equal(deskName(15), "semis");
});

// Le desk n'est pas un ticker. Les nommer comme des actions faisait croire
// qu'on touchait double sur une action, alors que c'est sur un secteur.
test("no desk is named after a stock", () => {
  for (const s of SECTORS) assert.doesNotMatch(s, /^[A-Z]{3,5}$/);
});

test("an index outside the table names no sector rather than borrowing one", () => {
  assert.equal(deskName(16), null);
  assert.equal(deskName(-1), null);
  assert.equal(deskName(null), null);
  assert.equal(deskName(undefined), null);
  assert.equal(deskName(1.5), null);
});

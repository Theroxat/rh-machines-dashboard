import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTORS, deskName, crossCheckDesks } from "../src/desks.js";

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

// L'équipe ajoute le desk aux métadonnées. La chaîne reste l'autorité — elle ne
// bouge pas, l'autre est écrite après coup à la main — mais le jour où les deux
// se contrediront, il faut le voir plutôt que le supposer.
test("nothing to cross-check is not the same thing as agreement", () => {
  const r = crossCheckDesks({ deskIndex: new Map([[1, 9], [2, 10]]), meta: new Map([[1, {}], [2, {}]]) });
  assert.equal(r.checked, 0);
  assert.equal(r.agree, 0);
  assert.deepEqual(r.disagreements, []);
});

test("metadata that names the same sector as the chain is counted as agreeing", () => {
  const r = crossCheckDesks({
    deskIndex: new Map([[1, 9], [2, 10]]),
    meta: new Map([[1, { desk: "utilities" }], [2, { desk: "Real Estate" }]]),
  });
  assert.equal(r.checked, 2);
  assert.equal(r.agree, 2);
  assert.deepEqual(r.disagreements, []);
});

test("a sector the two sources name differently is reported, with both names", () => {
  const r = crossCheckDesks({
    deskIndex: new Map([[1, 9], [2, 9], [3, 10]]),
    meta: new Map([[1, { desk: "energy" }], [2, { desk: "energy" }], [3, { desk: "real estate" }]]),
  });
  assert.equal(r.agree, 1);
  assert.deepEqual(r.disagreements, [{ index: 9, ours: "utilities", published: "energy", count: 2 }]);
});

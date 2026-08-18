import { test } from "node:test";
import assert from "node:assert/strict";
import { readOwners, tokensOf } from "../src/owners.js";

const A = "0xAAAA" + "1".repeat(36);
const B = "0xBBBB" + "2".repeat(36);
const encoded = (addr) => "0x" + "0".repeat(24) + addr.slice(2).toLowerCase();

const fakeAggregate = (owners) => async (calls) =>
  calls.map((_, i) => {
    const o = owners[i];
    return o === null ? [false, "0x"] : [true, encoded(o)];
  });

test("the index answers both ways: token to owner, owner to tokens", async () => {
  const { byToken, byOwner } = await readOwners({
    aggregate3: fakeAggregate([A, B, A]), ids: [1, 2, 3], batchSize: 10,
  });
  assert.equal(byToken.get(1), A.toLowerCase());
  assert.deepEqual(byOwner.get(A.toLowerCase()), [1, 3]);
  assert.deepEqual(byOwner.get(B.toLowerCase()), [2]);
});

// Une adresse se saisit dans n'importe quelle casse, et deux graphies de la
// même adresse ne peuvent pas donner deux portefeuilles différents.
test("case never splits one wallet into two", async () => {
  const { byOwner } = await readOwners({ aggregate3: fakeAggregate([A]), ids: [1], batchSize: 10 });
  assert.deepEqual(tokensOf(byOwner, A.toUpperCase()), [1]);
  assert.deepEqual(tokensOf(byOwner, A.toLowerCase()), [1]);
  assert.deepEqual(tokensOf(byOwner, "  " + A + "  "), [1]);
});

test("a token whose owner could not be read is left out, never guessed", async () => {
  const { byToken, failures } = await readOwners({
    aggregate3: fakeAggregate([A, null]), ids: [1, 2], batchSize: 10,
  });
  assert.equal(byToken.has(2), false);
  assert.equal(failures, 1);
});

test("an address holding nothing gets an empty list, not an error", () => {
  assert.deepEqual(tokensOf(new Map(), B), []);
  assert.deepEqual(tokensOf(null, B), []);
  assert.deepEqual(tokensOf(new Map(), null), []);
});

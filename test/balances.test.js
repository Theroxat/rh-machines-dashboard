import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { readBalances } from "../src/balances.js";

const enc = (v) => ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [v]);
const TOKENS = [
  { address: "0x1111111111111111111111111111111111111111", decimals: 18 },
  { address: "0x2222222222222222222222222222222222222222", decimals: 6 },
  { address: "0x3333333333333333333333333333333333333333", decimals: 18 },
];

test("every balance is read in one call, not one call each", async () => {
  let rounds = 0;
  const aggregate3 = async (calls) => {
    rounds++;
    assert.equal(calls.length, 3, "les trois jetons doivent voyager ensemble");
    // Toutes les sous-lectures visent la même adresse : c'est le portefeuille
    // qu'on interroge, sur des jetons différents.
    for (const c of calls) assert.equal(c.callData, calls[0].callData);
    return [[true, enc(2n * 10n ** 18n)], [true, enc(1500000n)], [true, enc(0n)]];
  };
  const out = await readBalances({ aggregate3, address: "0x" + "a".repeat(40), tokens: TOKENS });
  assert.equal(rounds, 1, "un seul aller-retour");
  assert.deepEqual(out, [2, 1.5, 0]);
});

// Le retour suit l'ordre reçu. Indexé par adresse, un jeton listé deux fois
// écraserait son propre solde sans que personne ne voie la collision.
test("the result lines up with the list it was given", async () => {
  const dup = [TOKENS[0], TOKENS[1], TOKENS[0]];
  const aggregate3 = async () => [[true, enc(10n ** 18n)], [true, enc(2000000n)], [true, enc(10n ** 18n)]];
  const out = await readBalances({ aggregate3, address: "0x" + "b".repeat(40), tokens: dup });
  assert.equal(out.length, 3);
  assert.deepEqual(out, [1, 2, 1]);
});

// Un contrat qui ne répond pas n'est pas détenu. Zéro se lit ici sans ambiguïté
// — contrairement aux avoirs d'une machine, où un solde nul veut dire que le
// porteur a retiré, et où il fallait distinguer « vide » de « pas lu ».
test("a sub-call that fails counts as nothing held, not as a hole", async () => {
  const aggregate3 = async () => [[false, "0x"], [true, "0xdeadbeef"], [true, enc(5n * 10n ** 18n)]];
  const out = await readBalances({ aggregate3, address: "0x" + "c".repeat(40), tokens: TOKENS });
  assert.deepEqual(out, [0, 0, 5]);
});

test("an empty list asks the chain nothing at all", async () => {
  let called = false;
  await readBalances({ aggregate3: async () => { called = true; return []; }, address: "0x" + "d".repeat(40), tokens: [] });
  assert.equal(called, false);
});

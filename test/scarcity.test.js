import { test } from "node:test";
import assert from "node:assert/strict";
import { burnSplit, lockUp, fuseOdds, vaultIds, PRINTER_MINTED } from "../src/scarcity.js";

test("the mint is the figure the reconciliation lands on", () => {
  // 200 000 000 − 155 814 801.349 − 43 285 198.651 = exactement 900 000
  assert.equal(PRINTER_MINTED, 200_000_000);
  const b = burnSplit({ supply: 155_814_801.349, inkBurned: 43_285_198.651 });
  assert.equal(Math.round(b.other), 900_000);
  assert.equal(Math.round(b.burned), 44_185_199);
  assert.equal((b.burnedShare * 100).toFixed(1), "22.1");
});

test("the Proton's share of the burn is carried, being the only part we counted ourselves", () => {
  const b = burnSplit({ supply: 155_814_801, inkBurned: 43_285_198, protonBurned: 395_000 });
  assert.equal(b.proton, 395_000);
  assert.ok(b.proton < b.other, "le Proton ne peut pas brûler plus que le total hors encre");
});

// Sans l'encre publiée, la soustraction a un terme manquant. On ne présente pas
// un reste calculé sur un chiffre qu'on n'a pas.
test("with no ink figure the remainder is not invented", () => {
  const b = burnSplit({ supply: 155_814_801, inkBurned: null });
  assert.equal(b.ink, null);
  assert.equal(b.other, null);
  assert.equal(Math.round(b.burned), 44_185_199);
});

test("with no supply read there is no split at all", () => {
  assert.equal(burnSplit({ supply: null, inkBurned: 1 }), null);
});

// Si l'offre frappée n'était pas celle qu'on croit, le reste serait négatif.
// Publier « −100 000 brûlés autrement » serait absurde.
test("a remainder that would come out negative is held at nothing", () => {
  assert.equal(burnSplit({ supply: 199_000_000, inkBurned: 43_285_198 }).other, 0);
});

// --- le coffre --------------------------------------------------------------

// Le protocole annonce que le coffre active les machines et partage leurs
// revenus. Cent soixante-douze sur cent soixante-dix-huit dorment.
test("the vault says how many of its machines are actually running", () => {
  const l = lockUp({ held: 178, awake: 6, weight: 600, total: 10000 });
  assert.equal(l.dormant, 172);
  assert.equal(l.awake, 6);
  assert.equal(l.weight, 600);
});

// Un ratio d'annonces calculé sur dix mille se trompe d'autant que le coffre
// se remplit : ces machines-là ne peuvent pas être mises en vente.
test("what is left tradeable is the collection minus the vault", () => {
  assert.equal(lockUp({ held: 178, awake: 6, total: 10000 }).circulating, 9822);
  assert.equal((lockUp({ held: 178, awake: 6, total: 10000 }).share * 100).toFixed(2), "1.78");
});

test("an unread awake count leaves the dormant count unclaimed, not at zero", () => {
  const l = lockUp({ held: 178, awake: null, total: 10000 });
  assert.equal(l.dormant, null);
  assert.equal(l.held, 178);
});

test("nothing held and nothing known yield no vault rather than an empty one", () => {
  assert.equal(lockUp({ held: null, total: 10000 }), null);
  assert.equal(lockUp({ held: 178, total: 0 }), null);
});

// --- le pari ----------------------------------------------------------------

// Vingt et un échecs sur soixante-dix quand vingt pour cent sont annoncés :
// l'écart saute aux yeux et ne prouve rien.
test("the observed rate is stated with the odds it is merely chance", () => {
  const o = fuseOdds({ won: 49, lost: 21, claimedBps: 8000 });
  assert.equal(o.done, 70);
  assert.equal((o.failRate * 100).toFixed(0), "30");
  assert.equal(o.claimedFailRate, 0.2);
  assert.equal(o.expected.toFixed(1), "14.0");
  assert.equal(o.sigma.toFixed(2), "2.09");
  // Un tirage honnête ferait aussi mal environ une fois sur trente-trois.
  assert.ok(o.oneIn >= 30 && o.oneIn <= 36, `attendu ~33, obtenu ${o.oneIn}`);
});

// Sous l'attendu, il n'y a rien à signaler : « une fois sur 2 » sur un
// protocole plus généreux que promis serait une alerte absurde.
test("a run luckier than promised raises no alarm", () => {
  const o = fuseOdds({ won: 60, lost: 10, claimedBps: 8000 });
  assert.equal(o.oneIn, null);
  assert.ok(o.sigma < 0);
});

// Un seul tirage ne dit rien, mais ne doit pas casser le calcul.
test("a single roll yields a rate and no confident claim", () => {
  const o = fuseOdds({ won: 0, lost: 1, claimedBps: 8000 });
  assert.equal(o.failRate, 1);
  assert.equal(o.done, 1);
  assert.ok(o.oneIn >= 4 && o.oneIn <= 6, "un échec sur un tirage arrive une fois sur cinq");
});

test("with nothing resolved there are no odds to report", () => {
  assert.equal(fuseOdds({ won: 0, lost: 0 }), null);
});

// 2026-10-17 : le nœud avait élagué tous les transferts vers le coffre, la
// marche arrière n'en trouvait aucun, et la page affichait « 0 machines in the
// vault » quand `balanceOf(factory)` en comptait 2.
test("the vault's ids are trusted only when they add up to what it holds on-chain", () => {
  assert.deepEqual(vaultIds({ held: 2, ids: [100, 102] }), [100, 102]);
  assert.equal(vaultIds({ held: 2, ids: [] }), null);
  assert.equal(vaultIds({ held: 2, ids: [100, 101, 102] }), null);
  assert.equal(vaultIds({ held: null, ids: [100] }), null);
  assert.deepEqual(vaultIds({ held: 0, ids: [] }), []);
});

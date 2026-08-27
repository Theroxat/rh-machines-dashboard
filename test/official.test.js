import { test } from "node:test";
import assert from "node:assert/strict";
import { readOfficial, crossCheck, OFFICIAL_STATE } from "../src/official.js";
import { SOURCES, THIRD_PARTY_HOSTS } from "../src/sources.js";

const ok = (body) => async () => ({ ok: true, json: async () => body });
const STATE = {
  potUsd: 63496, locked: 18805, building: 44690, feesUsd: 24811,
  distributedUsd: 189350, machinesOnline: 7507, burnedPct: 22.5, factoryHeld: 273,
};

test("the pot is read whole, and split into what is locked and what is building", async () => {
  const o = await readOfficial(ok(STATE));
  assert.equal(o.potUsd, 63496);
  assert.equal(o.lockedUsd, 18805);
  assert.equal(o.buildingUsd, 44690);
  // Les deux moitiés doivent faire le tout, sinon on relaie une addition fausse.
  assert.ok(Math.abs(o.lockedUsd + o.buildingUsd - o.potUsd) < 2);
});

// Un service injoignable n'est pas un pot vide. La page doit retomber sur ce
// qu'elle lit elle-même plutôt que d'annoncer zéro.
test("an unreachable service yields nothing rather than a pot of zero", async () => {
  assert.equal(await readOfficial(async () => { throw new Error("down"); }), null);
  assert.equal(await readOfficial(async () => ({ ok: false })), null);
  assert.equal(await readOfficial(ok({ potUsd: null })), null);
  assert.equal(await readOfficial(ok({})), null);
});

test("a field the service stops sending leaves a hole, not a zero", async () => {
  const o = await readOfficial(ok({ potUsd: 63496 }));
  assert.equal(o.potUsd, 63496);
  assert.equal(o.lockedUsd, null);
  assert.equal(o.buildingUsd, null);
});

/* ── le recoupement ────────────────────────────────────────────────────────
   On relaie un chiffre qu'on ne dérive pas. Il faut donc vérifier qu'il reste
   cohérent avec ce qu'on lit soi-même : l'USDG déjà converti est une part du
   pot, jamais davantage. */
test("the converted balance is checked against the pot it is part of", () => {
  const c = crossCheck({ official: STATE, swapperUsdg: 38686 });
  assert.equal(c.disagrees, false);
  assert.ok(c.ratio > 0.6 && c.ratio < 0.62);
});

test("a converted balance larger than the whole pot is flagged, not relayed", () => {
  assert.equal(crossCheck({ official: STATE, swapperUsdg: 70000 }).disagrees, true);
  // Deux pour cent de marge : les deux lectures ne sont pas prises au même
  // instant, et un écart de cet ordre est du décalage, pas une contradiction.
  assert.equal(crossCheck({ official: STATE, swapperUsdg: 64000 }).disagrees, false);
});

test("with either figure missing there is nothing to cross-check", () => {
  assert.equal(crossCheck({ official: null, swapperUsdg: 100 }), null);
  assert.equal(crossCheck({ official: STATE, swapperUsdg: null }), null);
});

/* ── la provenance ─────────────────────────────────────────────────────────
   Le site reproche au terminal officiel de ne pas cadrer ses sources. Prendre
   son chiffre sans le déclarer serait pire que ce qu'on lui reproche. */
test("relying on the protocol's own service is declared, not hidden", () => {
  const host = new URL(OFFICIAL_STATE).host;
  assert.ok(THIRD_PARTY_HOSTS.includes(host), `${host} n'est pas déclaré dans SOURCES`);
  const line = SOURCES.find((s) => /pot/i.test(s.what));
  assert.ok(line, "le pot doit avoir sa ligne dans la table de provenance");
  assert.equal(line.kind, "api");
  assert.match(line.note ?? "", /no contract exposes/i);
});

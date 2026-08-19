import { test } from "node:test";
import assert from "node:assert/strict";
import { epochUsd } from "../src/pot.js";
import { cutUsd } from "../src/wallet.js";

// Les chiffres du terminal officiel, relevés le 2026-08-18 : six points de
// poids sur 11 400 pour un pot de $160 745 donnaient $84.60.
test("the split reproduces the figure the official terminal shows", () => {
  const v = epochUsd({ weight: 600, totalWeight: 1140002, potUsd: 160745 });
  assert.equal(v.toFixed(2), "84.60");
});

test("twice the weight is twice the cut, exactly", () => {
  const one = epochUsd({ weight: 100, totalWeight: 1140002, potUsd: 160745 });
  const two = epochUsd({ weight: 200, totalWeight: 1140002, potUsd: 160745 });
  assert.equal(two / one, 2);
});

test("a dormant machine earns nothing, and that is a fact not a gap", () => {
  assert.equal(epochUsd({ weight: 0, totalWeight: 1140002, potUsd: 160745 }), 0);
});

test("without a pot or a fleet weight no return is invented", () => {
  assert.equal(epochUsd({ weight: 100, totalWeight: 1140002, potUsd: null }), null);
  assert.equal(epochUsd({ weight: 100, totalWeight: 0, potUsd: 160745 }), null);
  assert.equal(epochUsd({ weight: null, totalWeight: 1140002, potUsd: 160745 }), null);
});

// Le pot n'est pas partagé au prorata du seul poids : il est découpé par desk
// et chaque machine compte double sur le sien. Deux machines de même poids sur
// des desks différents ne touchent donc pas pareil.
const FLEET = 1000000;
const SECTOR = new Array(16).fill(0); SECTOR[0] = 200000; SECTOR[1] = 50000;
const TALLY = new Array(16).fill(0); TALLY[0] = 60; TALLY[1] = 40;

test("two machines of equal weight on different desks are not paid the same", () => {
  const a = epochUsd({ weight: 100, deskIndex: 0, totalWeight: FLEET, potUsd: 100000, tally: TALLY, sectorWeight: SECTOR });
  const b = epochUsd({ weight: 100, deskIndex: 1, totalWeight: FLEET, potUsd: 100000, tally: TALLY, sectorWeight: SECTOR });
  assert.notEqual(a.toFixed(4), b.toFixed(4));
});

test("on the same desk, twice the weight is still exactly twice the cut", () => {
  const one = epochUsd({ weight: 100, deskIndex: 0, totalWeight: FLEET, potUsd: 100000, tally: TALLY, sectorWeight: SECTOR });
  const two = epochUsd({ weight: 200, deskIndex: 0, totalWeight: FLEET, potUsd: 100000, tally: TALLY, sectorWeight: SECTOR });
  assert.equal((two / one).toFixed(9), "2.000000000");
});

// Le total d'un portefeuille doit être la somme de ses machines, sinon la page
// affiche deux nombres qui se contredisent l'un l'autre.
test("a wallet's machines add up to the wallet's own total, to the cent", () => {
  const machines = [{ w: 200, d: 0 }, { w: 100, d: 1 }, { w: 100, d: 1 }];
  const perMachine = machines
    .map((m) => epochUsd({ weight: m.w, deskIndex: m.d, totalWeight: FLEET, potUsd: 100000, tally: TALLY, sectorWeight: SECTOR }))
    .reduce((a, b) => a + b, 0);

  const myByDesk = new Array(16).fill(0);
  for (const m of machines) myByDesk[m.d] += m.w;
  const whole = cutUsd({ tally: TALLY, myWeight: 400, myByDesk, potUsd: 100000, fleetWeight: FLEET, sectorWeight: SECTOR });
  assert.equal(perMachine.toFixed(6), whole.toFixed(6));
});

// Avant la première voix il n'y a pas de tranches : le partage à plat est alors
// la seule hypothèse honnête, et c'est celle du terminal officiel.
test("with no vote cast the split is flat, as the official terminal has it", () => {
  const v = epochUsd({ weight: 600, deskIndex: 0, totalWeight: 1140002, potUsd: 160745, tally: new Array(16).fill(0), sectorWeight: SECTOR });
  assert.equal(v.toFixed(2), "84.60");
  assert.equal(epochUsd({ weight: 600, totalWeight: 1140002, potUsd: 160745 }).toFixed(2), "84.60");
});

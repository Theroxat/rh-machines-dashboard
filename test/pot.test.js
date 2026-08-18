import { test } from "node:test";
import assert from "node:assert/strict";
import { epochUsd } from "../src/pot.js";

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveHeadwearLegend } from "../src/rarity.js";

const metaOf = (entries) => new Map(entries.map(([id, hw]) => [id, { image: "u", headwear: hw, body: "Sky" }]));
const traitsOf = (entries) => new Map(entries.map(([id, wc]) => [id, { weightClass: wc, desk: 0 }]));
const rowFor = (legend, label) => legend.byClass.find((r) => r.classLabel === label);

test("headwear is grouped under the class it always accompanies", () => {
  const legend = deriveHeadwearLegend({
    meta: metaOf([[1, "Blueberries"], [2, "Blueberries"], [3, "Ordinals"], [4, "Bitcoin Aura"]]),
    traits: traitsOf([[1, 1000], [2, 1000], [3, 400], [4, 400]]),
  });
  assert.deepEqual(rowFor(legend, "x10").headwear, ["Blueberries"]);
  assert.deepEqual(rowFor(legend, "x4").headwear, ["Bitcoin Aura", "Ordinals"]); // alphabetical
  assert.equal(rowFor(legend, "x10").count, 2);
  assert.equal(legend.ambiguous.length, 0);
});

test("wearing nothing is a headwear value, because on this collection it is the x6 tier", () => {
  const legend = deriveHeadwearLegend({
    meta: metaOf([[1, "None"]]),
    traits: traitsOf([[1, 600]]),
  });
  assert.deepEqual(rowFor(legend, "x6").headwear, ["None"]);
});

test("a headwear seen in two classes is reported as ambiguous, not filed under either", () => {
  const legend = deriveHeadwearLegend({
    meta: metaOf([[1, "Halo"], [2, "Halo"]]),
    traits: traitsOf([[1, 100], [2, 200]]),
  });
  assert.equal(legend.ambiguous.length, 1);
  assert.equal(legend.ambiguous[0].headwear, "Halo");
  assert.deepEqual(legend.ambiguous[0].classes, ["x1", "x2"]);
  assert.equal(rowFor(legend, "x1").headwear.includes("Halo"), false);
  assert.equal(rowFor(legend, "x2").headwear.includes("Halo"), false);
});

test("machines missing from either map are counted, never guessed at", () => {
  const legend = deriveHeadwearLegend({
    meta: metaOf([[1, "Halo"], [2, null]]),
    traits: traitsOf([[1, 100], [3, 100]]),
  });
  assert.equal(legend.unpaired, 2);   // #2 has no headwear, #3 has no metadata
  assert.equal(rowFor(legend, "x1").count, 1);
});

test("all seven classes appear even when nothing is known about them", () => {
  const legend = deriveHeadwearLegend({ meta: new Map(), traits: new Map() });
  assert.deepEqual(legend.byClass.map((r) => r.classLabel), ["x1", "x1.5", "x2", "x3", "x4", "x6", "x10"]);
  assert.deepEqual(rowFor(legend, "x6").headwear, []);
});

test("the legend names the headwear that a single machine wears", () => {
  const legend = deriveHeadwearLegend({
    meta: metaOf([[1, "Watcher Rings"]]),
    traits: traitsOf([[1, 150]]),
  });
  assert.equal(legend.headwearClass.get("Watcher Rings"), "x1.5");
});

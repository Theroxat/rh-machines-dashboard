import { CLASSES, CLASS_BY_VALUE } from "./config.js";

/**
 * Quel couvre-chef appartient à quelle classe — dérivé des données, pas écrit
 * en dur. Mesuré sur 2 400 machines le 2026-08-16 : les 25 valeurs de Headwear
 * correspondent chacune à exactement une classe, sans exception.
 *
 * La dérivation reste préférable à une table figée pour une raison précise :
 * si un couvre-chef apparaissait un jour dans deux classes, une table figée
 * continuerait d'afficher une correspondance fausse avec assurance. Ici il
 * ressort dans `ambiguous` et n'est classé nulle part.
 */
export function deriveHeadwearLegend({ meta, traits }) {
  const seen = new Map();   // headwear -> Set<classValue>
  let unpaired = 0;

  for (const [tokenId, t] of traits) {
    const m = meta.get(tokenId);
    if (t?.weightClass == null || !m || m.headwear == null) { unpaired++; continue; }
    if (!seen.has(m.headwear)) seen.set(m.headwear, new Set());
    seen.get(m.headwear).add(t.weightClass);
  }
  for (const tokenId of meta.keys()) {
    if (!traits.has(tokenId)) unpaired++;
  }

  const ambiguous = [];
  const headwearClass = new Map();   // headwear -> classLabel, sans les ambigus
  const perClass = new Map();

  for (const [headwear, classes] of seen) {
    const values = [...classes].sort((a, b) => a - b);
    if (values.length > 1) {
      ambiguous.push({ headwear, classes: values.map((v) => CLASS_BY_VALUE.get(v)?.label ?? String(v)) });
      continue;
    }
    const value = values[0];
    headwearClass.set(headwear, CLASS_BY_VALUE.get(value)?.label ?? String(value));
    if (!perClass.has(value)) perClass.set(value, []);
    perClass.get(value).push(headwear);
  }

  const counts = new Map();
  for (const [tokenId, t] of traits) {
    const m = meta.get(tokenId);
    if (t?.weightClass == null || !m || m.headwear == null) continue;
    if (!headwearClass.has(m.headwear)) continue;
    counts.set(t.weightClass, (counts.get(t.weightClass) ?? 0) + 1);
  }

  return {
    byClass: CLASSES.map((c) => ({
      classValue: c.value,
      classLabel: c.label,
      headwear: (perClass.get(c.value) ?? []).sort((a, b) => a.localeCompare(b)),
      count: counts.get(c.value) ?? 0,
    })),
    headwearClass,
    ambiguous: ambiguous.sort((a, b) => a.headwear.localeCompare(b.headwear)),
    unpaired,
  };
}

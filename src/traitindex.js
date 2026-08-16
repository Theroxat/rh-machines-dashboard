/** Background vaut « Acid Lime » sur les 10 000 machines : un filtre dessus ne
 *  distinguerait rien. Les trois autres traits varient et sont indexés. */
export const TRAIT_TYPES = Object.freeze(["Headwear", "Body", "Eyes"]);

const FIELD = Object.freeze({ Headwear: "headwear", Body: "body", Eyes: "eyes" });

/**
 * Pour chaque valeur de trait : combien existent, et combien sont en vente.
 * Les deux nombres comptent — `total` dit si le trait est rare, `listed` dit si
 * on peut en acheter un aujourd'hui. Une valeur sans aucune vente reste
 * affichée à zéro plutôt que masquée : « ça existe mais rien n'est en vente »
 * est une réponse, la disparition d'une ligne n'en est pas une.
 */
export function buildTraitIndex({ meta, listed, bodyTickers }) {
  const totals = {};
  const onSale = {};
  for (const type of TRAIT_TYPES) { totals[type] = new Map(); onSale[type] = new Map(); }

  for (const [tokenId, m] of meta) {
    const isListed = listed.has(tokenId);
    for (const type of TRAIT_TYPES) {
      const value = m?.[FIELD[type]];
      if (value == null) continue;
      totals[type].set(value, (totals[type].get(value) ?? 0) + 1);
      if (isListed) onSale[type].set(value, (onSale[type].get(value) ?? 0) + 1);
    }
  }

  const index = {};
  for (const type of TRAIT_TYPES) {
    index[type] = [...totals[type]]
      .map(([value, total]) => {
        const row = { value, total, listed: onSale[type].get(value) ?? 0 };
        // Seul le corps décide du desk, donc seul lui porte un ticker.
        if (type === "Body") row.ticker = bodyTickers?.get(value) ?? null;
        return row;
      })
      .sort((a, b) => a.value.localeCompare(b.value));
  }
  return index;
}

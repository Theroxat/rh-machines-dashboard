/** Background vaut « Acid Lime » sur les 10 000 machines : un filtre dessus ne
 *  distinguerait rien. Les trois autres traits varient et sont indexés. */
/** « Farms » d'abord : c'est la seule dimension mécanique des quatre. Le desk
 *  vient du Body, il est scellé au mint, et la machine touche le double sur la
 *  part achetée pour ce desk. Les trois autres traits sont cosmétiques. */
export const TRAIT_TYPES = Object.freeze(["Desk", "Headwear", "Body", "Eyes"]);

const FIELD = Object.freeze({ Headwear: "headwear", Body: "body", Eyes: "eyes" });

/** Le desk n'est pas un trait : c'est un secteur scellé au mint, que la chaîne
 *  publie. Il est indexé par tokenId, pas par couleur. */
const valueOf = (type, m, tokenId, deskOf) =>
  type === "Desk" ? (deskOf?.(tokenId) ?? null) : m?.[FIELD[type]];

/**
 * Pour chaque valeur de trait : combien existent, et combien sont en vente.
 * Les deux nombres comptent — `total` dit si le trait est rare, `listed` dit si
 * on peut en acheter un aujourd'hui. Une valeur sans aucune vente reste
 * affichée à zéro plutôt que masquée : « ça existe mais rien n'est en vente »
 * est une réponse, la disparition d'une ligne n'en est pas une.
 */
export function buildTraitIndex({ meta, listed, deskOf }) {
  const totals = {};
  const onSale = {};
  for (const type of TRAIT_TYPES) { totals[type] = new Map(); onSale[type] = new Map(); }

  for (const [tokenId, m] of meta) {
    const isListed = listed.has(tokenId);
    for (const type of TRAIT_TYPES) {
      const value = valueOf(type, m, tokenId, deskOf);
      if (value == null) continue;
      totals[type].set(value, (totals[type].get(value) ?? 0) + 1);
      if (isListed) onSale[type].set(value, (onSale[type].get(value) ?? 0) + 1);
    }
  }

  const index = {};
  for (const type of TRAIT_TYPES) {
    index[type] = [...totals[type]]
      .map(([value, total]) => ({ value, total, listed: onSale[type].get(value) ?? 0 }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }
  return index;
}

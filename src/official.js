/**
 * L'état que le protocole publie lui-même.
 *
 * Le pot ne se lit pas entièrement sur la chaîne. Aucun contrat n'expose de vue
 * qui l'additionne : `pendingFees`, `pot`, `lockedUsd` — aucune n'existe, c'est
 * vérifié. Le protocole le calcule hors chaîne en sommant des soldes à travers
 * quatre contrats et en les convertissant au cours du moment.
 *
 * Reproduire cette somme nous-mêmes donne environ 80% du total, et une part de
 * ce qu'on trouve — les réserves des courbes du memepad — n'est probablement
 * pas du frais de protocole. Publier une somme qu'on ne sait pas fermer serait
 * exactement ce qu'on reproche au terminal officiel.
 *
 * On prend donc leur chiffre, et on le dit. Leur API est exacte : ses champs
 * `burnedPct`, `machinesOnline` et `factoryHeld` correspondent au jeton près à
 * ce que la chaîne rend. C'est leur page qui affiche des valeurs figées, pas
 * leur service.
 *
 * Ce qu'on garde de nous : le solde USDG du swapper, lu sur la chaîne. Il sert
 * de recoupement — si les deux divergent d'un facteur, la page doit le dire
 * plutôt que de relayer un chiffre qu'elle ne contrôle plus.
 */
export const OFFICIAL_STATE = "https://www.rhmachines.com/api/state";

export async function readOfficial(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(OFFICIAL_STATE);
    if (!res.ok) return null;
    const s = await res.json();
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const pot = num(s.potUsd);
    if (pot === null) return null;
    return {
      potUsd: pot,
      // Deux moitiés, et elles ne veulent pas dire la même chose. `locked` est
      // la part que le vote en cours est en train de diviser ; `building` est
      // ce qui s'accumule pour le tirage suivant. Une machine allumée
      // aujourd'hui ne touche pas la première — elle ne compte qu'à partir de
      // l'epoch d'après.
      lockedUsd: num(s.locked),
      buildingUsd: num(s.building),
      feesUsd: num(s.feesUsd),
      distributedUsd: num(s.distributedUsd),
      machinesOnline: num(s.machinesOnline),
      burnedPct: num(s.burnedPct),
      factoryHeld: num(s.factoryHeld),
      at: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Le recoupement.
 *
 * On relaie un chiffre qu'on ne dérive pas : il faut donc surveiller qu'il
 * reste cohérent avec ce qu'on lit soi-même. L'USDG du swapper est une part du
 * pot — jamais plus. S'il le dépasse, ou si le pot annoncé s'effondre sous lui,
 * l'un des deux ment et la page ne doit pas choisir en silence.
 */
export function crossCheck({ official, swapperUsdg }) {
  if (!official?.potUsd || swapperUsdg === null || swapperUsdg === undefined) return null;
  const ratio = swapperUsdg / official.potUsd;
  return {
    swapperUsdg,
    potUsd: official.potUsd,
    ratio,
    // Le solde converti ne peut pas excéder le pot dont il fait partie.
    disagrees: ratio > 1.02,
  };
}

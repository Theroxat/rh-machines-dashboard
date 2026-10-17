/**
 * Ce qui quitte la circulation.
 *
 * Deux choses disparaissent dans cet écosystème, et elles ne disparaissent pas
 * de la même façon.
 *
 * Le $PRINTER brûle : il est détruit, l'offre baisse, personne ne peut le
 * ramener. C'est vérifiable en une lecture — `totalSupply()` suffit.
 *
 * Les machines, elles, ne brûlent pas. Elles partent au coffre du Proton et y
 * restent. `totalSupply` du NFT ne bouge pas d'un pouce : elles existent
 * toujours, elles ont juste changé de mains. Le coffre a un propriétaire qui
 * peut les ressortir quand il veut, donc « enfermées » n'est pas « détruites »,
 * et la page ne doit jamais laisser croire l'un pour l'autre.
 *
 * La distinction n'est pas de la pédanterie : elle décide de ce qu'un floor
 * veut dire. Une machine brûlée réduit l'offre pour toujours ; une machine au
 * coffre peut revenir sur le marché demain.
 */

/** L'offre frappée au départ. Le rapprochement le confirme au centième près :
 *  200 000 000 − offre actuelle − encre brûlée = exactement 900 000. */
export const PRINTER_MINTED = 200_000_000;

/**
 * La décomposition de ce qui a brûlé.
 *
 * L'encre est publiée par le protocole (`totalInkBurned`), le reste se déduit.
 * Il ne se déduit que si l'offre est lisible : sans elle, on ne présente pas
 * une soustraction dont un terme manque.
 */
export function burnSplit({ supply, inkBurned, protonBurned }) {
  if (supply == null) return null;
  const burned = PRINTER_MINTED - supply;
  const ink = inkBurned ?? null;
  // Ce qui a brûlé ailleurs qu'en encre : rachats du pad, du swap, du Proton.
  // Négatif voudrait dire que l'offre frappée n'est pas celle qu'on croit —
  // on se tait plutôt que de publier une soustraction absurde.
  const other = ink === null ? null : Math.max(0, burned - ink);
  return {
    minted: PRINTER_MINTED,
    supply,
    burned,
    burnedShare: burned / PRINTER_MINTED,
    ink,
    other,
    // Le Proton est une part connue de « other », mesurée sur ses évènements.
    proton: protonBurned ?? null,
  };
}

/**
 * Les machines au coffre.
 *
 * `dormant` est le chiffre qui compte : le protocole annonce que le coffre les
 * active et partage leurs revenus, et l'immense majorité n'est pas activée. Le
 * dire tient en un nombre, et personne d'autre ne le publie.
 */
export function lockUp({ held, awake, weight, total }) {
  if (held == null || !total) return null;
  return {
    held,
    awake: awake ?? null,
    dormant: awake === null || awake === undefined ? null : held - awake,
    weight: weight ?? null,
    total,
    share: held / total,
    // Ce qui reste réellement échangeable. Un ratio d'annonces calculé sur dix
    // mille se trompe d'autant que le coffre se remplit.
    circulating: total - held,
  };
}

/**
 * Le pari du Proton, et ce qu'on peut honnêtement en dire.
 *
 * Vingt et un échecs sur soixante-dix quand vingt pour cent sont annoncés :
 * l'écart saute aux yeux et ne prouve rien. Sur un tirage honnête, il survient
 * une fois sur trente-trois. La page publie les deux — le compte brut et la
 * probabilité qu'il ne soit qu'un hasard — parce que publier le premier seul
 * accuse, et taire les deux cache.
 */
export function fuseOdds({ won, lost, claimedBps }) {
  const done = (won ?? 0) + (lost ?? 0);
  if (!done) return null;
  // En points de base d'abord, division ensuite : `1 - 8000/10000` rend
  // 0.19999999999999996, et ce résidu remonte jusque dans l'affichage.
  const p = (10000 - (claimedBps ?? 8000)) / 10000;
  const expected = done * p;
  const sd = Math.sqrt(done * p * (1 - p));
  return {
    won, lost, done,
    failRate: lost / done,
    claimedFailRate: p,
    expected,
    // Combien d'écarts-types au-dessus de l'attendu, et une fois sur combien
    // un tirage honnête ferait pire. `null` si l'observé est sous l'attendu :
    // il n'y a alors rien à signaler.
    sigma: sd ? (lost - expected) / sd : null,
    oneIn: lost > expected ? Math.round(1 / upperTail(done, lost, p)) : null,
  };
}

/** P(X ≥ k) pour une binomiale. En logarithmes : 70 factorielle déborde. */
function upperTail(n, k, p) {
  const logFact = (x) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s; };
  let tail = 0;
  for (let i = k; i <= n; i++) {
    tail += Math.exp(logFact(n) - logFact(i) - logFact(n - i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return tail;
}

/**
 * Les identifiants des machines au coffre, quand on peut les croire.
 *
 * Ils viennent des journaux de transfert, que le nœud élague en quelques
 * heures ; le nombre, lui, vient de `balanceOf(factory)` et ne s'élague pas.
 * Le 2026-10-17 la marche arrière ne trouvait plus aucun transfert et la page
 * affichait un coffre vide qui en gardait 2. Une liste qui ne retombe pas sur
 * le compte de la chaîne est incomplète : on ne pèse pas ce qu'on n'a pas vu.
 */
export function vaultIds({ held, ids }) {
  if (held == null || ids.length !== held) return null;
  return ids;
}

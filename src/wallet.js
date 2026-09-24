import { deskName, SECTORS } from "./desks.js";

/** Une adresse, et rien d'autre. Ni ENS, ni nom, ni chaîne approchante : ce qui
 *  entre ici sert à interroger un index et à ressortir dans du balisage. */
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const isAddress = (s) => typeof s === "string" && ADDRESS_RE.test(s.trim());

/**
 * Ce qu'un portefeuille toucherait, et pour quoi il a intérêt à voter.
 *
 * La part d'une machine est proportionnelle à son poids sur chaque tranche, et
 * double sur celle de son propre desk. En sommant les tranches :
 *
 *     part(moi) = pot × Σ_s  (voix_s / voix_totales) × (monPoids + monPoids_s)
 *                                                     ÷ (poidsFlotte + poids_s)
 *
 * Le terminal officiel annonce `monPoids / poidsFlotte × pot`, qui ignore que
 * le doublement de chaque desk dilue tous les autres. Les deux chiffres sont
 * proches et le nôtre est le bon ; l'écart est nommé plutôt que caché.
 */
export function cutUsd({ tally, myWeight, myByDesk, potUsd, fleetWeight, sectorWeight }) {
  if (!potUsd || !fleetWeight) return null;
  const votes = tally.reduce((a, b) => a + b, 0);
  if (!votes) return null;

  let sum = 0;
  for (let s = 0; s < tally.length; s++) {
    const w = fleetWeight + (sectorWeight[s] ?? 0);
    if (!w) continue;
    sum += (tally[s] / votes) * ((myWeight + (myByDesk[s] ?? 0)) / w);
  }
  return potUsd * sum;
}

/**
 * Pour quel desk voter.
 *
 * On compare ce que le portefeuille toucherait selon le desk sur lequel il pose
 * tout son poids. Le meilleur est celui où il a le plus de poids **et** dont le
 * desk est le plus petit : sur un gros desk tous les voisins doublent en même
 * temps que vous et l'effet se dilue.
 *
 * L'écart tient souvent en centimes — un portefeuille pèse rarement assez pour
 * déplacer un scrutin. C'est un fait, pas un défaut du calcul, et il est rendu
 * tel quel plutôt que gonflé : `gainUsd` dit ce que le vote rapporte vraiment.
 */
export function voteAdvice({ tally, myWeight, myByDesk, potUsd, fleetWeight, sectorWeight, tickers = [] }) {
  const base = cutUsd({ tally, myWeight, myByDesk, potUsd, fleetWeight, sectorWeight });
  if (base === null) return null;

  const options = [];
  for (let s = 0; s < SECTORS.length; s++) {
    // Un desk sans ticker n'est pas sur le bulletin de cette epoch : on ne peut
    // pas y voter, donc il n'est pas conseillé.
    if (!tickers[s]) continue;
    const cast = tally.slice();
    cast[s] += myWeight;
    const withVote = cutUsd({ tally: cast, myWeight, myByDesk, potUsd, fleetWeight, sectorWeight });
    options.push({
      index: s,
      desk: deskName(s),
      ticker: tickers[s],
      held: (myByDesk[s] ?? 0) > 0,
      heldWeight: myByDesk[s] ?? 0,
      cutUsd: withVote,
      gainUsd: withVote - base,
    });
  }
  if (!options.length) return null;

  options.sort((a, b) => b.cutUsd - a.cutUsd || a.index - b.index);
  return { base, options, best: options[0] };
}

/**
 * Ce que le scrutin donnerait si un desk raflait tout. C'est le seul chiffre
 * qui dit ce que le vote pèse réellement : un bulletin isolé rapporte des
 * centimes, l'issue du scrutin rapporte des dizaines de dollars.
 */
export function sweepCut(s, { myWeight, myByDesk, potUsd, fleetWeight, sectorWeight }) {
  const only = new Array(SECTORS.length).fill(0);
  only[s] = 1;
  return cutUsd({ tally: only, myWeight, myByDesk, potUsd, fleetWeight, sectorWeight });
}

/** Le portefeuille : ses machines, son poids, sa part, son conseil. */
export function analyseWallet({
  address, tokenIds, weightOf, deskOf, epochUsdOf, imageOf, holdsOf, burnedOf, darkOf,
  tally, potUsd, fleetWeight, sectorWeight, tickers = [],
}) {
  const machines = tokenIds.map((tokenId) => {
    const weight = weightOf(tokenId) ?? 0;
    const index = deskOf(tokenId);
    // Brûlée au Meltdown : la chaîne lui laisse son poids, l'équipe dit qu'elle
    // ne touchera plus rien. Le portefeuille le montre, et ne lui promet rien.
    const burned = burnedOf ? burnedOf(tokenId) === true : false;
    // Forgée au Rituel noir : sans poids selon l'équipe, payée ailleurs.
    const dark = darkOf ? darkOf(tokenId) === true : false;
    return {
      tokenId,
      weight,
      deskIndex: index ?? null,
      desk: deskName(index),
      ticker: index === null || index === undefined ? null : (tickers[index] ?? null),
      burned,
      dark,
      epochUsd: epochUsdOf && !burned && !dark ? epochUsdOf(weight, tokenId) : null,
      // De quoi dessiner la machine plutôt que de la nommer : la page du
      // portefeuille était la seule à parler de machines sans en montrer une.
      image: imageOf ? imageOf(tokenId) : null,
      holds: holdsOf ? holdsOf(tokenId) : null,
    };
  }).sort((a, b) => b.weight - a.weight || a.tokenId - b.tokenId);

  const myByDesk = new Array(SECTORS.length).fill(0);
  let myWeight = 0;
  for (const m of machines) {
    myWeight += m.weight;
    if (m.deskIndex !== null) myByDesk[m.deskIndex] += m.weight;
  }

  // Une machine dormante pèse zéro : elle est là, elle ne vote pas et ne touche
  // rien. La compter comme absente cacherait qu'il suffit de l'activer.
  const awake = machines.filter((m) => m.weight > 0).length;

  const advice = myWeight
    ? voteAdvice({ tally, myWeight, myByDesk, potUsd, fleetWeight, sectorWeight, tickers })
    : null;

  return {
    address,
    machines,
    awake,
    dormant: machines.length - awake,
    weight: myWeight,
    share: fleetWeight ? myWeight / fleetWeight : null,
    byDesk: myByDesk
      .map((weight, index) => ({ index, desk: deskName(index), ticker: tickers[index] ?? null, weight }))
      .filter((d) => d.weight > 0)
      .sort((a, b) => b.weight - a.weight),
    cutUsd: advice?.base ?? null,
    advice,
  };
}

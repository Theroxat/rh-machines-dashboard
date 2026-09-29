import { deskName, SECTORS } from "./desks.js";
import { leaderOf } from "./pot.js";

/** Une adresse, et rien d'autre. Ni ENS, ni nom, ni chaîne approchante : ce qui
 *  entre ici sert à interroger un index et à ressortir dans du balisage. */
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const isAddress = (s) => typeof s === "string" && ADDRESS_RE.test(s.trim());

/**
 * Ce qu'un portefeuille toucherait si le vote se closait maintenant.
 *
 * Depuis le 27 août le desk le plus voté rafle le pot, et ses machines comptent
 * double (voir `epochUsd`). Avec `g` le desk en tête :
 *
 *     part(moi) = pot × (monPoids + monPoids_g) ÷ (poidsGagnant + poids_g)
 *
 * — exactement la somme des parts de chaque machine. Sans voix, le partage à
 * plat. `fleetWeight` et `sectorWeight` sont le poids des machines qui gagnent.
 */
export function cutUsd({ tally, myWeight, myByDesk, potUsd, fleetWeight, sectorWeight }) {
  if (!potUsd || !fleetWeight) return null;
  const g = leaderOf(tally);
  if (g === null) return (potUsd * myWeight) / fleetWeight;
  const denom = fleetWeight + (sectorWeight?.[g] ?? 0);
  return denom ? (potUsd * (myWeight + (myByDesk[g] ?? 0))) / denom : null;
}

/**
 * Pour quel desk voter.
 *
 * Le gagnant rafle tout : ce qui compte est ce que le portefeuille toucherait
 * **si ce desk gagnait** (`ifWinsUsd`). Le meilleur est celui où il pèse le
 * plus et qui est le plus petit — ses machines y comptent double, et un petit
 * desk dilue moins.
 *
 * `gainUsd` dit ce que ce seul bulletin change à l'issue telle qu'elle se
 * dessine : presque toujours zéro, parce qu'un portefeuille déplace rarement le
 * desk en tête. C'est rendu tel quel plutôt que gonflé.
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
      ifWinsUsd: sweepCut(s, { myWeight, myByDesk, potUsd, fleetWeight, sectorWeight }),
    });
  }
  if (!options.length) return null;

  options.sort((a, b) => b.ifWinsUsd - a.ifWinsUsd || a.index - b.index);
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
  address, tokenIds, weightOf, deskOf, epochUsdOf, imageOf, holdsOf, burnedOf, darkOf, blueOf,
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
    // Remise par le contrat Blue : rien ne dit qu'elle touche le pot.
    const blue = !dark && blueOf ? blueOf(tokenId) === true : false;
    return {
      tokenId,
      weight,
      deskIndex: index ?? null,
      desk: deskName(index),
      ticker: index === null || index === undefined ? null : (tickers[index] ?? null),
      burned,
      dark,
      blue,
      epochUsd: epochUsdOf && !burned && !dark && !blue ? epochUsdOf(weight, tokenId) : null,
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

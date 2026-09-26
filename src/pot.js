import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";

/**
 * Le pot : les frais de vente encaissés en USDG, en attente d'être dépensés en
 * actions au prochain scrutin clos.
 *
 * Aucun contrat ne l'expose sous un nom. C'est le solde USDG du SWAPPER —
 * celui qui achètera — et rien d'autre n'en détient : sur les sept contrats du
 * protocole, six sont à zéro. Relevé le 2026-08-18 à $160 790, quand le
 * terminal officiel affichait $160 745 quelques minutes plus tôt.
 */
const ERC20 = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export async function readPot({ provider }) {
  try {
    const [balRaw, decRaw] = await Promise.all([
      provider.call({ to: ADDRESSES.USDG, data: ERC20.encodeFunctionData("balanceOf", [ADDRESSES.SWAPPER]) }),
      provider.call({ to: ADDRESSES.USDG, data: ERC20.encodeFunctionData("decimals", []) }),
    ]);
    if (balRaw === "0x" || decRaw === "0x") return null;
    const bal = ERC20.decodeFunctionResult("balanceOf", balRaw)[0];
    const dec = Number(ERC20.decodeFunctionResult("decimals", decRaw)[0]);
    return Number(ethers.formatUnits(bal, dec));
  } catch {
    return null;
  }
}

/**
 * Le desk en tête du scrutin : celui qui rafle le pot si le vote se clôt
 * maintenant. `null` tant qu'aucune voix n'est tombée. À égalité, le plus petit
 * index — une convention, pas une affirmation sur la règle du contrat.
 */
export function leaderOf(tally) {
  let best = null;
  for (let s = 0; s < (tally?.length ?? 0); s++) {
    if (tally[s] > 0 && (best === null || tally[s] > tally[best])) best = s;
  }
  return best;
}

/**
 * Ce qu'une machine toucherait si le pot était distribué maintenant.
 *
 * Deux faits l'ont réécrite le 2026-09-26.
 *
 * Le gagnant rafle tout. Le drop du 21 août était découpé en tranches au
 * prorata des voix — vérifié à 0,3 % près — mais depuis le 27 août chaque drop
 * ne contient qu'une action (AMD, AAPL, NVDA) : le desk le plus voté prend le
 * pot entier, et ses machines comptent double. Pour une machine de poids `w`
 * sur le desk `k`, avec `g` le desk gagnant :
 *
 *     part = pot × w × (k = g ? 2 : 1) ÷ (W + W_g)
 *
 * — la formule vérifiée le 21 août, réduite à une seule tranche.
 *
 * Et `W` est le poids des machines qui gagnent, pas celui de la chaîne. Les
 * brûlées du Meltdown gardent leur poids sur MINE, mais le terminal officiel
 * divise par « earning weight » (17 554 contre 22 812) et leur annonce « earn
 * nothing ». Diviser par le poids de la chaîne sous-estimait chaque part d'un
 * quart. L'appelant passe donc le poids des gagnantes, total et par desk.
 *
 * Sans voix, pas de gagnant : le partage à plat, `pot × w ÷ W`, est la seule
 * hypothèse honnête, et c'est celle du terminal officiel.
 */
export function epochUsd({ weight, deskIndex = null, totalWeight, potUsd, tally = null, sectorWeight = null }) {
  if (!potUsd || !totalWeight) return null;
  if (weight === null || weight === undefined) return null;
  const g = leaderOf(tally);
  if (g === null || !sectorWeight) return (potUsd * weight) / totalWeight;
  const denom = totalWeight + (sectorWeight[g] ?? 0);
  if (!denom) return null;
  return (potUsd * weight * (deskIndex === g ? 2 : 1)) / denom;
}

/**
 * Le poids qui partage le pot : celui des machines qui gagnent, au total et par
 * desk. Ni l'adresse morte, ni les brûlées, ni les Dark — elles gardent un poids
 * sur la chaîne que le protocole ne paie plus. Une machine dont le statut n'a
 * pas été lu n'y entre pas : on ne la suppose pas payée.
 */
export function earningWeight({ weights, deskIndex, isEarning }) {
  const bySector = new Array(16).fill(0);
  let total = 0;
  for (const [tokenId, raw] of weights ?? []) {
    const w = Number(raw);
    if (!w || !isEarning(tokenId)) continue;
    total += w;
    const d = deskIndex?.get(tokenId);
    if (d !== undefined && d !== null) bySector[d] += w;
  }
  return { total, bySector };
}

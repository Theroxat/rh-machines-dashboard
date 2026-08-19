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
 * Ce qu'une machine toucherait si le pot était distribué maintenant.
 *
 * Le pot n'est pas partagé au prorata du seul poids. Il est découpé en tranches
 * par desk, proportionnellement aux voix, et sur chaque tranche une machine qui
 * porte ce desk compte double. En sommant les tranches, pour une machine de
 * poids `w` sur le desk `k` :
 *
 *     part = w × pot × [ Σ_s  voix_s/voix × 1/(W + W_s)  +  voix_k/voix × 1/(W + W_k) ]
 *
 * Le crochet ne dépend que du desk, jamais du poids : deux machines du même
 * desk touchent exactement en proportion de leur poids, et deux machines de
 * même poids sur des desks différents ne touchent pas pareil. C'est cette
 * seconde moitié que le partage naïf `poids ÷ flotte × pot` efface — celui du
 * terminal officiel, qui l'annonce d'ailleurs comme approximatif.
 *
 * Tant qu'aucune voix n'est tombée il n'y a pas de tranches, et le partage à
 * plat est alors la seule hypothèse honnête.
 */
export function epochUsd({ weight, deskIndex = null, totalWeight, potUsd, tally = null, sectorWeight = null }) {
  if (!potUsd || !totalWeight) return null;
  if (weight === null || weight === undefined) return null;

  const votes = tally?.reduce((a, b) => a + b, 0) ?? 0;
  if (!votes || !sectorWeight) return (potUsd * weight) / totalWeight;

  let per = 0;
  for (let s = 0; s < tally.length; s++) {
    const w = totalWeight + (sectorWeight[s] ?? 0);
    if (!w) continue;
    const share = tally[s] / votes;
    per += share / w;
    // Le double sur sa propre tranche, et sur elle seule.
    if (s === deskIndex) per += share / w;
  }
  return potUsd * weight * per;
}

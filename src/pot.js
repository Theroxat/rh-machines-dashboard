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
 * C'est la formule du terminal, volontairement : `poids ÷ poids total × pot`.
 * Elle ignore que le doublement de chaque secteur dilue les autres, donc elle
 * n'est exacte qu'à vote réparti — mais elle a le mérite d'être celle que le
 * porteur voit ailleurs, et l'écart réel tient dans la fourchette annoncée à
 * côté plutôt que dans un second chiffre qui contredirait le premier.
 *
 * Une dormante pèse zéro : elle ne touche rien, et c'est un fait, pas une
 * donnée manquante.
 */
export function epochUsd({ weight, totalWeight, potUsd }) {
  if (!potUsd || !totalWeight) return null;
  if (weight === null || weight === undefined) return null;
  return (potUsd * weight) / totalWeight;
}

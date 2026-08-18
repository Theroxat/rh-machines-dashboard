import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";

/**
 * Qui détient quoi.
 *
 * Le NFT n'est pas énumérable — `tokenOfOwnerByIndex` révoque — donc il n'y a
 * pas moyen de demander « les machines de cette adresse ». On lit les 10 000
 * propriétaires et on retourne l'index une fois pour toutes : une recherche
 * devient alors une lecture en mémoire, et le visiteur n'attend pas dix mille
 * appels pendant qu'il tape.
 */
const NFT = new ethers.Interface(["function ownerOf(uint256) view returns (address)"]);

export async function readOwners({ aggregate3, ids, batchSize = 400 }) {
  const byToken = new Map();
  let failures = 0;

  for (let start = 0; start < ids.length; start += batchSize) {
    const chunk = ids.slice(start, start + batchSize);
    const res = await aggregate3(
      chunk.map((id) => ({
        target: ADDRESSES.MACHINES, allowFailure: true,
        callData: NFT.encodeFunctionData("ownerOf", [id]),
      })),
    );
    chunk.forEach((id, i) => {
      const r = res[i];
      if (!r?.[0]) { failures++; return; }
      try {
        // Minuscules partout : une adresse se saisit dans n'importe quelle
        // casse, et deux graphies de la même adresse ne doivent pas donner
        // deux portefeuilles différents.
        byToken.set(id, NFT.decodeFunctionResult("ownerOf", r[1])[0].toLowerCase());
      } catch {
        failures++;
      }
    });
  }

  const byOwner = new Map();
  for (const [tokenId, owner] of byToken) {
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push(tokenId);
  }
  for (const list of byOwner.values()) list.sort((a, b) => a - b);

  return { byToken, byOwner, failures };
}

/** Les machines d'une adresse, quelle que soit la casse saisie. */
export const tokensOf = (byOwner, address) =>
  byOwner?.get(String(address ?? "").trim().toLowerCase()) ?? [];

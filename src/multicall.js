import { ethers } from "ethers";

const MC3_ABI = [
  "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) view returns ((bool success,bytes returnData)[])",
];

export function multicallOf(provider, address) {
  const contract = new ethers.Contract(address, MC3_ABI, provider);
  return (calls) => contract.aggregate3(calls);
}

/**
 * Lit une vue renvoyant un uint sur un grand nombre d'identifiants.
 * Une sous-lecture en échec, ou dont les données ne se décodent pas, ne produit
 * aucune entrée. L'appelant voit un identifiant manquant et peut le dire ; un
 * zéro serait indiscernable d'une machine qui ne porte réellement rien.
 */
export async function readUintMap({ aggregate3, iface, target, fn, ids, batchSize }) {
  const values = new Map();
  let failures = 0;

  for (let start = 0; start < ids.length; start += batchSize) {
    const chunk = ids.slice(start, start + batchSize);
    const res = await aggregate3(
      chunk.map((id) => ({ target, allowFailure: true, callData: iface.encodeFunctionData(fn, [id]) })),
    );
    chunk.forEach((id, i) => {
      const r = res[i];
      if (!r?.[0]) { failures++; return; }
      try {
        values.set(id, BigInt(iface.decodeFunctionResult(fn, r[1])[0]));
      } catch {
        failures++;
      }
    });
  }

  return { values, failures };
}

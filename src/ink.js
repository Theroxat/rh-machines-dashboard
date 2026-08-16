import { ethers } from "ethers";
import { ADDRESSES, TOTAL_MACHINES } from "./config.js";
import { readUintMap, multicallOf } from "./multicall.js";

const MINE_ABI = new ethers.Interface([
  "function inkBurned(uint256) view returns (uint256)",
]);

/** L'encre ne change qu'à l'activation ou au ré-encrage, donc cette lecture
 *  tourne sur sa propre boucle lente. Une machine dont l'encre n'a pas pu être
 *  lue est absente de la carte, et floors.js l'exclut au lieu de la dire dormante. */
export async function readInk({ provider, batchSize, total = TOTAL_MACHINES }) {
  const aggregate3 = multicallOf(provider, ADDRESSES.MULTICALL3);
  const ids = Array.from({ length: total }, (_, i) => i + 1);
  const { values, failures } = await readUintMap({
    aggregate3, iface: MINE_ABI, target: ADDRESSES.MINE, fn: "inkBurned", ids, batchSize,
  });
  return { ink: values, failures };
}

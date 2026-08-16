import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";
import { multicallOf } from "./multicall.js";

const MINE_ABI = new ethers.Interface([
  "function currentEpoch() view returns (uint256)",
  "function multiplierCeiling() view returns (uint256)",
  "function totalInkBurned() view returns (uint256)",
  "function activeMachines() view returns (uint256)",
  "function totalWeight() view returns (uint256)",
  "function ACTIVATION_INK() view returns (uint256)",
  "function nextGate() view returns (uint256 needed, uint256 unlocks)",
]);

const SINGLE = ["currentEpoch", "multiplierCeiling", "totalInkBurned", "activeMachines", "totalWeight", "ACTIVATION_INK"];

/** Chaque champ a le droit d'échouer indépendamment. Une vue illisible ne doit
 *  pas vider les cinq autres, et une vue en échec vaut null — jamais zéro. */
export async function readProtocol({ provider }) {
  const aggregate3 = multicallOf(provider, ADDRESSES.MULTICALL3);
  const fns = [...SINGLE, "nextGate"];
  const res = await aggregate3(
    fns.map((fn) => ({ target: ADDRESSES.MINE, allowFailure: true, callData: MINE_ABI.encodeFunctionData(fn, []) })),
  );

  const out = {};
  fns.forEach((fn, i) => {
    const r = res[i];
    if (!r?.[0]) { out[fn] = null; return; }
    try {
      const decoded = MINE_ABI.decodeFunctionResult(fn, r[1]);
      out[fn] = fn === "nextGate"
        ? { needed: decoded[0].toString(), unlocks: decoded[1].toString() }
        : decoded[0].toString();
    } catch {
      out[fn] = null;
    }
  });

  return {
    epoch: out.currentEpoch,
    ceiling: out.multiplierCeiling,
    totalInkBurned: out.totalInkBurned,
    activeMachines: out.activeMachines,
    totalWeight: out.totalWeight,
    activationInk: out.ACTIVATION_INK,
    nextGate: out.nextGate,
  };
}

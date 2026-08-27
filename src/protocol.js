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

const HOOK_ABI = new ethers.Interface([
  "function currentFeeBps() view returns (uint24)",
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

  // Le frais de vente du token : il se paie au moment de reconvertir des
  // $PRINTER en ETH, donc toute comparaison entre les deux monnaies doit le
  // déduire pour ne pas surestimer ce que vaut un prix libellé en PRINTER.
  let sellFeeBps = null;
  try {
    const raw = await provider.call({ to: ADDRESSES.HOOK, data: HOOK_ABI.encodeFunctionData("currentFeeBps", []) });
    if (raw !== "0x") sellFeeBps = Number(HOOK_ABI.decodeFunctionResult("currentFeeBps", raw)[0]);
  } catch { sellFeeBps = null; }

  // L'offre du jeton, lue en même temps. C'est un chiffre de tête depuis que
  // la page ouvre dessus : il ne peut pas dépendre d'une route chargée à la
  // demande, ni se déduire d'une capitalisation servie par un tiers.
  let printerSupply = null;
  try {
    const raw = await provider.call({
      to: ADDRESSES.TOKEN,
      data: new ethers.Interface(["function totalSupply() view returns (uint256)"])
        .encodeFunctionData("totalSupply", []),
    });
    // En nombre entier de jetons, pas en BigInt : ce champ part dans le JSON du
    // snapshot, et `JSON.stringify` refuse un BigInt — il emporte alors toute
    // la réponse, pas seulement ce champ. La division se fait en entiers pour
    // garder trois décimales exactes plutôt que de passer par un flottant.
    if (raw !== "0x") {
      printerSupply = Number(BigInt(raw) / 10n ** 15n) / 1000;
    }
  } catch { printerSupply = null; }

  return {
    sellFeeBps,
    printerSupply,
    epoch: out.currentEpoch,
    ceiling: out.multiplierCeiling,
    totalInkBurned: out.totalInkBurned,
    activeMachines: out.activeMachines,
    totalWeight: out.totalWeight,
    activationInk: out.ACTIVATION_INK,
    nextGate: out.nextGate,
  };
}

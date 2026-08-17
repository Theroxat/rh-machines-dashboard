import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";
import { readUintMap } from "./multicall.js";

/**
 * The Anvil — le teneur de marché du protocole, contrat VAULT.
 *
 * Il n'est documenté nulle part : son adresse et son ABI ont été extraites des
 * bundles du terminal officiel le 2026-08-17, puis vérifiées contre la chaîne.
 *
 * Ce qu'il fait compte plus que ce qu'il est : il publie en permanence un prix
 * d'achat sur n'importe quelle machine de la collection, libellé en $PRINTER.
 * Mesuré le même jour, les floors dormants d'OpenSea collent à ce prix à 2%
 * près sur les sept raretés — l'Anvil est le plancher réel du marché, et il est
 * dans une autre monnaie que celle où le marché se cote.
 */
export const ANVIL_ABI = new ethers.Interface([
  "function spot() view returns (uint256)",
  "function spreadBps() view returns (uint256)",
  "function stepBps() view returns (uint256)",
  "function snipeBps() view returns (uint256)",
  "function inventoryLength() view returns (uint256)",
  "function cratePrice() view returns (uint256)",
  "function shelfAverage() view returns (uint256)",
  "function paused() view returns (bool)",
  "function bidPaused() view returns (bool)",
  "function sellPrice(uint256) view returns (uint256)",
  "function buyPrice(uint256) view returns (uint256)",
]);

const PRINTER = 10n ** 18n;
const toPrinter = (v) => (v === null ? null : Number(v / (PRINTER / 1000n)) / 1000);

/** Une vue à laquelle le contrat ne répond pas rend null : un zéro se lirait
 *  comme un prix, et un prix de zéro n'est jamais une information neutre. */
async function readView(provider, fn) {
  try {
    const raw = await provider.call({ to: ADDRESSES.VAULT, data: ANVIL_ABI.encodeFunctionData(fn, []) });
    if (raw === "0x") return null;
    return ANVIL_ABI.decodeFunctionResult(fn, raw)[0];
  } catch {
    return null;
  }
}

export async function readAnvil({ provider, aggregate3, tokenIds, batchSize = 400 }) {
  const [spot, spreadBps, stepBps, snipeBps, inventoryLength, cratePrice, shelfAverage, paused, bidPaused] =
    await Promise.all(["spot", "spreadBps", "stepBps", "snipeBps", "inventoryLength", "cratePrice", "shelfAverage", "paused", "bidPaused"]
      .map((fn) => readView(provider, fn)));

  // Le prix d'achat de chaque machine en vente, pour pouvoir dire laquelle
  // s'échange sous ce que le protocole lui-même en donnerait.
  const { values } = tokenIds.length
    ? await readUintMap({ aggregate3, iface: ANVIL_ABI, target: ADDRESSES.VAULT, fn: "sellPrice", ids: tokenIds, batchSize })
    : { values: new Map() };

  const bids = new Map();
  for (const [id, v] of values) bids.set(id, toPrinter(v));

  return {
    spotPrinter: toPrinter(spot),
    spreadBps: spreadBps === null ? null : Number(spreadBps),
    stepBps: stepBps === null ? null : Number(stepBps),
    snipeBps: snipeBps === null ? null : Number(snipeBps),
    shelf: inventoryLength === null ? null : Number(inventoryLength),
    cratePrinter: toPrinter(cratePrice),
    shelfAveragePrinter: toPrinter(shelfAverage),
    paused: paused === null ? null : Boolean(paused),
    bidPaused: bidPaused === null ? null : Boolean(bidPaused),
    bids,
  };
}

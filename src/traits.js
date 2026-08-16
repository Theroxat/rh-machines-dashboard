import { ethers } from "ethers";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ADDRESSES, TOTAL_MACHINES } from "./config.js";
import { readUintMap, multicallOf } from "./multicall.js";

const TRAITS_ABI = new ethers.Interface([
  "function weightOf(uint256) view returns (uint256)",
  "function sectorOf(uint256) view returns (uint8)",
]);

export function readCache(path) {
  let raw;
  try { raw = readFileSync(path, "utf8"); } catch { return null; }
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  const map = new Map();
  for (const [id, v] of Object.entries(obj)) {
    if (v?.weightClass == null) continue;          // une rareté inconnue reste inconnue
    map.set(Number(id), { weightClass: Number(v.weightClass), desk: v.desk ?? null });
  }
  return map;
}

export function writeCache(path, traits) {
  mkdirSync(dirname(path), { recursive: true });
  const obj = {};
  for (const [id, v] of traits) obj[id] = v;
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj));
  renameSync(tmp, path);                            // atomique : pas de cache à moitié écrit
}

/** La carte scellée, lue une fois. weightOf ici est la classe scellée de TRAITS,
 *  pas le poids effectif de MINE — deux nombres différents sur deux contrats. */
export async function readTraits({ provider, batchSize, total = TOTAL_MACHINES }) {
  const aggregate3 = multicallOf(provider, ADDRESSES.MULTICALL3);
  const ids = Array.from({ length: total }, (_, i) => i + 1);

  const rarities = await readUintMap({
    aggregate3, iface: TRAITS_ABI, target: ADDRESSES.TRAITS, fn: "weightOf", ids, batchSize,
  });
  const desks = await readUintMap({
    aggregate3, iface: TRAITS_ABI, target: ADDRESSES.TRAITS, fn: "sectorOf", ids, batchSize,
  });

  const traits = new Map();
  for (const [id, wc] of rarities.values) {
    const desk = desks.values.get(id);
    traits.set(id, { weightClass: Number(wc), desk: desk === undefined ? null : Number(desk) });
  }
  return traits;
}

export async function loadTraits({ provider, cachePath, batchSize, total = TOTAL_MACHINES }) {
  const cached = readCache(cachePath);
  if (cached && cached.size >= total * 0.99) return { traits: cached, source: "cache" };
  const traits = await readTraits({ provider, batchSize, total });
  if (traits.size) writeCache(cachePath, traits);
  return { traits, source: "chain" };
}

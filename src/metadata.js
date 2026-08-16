import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { OPENSEA, ADDRESSES, TOTAL_MACHINES } from "./config.js";

/** Le cache est versionné : une version antérieure ne portait pas Eyes, et la
 *  relire telle quelle donnerait un filtre qui ne trouve jamais rien, sans la
 *  moindre erreur. Un changement de forme force la relecture. */
const CACHE_VERSION = 2;

/** Background vaut « Acid Lime » sur les 10 000 machines : il ne distingue rien
 *  et n'est donc pas stocké. Les trois autres traits varient. */
function traitsOf(nft, image) {
  const t = Object.fromEntries((nft.traits ?? []).map((x) => [x.trait_type, x.value]));
  return {
    image,
    // "None" est la réalité de la classe x6 : 81 machines ne portent rien.
    // L'écraser en null effacerait la deuxième classe la plus rare.
    headwear: t.Headwear ?? null,
    body: t.Body ?? null,
    eyes: t.Eyes ?? null,
  };
}

/** Image et traits de chaque machine. Scellés au mint comme les raretés, donc
 *  lus une fois puis cachés à vie : en régime établi, zéro appel. */
export async function fetchMetadata({
  apiKey,
  fetchImpl = fetch,
  maxPages,
  contract = ADDRESSES.MACHINES,
  chain = OPENSEA.chain,
}) {
  const meta = new Map();
  let skipped = 0;
  let next = null;
  let pages = 0;

  do {
    const url = new URL(`${OPENSEA.base}/chain/${chain}/contract/${contract}/nfts`);
    url.searchParams.set("limit", "200");
    if (next) url.searchParams.set("next", next);

    const res = await fetchImpl(url.toString(), {
      headers: { "x-api-key": apiKey, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OpenSea returned ${res.status} on metadata page ${pages + 1}`);

    const body = await res.json();
    for (const n of body?.nfts ?? []) {
      const tokenId = Number(n?.identifier);
      const image = n?.display_image_url || n?.image_url || null;
      if (!Number.isInteger(tokenId) || tokenId <= 0 || !image) { skipped++; continue; }
      meta.set(tokenId, traitsOf(n, image));
    }

    next = body?.next || null;
    pages++;
  } while (next && pages < maxPages);

  if (next) throw new Error(`collection not exhausted after ${maxPages} metadata pages`);

  return { meta, pages, skipped };
}

/**
 * Rattrapage machine par machine pour ce que la pagination en lot a laissé
 * tomber. Mesuré le 2026-08-16 : le token 765 est absent des 50 pages du lot
 * alors qu'il répond parfaitement sur son endpoint individuel. Un trou qu'on
 * sait combler ne reste pas un trou — mais `limit` empêche de marteler l'API
 * si le « trou » est en réalité une panne massive.
 */
export async function backfillMetadata({
  apiKey,
  meta,
  wanted,
  limit = 100,
  fetchImpl = fetch,
  contract = ADDRESSES.MACHINES,
  chain = OPENSEA.chain,
}) {
  const missing = wanted.filter((id) => !meta.has(id)).slice(0, limit);
  let filled = 0;

  for (const tokenId of missing) {
    try {
      const res = await fetchImpl(`${OPENSEA.base}/chain/${chain}/contract/${contract}/nfts/${tokenId}`, {
        headers: { "x-api-key": apiKey, accept: "application/json" },
      });
      if (!res.ok) continue;
      const n = (await res.json())?.nft;
      const image = n?.display_image_url || n?.image_url || null;
      if (!image) continue;
      meta.set(tokenId, traitsOf(n, image));
      filled++;
    } catch {
      // Une machine qu'on n'a pas pu relire reste absente. Elle perdra sa
      // vignette, ce qui est visible ; une entrée inventée ne le serait pas.
    }
  }

  return filled;
}

export function readCache(path) {
  let raw;
  try { raw = readFileSync(path, "utf8"); } catch { return null; }
  let obj;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (obj?.version !== CACHE_VERSION || !obj.machines) return null;
  const map = new Map();
  for (const [id, v] of Object.entries(obj.machines)) {
    if (!v?.image) continue;
    map.set(Number(id), {
      image: v.image,
      headwear: v.headwear ?? null,
      body: v.body ?? null,
      eyes: v.eyes ?? null,
    });
  }
  return map;
}

export function writeCache(path, meta) {
  mkdirSync(dirname(path), { recursive: true });
  const machines = {};
  for (const [id, v] of meta) machines[id] = v;
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: CACHE_VERSION, machines }));
  renameSync(tmp, path);
}

export async function loadMetadata({
  apiKey, cachePath, maxPages, wanted = [], backfillLimit = 100,
  total = TOTAL_MACHINES, fetchImpl = fetch,
}) {
  const cached = readCache(cachePath);
  const fromCache = cached && cached.size >= total * 0.99;
  const meta = fromCache ? cached : (await fetchMetadata({ apiKey, maxPages, fetchImpl })).meta;

  // Le rattrapage tourne aussi sur un cache accepté : sans ça, un cache écrit
  // à 9 999 par une pagination qui a sauté une machine resterait incomplet
  // pour toujours, sous le seuil de tolérance et donc jamais reconstruit.
  const filled = wanted.length
    ? await backfillMetadata({ apiKey, meta, wanted, limit: backfillLimit, fetchImpl })
    : 0;

  if (meta.size && (!fromCache || filled)) writeCache(cachePath, meta);
  return { meta, source: fromCache ? "cache" : "opensea", filled };
}

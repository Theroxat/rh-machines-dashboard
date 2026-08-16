import { OPENSEA } from "./config.js";

/** Arithmétique en chaîne de caractères à l'entrée : 8.9e16 dépasse la plage
 *  d'entiers exacts d'un double, donc un BigInt -> Number avant division
 *  arrondirait les derniers chiffres. */
export function weiToEth(value, decimals) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const padded = value.padStart(decimals + 1, "0");
  const cut = padded.length - decimals;
  return Number(`${padded.slice(0, cut)}.${padded.slice(cut)}`);
}

export function priceEthOf(listing) {
  const p = listing?.price?.current;
  if (!p || p.currency !== "ETH") return null;
  return weiToEth(p.value, Number(p.decimals));
}

export async function fetchListings({ apiKey, slug = OPENSEA.slug, fetchImpl = fetch, maxPages }) {
  const cheapest = new Map();
  const skipped = { foreignCurrency: 0, unreadable: 0 };
  let next = null;
  let pages = 0;

  do {
    const url = new URL(`${OPENSEA.base}/listings/collection/${slug}/all`);
    url.searchParams.set("limit", "100");
    if (next) url.searchParams.set("next", next);

    const res = await fetchImpl(url.toString(), {
      headers: { "x-api-key": apiKey, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`OpenSea returned ${res.status} on page ${pages + 1}`);

    const body = await res.json();
    for (const l of body?.listings ?? []) {
      const tokenId = Number(l?.asset?.identifier);
      const priceEth = priceEthOf(l);
      if (!Number.isInteger(tokenId) || tokenId <= 0) { skipped.unreadable++; continue; }
      if (priceEth === null) {
        if (l?.price?.current?.currency && l.price.current.currency !== "ETH") skipped.foreignCurrency++;
        else skipped.unreadable++;
        continue;
      }
      const prev = cheapest.get(tokenId);
      if (!prev || priceEth < prev.priceEth) {
        cheapest.set(tokenId, { tokenId, priceEth, orderHash: l.order_hash ?? null });
      }
    }

    next = body?.next || null;
    pages++;
  } while (next && pages < maxPages);

  // Un carnet tronqué déplace silencieusement tous les floors de la page. Refuser.
  if (next) throw new Error(`listings book not exhausted after ${maxPages} pages`);

  return { listings: cheapest, pages, skipped };
}

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Les statistiques publiées de la collection. Le `floor_price` d'OpenSea est
 * affiché à titre de comparaison seulement — mesuré sur cette chaîne à ~10x le
 * carnet réel — mais le volume et le nombre de ventes n'ont pas d'équivalent
 * calculable depuis le carnet : ils ne décrivent pas ce qui est en vente, mais
 * ce qui s'est échangé, et rien d'autre ne le sait.
 */
export async function fetchCollectionStats({ apiKey, slug = OPENSEA.slug, fetchImpl = fetch }) {
  const res = await fetchImpl(`${OPENSEA.base}/collections/${slug}/stats`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`OpenSea stats returned ${res.status}`);
  const body = await res.json();
  const day = (body?.intervals ?? []).find((i) => i?.interval === "one_day");

  return {
    floor: numOrNull(body?.total?.floor_price),
    symbol: body?.total?.floor_price_symbol ?? null,
    volume: numOrNull(body?.total?.volume),
    sales: numOrNull(body?.total?.sales),
    owners: numOrNull(body?.total?.num_owners),
    volume24h: numOrNull(day?.volume),
    sales24h: numOrNull(day?.sales),
  };
}

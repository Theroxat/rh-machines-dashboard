/**
 * Le contrat expose le desk d'une machine comme un simple entier — `sectorOf`
 * rend 0 à 15 — et rien on-chain ne dit quel ticker porte le desk 7. Les quatre
 * getters plausibles (`sectors`, `sectorToken`, `deskName`, `sectorSymbol`) ont
 * été essayés sur TRAITS, MINE, DISTRIBUTOR et VOTE le 2026-08-16 : aucun
 * n'existe.
 *
 * La documentation, elle, publie le nombre de machines par ticker. Ces seize
 * nombres sont tous distincts et totalisent exactement 10 000, donc apparier les
 * comptages lus sur la chaîne avec les comptages publiés n'admet qu'une seule
 * solution. Ce n'est pas une supposition : c'est une bijection.
 *
 * Et parce que c'est dérivé plutôt qu'écrit en dur, le jour où la collection ne
 * correspondrait plus, la correspondance disparaît au lieu d'afficher des
 * tickers faux avec assurance.
 */
export const DESK_CENSUS = Object.freeze({
  AAPL: 1322, NVDA: 1245, AMD: 1239, AMZN: 911, RDDT: 888, MSFT: 886,
  GOOGL: 876, GME: 661, TSLA: 562, SPCX: 532, COST: 514, ETH: 111,
  SLV: 78, PLTR: 66, USDG: 56, USAR: 53,
});

export function deriveDeskTickers(traits, census = DESK_CENSUS) {
  const counts = new Map();
  for (const t of traits.values()) {
    if (t?.desk == null) continue;
    counts.set(t.desk, (counts.get(t.desk) ?? 0) + 1);
  }

  const none = (reason) => ({ byIndex: new Map(), ok: false, reason });

  const chainCounts = [...counts.values()].sort((a, b) => a - b);
  const docCounts = Object.values(census).sort((a, b) => a - b);
  if (chainCounts.length !== docCounts.length || chainCounts.some((n, i) => n !== docCounts[i])) {
    return none(`chain desk counts do not match the published census (${chainCounts.length} desks on chain, ${docCounts.length} published)`);
  }
  if (new Set(chainCounts).size !== chainCounts.length) {
    return none("two desks hold the same number of machines, so counts cannot tell them apart — ambiguous");
  }

  const tickerByCount = new Map(Object.entries(census).map(([ticker, n]) => [n, ticker]));
  const byIndex = new Map();
  for (const [desk, n] of counts) byIndex.set(desk, tickerByCount.get(n));
  return { byIndex, ok: true, reason: null };
}

/** Une couleur de corps ne prend un ticker que si toutes ses machines siègent au
 *  même desk. Mesuré : les 31 couleurs se répartissent proprement sur 16 desks. */
export function deriveBodyTickers({ traits, meta, byIndex }) {
  const desksByBody = new Map();
  for (const [tokenId, t] of traits) {
    const body = meta.get(tokenId)?.body;
    if (!body || t?.desk == null) continue;
    if (!desksByBody.has(body)) desksByBody.set(body, new Set());
    desksByBody.get(body).add(t.desk);
  }

  const out = new Map();
  for (const [body, desks] of desksByBody) {
    out.set(body, desks.size === 1 ? (byIndex.get([...desks][0]) ?? null) : null);
  }
  return out;
}

import { buildTraitIndex } from "./traitindex.js";
import { TOTAL_MACHINES } from "./config.js";

/** Assemblage pur de tout ce dont la page a besoin. Une dérivation qui
 *  diviserait par une valeur non lue produit null plutôt qu'un zéro confiant. */
export function composeSnapshot({
  grid, printer, eth, protocol, stats, book, inkMeta, meta, legend, bodyTickers, ink, weights, anvil, now,
}) {
  const activationPrinter = protocol?.activationInk
    ? Number(BigInt(protocol.activationInk) / 10n ** 15n) / 1000
    : null;

  const activationUsd = activationPrinter !== null && printer?.usd ? activationPrinter * printer.usd : null;
  const activationEth = activationUsd !== null && eth?.usd ? activationUsd / eth.usd : null;

  // Chaque machine en vente porte sa photo et son couvre-chef. Une photo
  // absente laisse `machine: null` et ne touche à aucun prix : on n'a pas
  // trouvé l'image, pas perdu le marché.
  const machineOf = (tokenId) => {
    const m = meta?.get(tokenId);
    if (!m) return null;
    // Le ticker voyage avec la machine : la page filtre et étiquette sans
    // avoir à refaire la correspondance corps -> desk pour chaque vignette.
    return { ...m, ticker: bodyTickers?.get(m.body) ?? null };
  };

  const PRINTER = 10n ** 18n;

  /**
   * Ce que l'anvil paierait, exprimé en ETH pour être comparable à un prix
   * OpenSea. Les frais de vente du token sont déduits : encaisser un prix en
   * $PRINTER suppose de le reconvertir, et ce passage coûte. Sans ce taux, la
   * conversion surestimerait l'offre et signalerait des affaires qui n'existent
   * pas — donc sans lui, on ne compare rien du tout.
   */
  const netFactor = protocol?.sellFeeBps === null || protocol?.sellFeeBps === undefined
    ? null
    : 1 - protocol.sellFeeBps / 10000;

  const bidEthOf = (tokenId) => {
    const bid = anvil?.bids?.get(tokenId);
    if (bid === undefined || netFactor === null || !printer?.usd || !eth?.usd) return null;
    return (bid * printer.usd * netFactor) / eth.usd;
  };

  /**
   * Le poids vient du contrat, pas d'une racine carrée que je recalculerais.
   * `inkMult` est ce qui distingue une machine re-inkée d'une machine activée au
   * minimum : même classe, poids doublé, et rien ne le disait jusqu'ici.
   */
  /** Le rayon de l'anvil, converti dans les deux autres monnaies pour être
   *  comparable — mais jamais fondu dans le carnet OpenSea : ce sont deux
   *  marchés, deux monnaies, deux transactions différentes. */
  const shelfEntry = (e, classValue) => {
    const w = weights?.get(e.tokenId);
    const weight = w === undefined ? null : Number(w);
    return {
      ...e,
      machine: machineOf(e.tokenId),
      // Une machine du rayon peut avoir été re-inkée comme n'importe quelle
      // autre, et sa vignette doit pouvoir le dire.
      weight,
      inkMult: weight ? weight / classValue : null,
      askUsd: printer?.usd ? e.askPrinter * printer.usd : null,
      askEth: printer?.usd && eth?.usd ? (e.askPrinter * printer.usd) / eth.usd : null,
    };
  };

  const withMachines = (cell, classValue) => ({
    ...cell,
    anvilEntries: (cell.anvilEntries ?? []).map((e) => shelfEntry(e, classValue)),
    entries: cell.entries.map((e) => {
      const w = weights?.get(e.tokenId);
      const i = ink?.get(e.tokenId);
      const weight = w === undefined ? null : Number(w);
      const anvilBidEth = bidEthOf(e.tokenId);
      return {
        ...e,
        machine: machineOf(e.tokenId),
        weight,
        inkPrinter: i === undefined ? null : Number(i / PRINTER),
        // Une machine dormante ne pèse rien : un rapport n'aurait aucun sens.
        inkMult: weight ? weight / classValue : null,
        anvilBidPrinter: anvil?.bids?.get(e.tokenId) ?? null,
        anvilBidEth,
        // Une offre suspendue n'est pas une offre basse : on ne compare pas.
        underBid: Boolean(anvilBidEth !== null && !anvil?.bidPaused && anvilBidEth > e.priceEth),
      };
    }),
  });

  const rows = grid.rows.map((r) => ({
    ...r,
    inked: withMachines(r.inked, r.classValue),
    dormant: withMachines(r.dormant, r.classValue),
  }));

  const listed = new Set();
  for (const r of rows) {
    for (const e of r.inked.entries) listed.add(e.tokenId);
    for (const e of r.dormant.entries) listed.add(e.tokenId);
  }

  // Le floor de la collection est le moins cher de nos quatorze cases, pas le
  // chiffre publié par OpenSea : il vient du même carnet que tout le reste de
  // la page, donc il ne peut pas la contredire.
  const floors = rows.flatMap((r) => [r.inked.floorEth, r.dormant.floorEth]).filter((v) => v !== null && v !== undefined);
  const floorEth = floors.length ? Math.min(...floors) : null;
  const inEth = (v) => (v !== null && v !== undefined && eth?.usd ? v * eth.usd : null);

  const collection = {
    floorEth,
    floorUsd: inEth(floorEth),
    // Convention du marché NFT : floor x supply. C'est une valorisation
    // théorique, pas une somme observée — l'étiquette le dit sur la page.
    machines: TOTAL_MACHINES,
    marketCapEth: floorEth === null ? null : floorEth * TOTAL_MACHINES,
    marketCapUsd: inEth(floorEth === null ? null : floorEth * TOTAL_MACHINES),
    volumeEth: stats?.volume ?? null,
    volumeUsd: inEth(stats?.volume),
    sales: stats?.sales ?? null,
    volume24hEth: stats?.volume24h ?? null,
    volume24hUsd: inEth(stats?.volume24h),
    sales24h: stats?.sales24h ?? null,
    owners: stats?.owners ?? null,
    publishedFloor: stats?.floor ?? null,
    publishedFloorSymbol: stats?.symbol ?? null,
    publishedFloorUsedInComputation: false,
  };

  return {
    at: now,
    rows,
    legend: legend ?? null,
    traitFilters: meta ? buildTraitIndex({ meta, listed, bodyTickers }) : null,
    excluded: grid.excluded,
    totals: grid.totals,
    printer,
    eth,
    ink: {
      activationPrinter,
      activationUsd,
      activationEth,
      readAt: inkMeta?.readAt ?? null,
      failures: inkMeta?.failures ?? null,
    },
    protocol,
    book,
    collection,
    anvil: anvil
      ? {
          ...anvil,
          bids: undefined,   // 650 entrées déjà portées par chaque machine
          spotUsd: anvil.spotPrinter === null ? null : anvil.spotPrinter * (printer?.usd ?? 0) || null,
          shelfAverageUsd: anvil.shelfAveragePrinter === null ? null : anvil.shelfAveragePrinter * (printer?.usd ?? 0) || null,
          crateUsd: anvil.cratePrinter === null ? null : anvil.cratePrinter * (printer?.usd ?? 0) || null,
          sellFeeBps: protocol?.sellFeeBps ?? null,
        }
      : null,
  };
}

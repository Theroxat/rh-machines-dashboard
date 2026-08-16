import { buildTraitIndex } from "./traitindex.js";

/** Assemblage pur de tout ce dont la page a besoin. Une dérivation qui
 *  diviserait par une valeur non lue produit null plutôt qu'un zéro confiant. */
export function composeSnapshot({
  grid, printer, eth, protocol, publishedFloor, book, inkMeta, meta, legend, bodyTickers, now,
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

  const withMachines = (cell) => ({
    ...cell,
    entries: cell.entries.map((e) => ({ ...e, machine: machineOf(e.tokenId) })),
  });

  const rows = grid.rows.map((r) => ({
    ...r,
    inked: withMachines(r.inked),
    dormant: withMachines(r.dormant),
  }));

  const listed = new Set();
  for (const r of rows) {
    for (const e of r.inked.entries) listed.add(e.tokenId);
    for (const e of r.dormant.entries) listed.add(e.tokenId);
  }

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
    publishedFloor: { ...publishedFloor, usedInComputation: false },
  };
}

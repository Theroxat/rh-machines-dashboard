/** Assemblage pur de tout ce dont la page a besoin. Une dérivation qui
 *  diviserait par une valeur non lue produit null plutôt qu'un zéro confiant. */
export function composeSnapshot({ grid, printer, eth, protocol, publishedFloor, book, inkMeta, meta, legend, now }) {
  const activationPrinter = protocol?.activationInk
    ? Number(BigInt(protocol.activationInk) / 10n ** 15n) / 1000
    : null;

  const activationUsd = activationPrinter !== null && printer?.usd ? activationPrinter * printer.usd : null;
  const activationEth = activationUsd !== null && eth?.usd ? activationUsd / eth.usd : null;

  // La machine qui fixe un floor porte sa photo et son couvre-chef. Une photo
  // absente laisse `machine: null` et ne touche à aucun prix : on n'a pas
  // trouvé l'image, pas perdu le marché.
  const machineOf = (tokenId) =>
    (tokenId === null || tokenId === undefined) ? null : (meta?.get(tokenId) ?? null);

  const rows = grid.rows.map((r) => ({
    ...r,
    inked:   { ...r.inked,   machine: machineOf(r.inked.floorTokenId) },
    dormant: { ...r.dormant, machine: machineOf(r.dormant.floorTokenId) },
  }));

  return {
    at: now,
    rows,
    legend: legend ?? null,
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

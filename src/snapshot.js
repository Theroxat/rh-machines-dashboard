/** Assemblage pur de tout ce dont la page a besoin. Une dérivation qui
 *  diviserait par une valeur non lue produit null plutôt qu'un zéro confiant. */
export function composeSnapshot({ grid, printer, eth, protocol, publishedFloor, book, inkMeta, now }) {
  const activationPrinter = protocol?.activationInk
    ? Number(BigInt(protocol.activationInk) / 10n ** 15n) / 1000
    : null;

  const activationUsd = activationPrinter !== null && printer?.usd ? activationPrinter * printer.usd : null;
  const activationEth = activationUsd !== null && eth?.usd ? activationUsd / eth.usd : null;

  return {
    at: now,
    rows: grid.rows,
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

/**
 * Ce que vaut un portefeuille.
 *
 * Quatre choses s'y trouvent, et elles ne se valorisent pas de la même façon.
 *
 * Les machines : au floor de leur propre case, c'est-à-dire au prix que
 * demandent aujourd'hui des machines de même classe et de même état. Un floor
 * est un prix demandé et pas un prix obtenu ; c'est dit plutôt que sous-entendu.
 * L'offre de l'anvil entrait autrefois dans le calcul, et le portefeuille se
 * valorisait alors sur un marché dont il n'a pas été question.
 *
 * Les actions dans le compte de chaque machine : elles partent avec elle, donc
 * elles comptent une fois, du côté des machines et pas ailleurs.
 *
 * Les actions déjà retirées vers le portefeuille, et le $PRINTER : au prix du
 * marché, sans détour.
 */
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Le floor de la case d'une machine — sa classe et son état. Rien si personne
 *  n'en vend une comparable : on ne devine pas un prix sur un marché vide. */
export function floorFor(rows, classValue, side, ethUsd) {
  const r = (rows ?? []).find((x) => x.classValue === classValue);
  const cell = side === "dormant" ? r?.dormant : r?.inked;
  const eth = cell?.floorEth;
  return eth && ethUsd ? eth * ethUsd : null;
}

export function valueWallet({ machines, rows, ethUsd, printer, ownStock }) {
  const lines = (machines ?? []).map((m) => ({
    tokenId: m.tokenId,
    machineUsd: floorFor(rows, m.classValue, m.weight ? "inked" : "dormant", ethUsd),
    insideUsd: m.holds?.usd ?? 0,
  }));

  const priced = lines.filter((l) => l.machineUsd !== null);
  const machinesUsd = priced.length ? sum(priced.map((l) => l.machineUsd)) : null;
  const insideUsd = sum(lines.map((l) => l.insideUsd));
  const printerUsd = printer?.amount && printer?.usd ? printer.amount * printer.usd : null;
  const stockUsd = sum((ownStock ?? []).map((s) => s.usd ?? 0)) || null;

  const parts = [machinesUsd, insideUsd || null, printerUsd, stockUsd].filter((v) => v !== null);
  return {
    lines,
    machinesUsd,
    // Une machine dont on n'a pas su estimer le prix ne vaut pas zéro : elle
    // est laissée hors du total, et le compte le dit.
    unpriced: lines.length - priced.length,
    insideUsd: insideUsd || null,
    printerUsd,
    printerAmount: printer?.amount ?? null,
    stockUsd,
    ownStock: ownStock ?? [],
    total: parts.length ? sum(parts) : null,
  };
}

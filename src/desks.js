/**
 * Les seize desks du protocole.
 *
 * Ce sont des **secteurs**, pas des tickers. La distinction n'est pas
 * cosmétique : le bulletin propose des tickers, chaque ticker appartient à un
 * secteur, et une machine touche double sur la part achetée pour le secteur
 * qu'elle porte — pas pour une action en particulier.
 *
 * La page les nommait AAPL, NVDA, GME. C'était faux, et l'erreur s'était
 * validée toute seule : j'avais seize comptages justes et seize tickers pris
 * sur la même page de documentation, appariés par comptage. Les comptages
 * étaient les bons — health compte bien 1 322 machines — mais les tickers
 * étaient la liste du bulletin, pas le nom des desks. Une bijection sur des
 * chiffres exacts accrochés aux mauvaises étiquettes reste une bijection.
 *
 * Plus rien n'est déduit ici. L'index vient de `MINE.deskOf`, qui fait
 * autorité ; le nom vient de la table que le terminal officiel publie en clair
 * dans ses bundles, relevée le 2026-08-18, dans cet ordre exact.
 */
export const SECTORS = Object.freeze([
  "energy",           //  0
  "materials",        //  1
  "industrials",      //  2
  "consumer disc.",   //  3
  "consumer staples", //  4
  "health",           //  5
  "financials",       //  6
  "tech",             //  7
  "comms",            //  8
  "utilities",        //  9
  "real estate",      // 10
  "transport",        // 11
  "media",            // 12
  "retail",           // 13
  "aero",             // 14
  "semis",            // 15
]);

/** Le nom d'un desk, ou null. Un index hors table ne prend pas le nom du
 *  voisin : une machine sans desk lisible n'appartient à aucun secteur. */
export function deskName(index) {
  if (index === null || index === undefined) return null;
  const i = Number(index);
  return Number.isInteger(i) && i >= 0 && i < SECTORS.length ? SECTORS[i] : null;
}

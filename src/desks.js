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

/**
 * Recoupe les deux sources : le desk que la chaîne assigne, et celui que les
 * métadonnées annonceront.
 *
 * La chaîne décide — elle est l'autorité et elle ne bouge pas. Les métadonnées,
 * elles, arrivent après coup et sont écrites par une main humaine. Ce contrôle
 * ne sert donc pas à corriger la page : il sert à savoir, le jour où les deux
 * divergent, laquelle des seize étiquettes est fausse. Aujourd'hui les noms de
 * secteurs viennent des bundles du terminal ; s'ils se retrouvent démentis par
 * les métadonnées officielles, il faudra le voir plutôt que de le supposer.
 */
export function crossCheckDesks({ deskIndex, meta }) {
  const agree = new Map();
  const disagree = new Map();
  let unnamed = 0;

  for (const [tokenId, index] of deskIndex ?? []) {
    const published = meta?.get(tokenId)?.desk;
    if (!published) { unnamed++; continue; }
    const ours = deskName(index);
    const bag = String(published).toLowerCase() === String(ours).toLowerCase() ? agree : disagree;
    const key = `${index}:${ours}:${published}`;
    bag.set(key, (bag.get(key) ?? 0) + 1);
  }

  return {
    // Aucune métadonnée ne porte encore de desk : il n'y a rien à recouper,
    // ce qui n'est pas la même chose qu'un accord.
    checked: (deskIndex?.size ?? 0) - unnamed,
    agree: [...agree.values()].reduce((a, b) => a + b, 0),
    disagreements: [...disagree.keys()].map((k) => {
      const [index, ours, published] = k.split(":");
      return { index: Number(index), ours, published, count: disagree.get(k) };
    }),
  };
}

/**
 * Recoupe le poids que la chaîne donne et celui que les métadonnées publient.
 *
 * Les deux devraient toujours coïncider, et c'est justement pour ça que le
 * contrôle vaut : le multiplicateur publié est établi sans passer par notre
 * dérivation couvre-chef → classe. S'ils divergent, soit la chaîne a bougé
 * depuis la dernière génération des métadonnées — cas normal, une brûlure
 * récente — soit notre modèle de rareté s'est trompé quelque part, et il vaut
 * mieux l'apprendre d'un journal que d'un chiffre faux servi pendant des jours.
 */
export function crossCheckWeights({ weights, meta, classOf }) {
  let checked = 0, agree = 0;
  const off = [];

  for (const [tokenId, m] of meta ?? []) {
    if (m?.weight === null || m?.weight === undefined) continue;
    const chain = weights?.get(tokenId);
    if (chain === undefined) continue;
    checked++;
    if (Number(chain) === m.weight) agree++;
    else if (off.length < 5) off.push({ tokenId, chain: Number(chain), published: m.weight });
  }

  // Le multiplicateur se déduit chez nous de la classe : le recouper met notre
  // table des raretés à l'épreuve, machine par machine.
  let multChecked = 0, multAgree = 0;
  for (const [tokenId, m] of meta ?? []) {
    const cls = classOf?.(tokenId);
    if (!cls || m?.multiplier === null || m?.multiplier === undefined) continue;
    const chain = weights?.get(tokenId);
    if (chain === undefined || !Number(chain)) continue;
    multChecked++;
    if (Math.abs(Number(chain) / cls - m.multiplier) < 0.005) multAgree++;
  }

  return { checked, agree, off, multChecked, multAgree };
}

/** Le nom d'un desk, ou null. Un index hors table ne prend pas le nom du
 *  voisin : une machine sans desk lisible n'appartient à aucun secteur. */
export function deskName(index) {
  if (index === null || index === undefined) return null;
  const i = Number(index);
  return Number.isInteger(i) && i >= 0 && i < SECTORS.length ? SECTORS[i] : null;
}

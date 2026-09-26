import { buildTraitIndex } from "./traitindex.js";
import { TOTAL_MACHINES, OPERATING_CHARGE_PRINTER, ADDRESSES, OPENSEA, DARK } from "./config.js";
import { deskShares } from "./vote.js";
import { deskName } from "./desks.js";
import { epochUsd } from "./pot.js";
import { valueHoldings } from "./holdings.js";
import { crossCheck } from "./official.js";
import { SOURCES, SOURCE_KINDS } from "./sources.js";

/** Assemblage pur de tout ce dont la page a besoin. Une dérivation qui
 *  diviserait par une valeur non lue produit null plutôt qu'un zéro confiant. */
/** La part de l'offre déjà brûlée. `null` si l'offre n'a pas pu être lue :
 *  une part manquante n'est pas une part nulle. */
export function burnHeadline(protocol) {
  const supply = protocol?.printerSupply;
  if (supply === null || supply === undefined) return null;
  if (!Number.isFinite(supply) || supply <= 0) return null;
  const minted = 200_000_000;
  const burned = minted - supply;
  return {
    minted,
    supply,
    burned,
    share: burned / minted,
    // L'encre, c'est-à-dire ce que les machines ont brûlé pour s'allumer. Le
    // reste vient des rachats du pad, du swap et du Proton.
    ink: protocol?.totalInkBurned ? Number(protocol.totalInkBurned) / 1e18 : null,
  };
}

/**
 * Combien de machines circulent encore.
 *
 * Dix mille ont été frappées et dix mille existent toujours : rien n'est
 * détruit, `totalSupply` ne bouge pas. Mais le coffre du Proton en garde — une
 * de plus à chaque fusion — et une a été envoyée à l'adresse morte. Ces
 * machines-là ne peuvent plus être achetées, ce qui n'est pas la même chose
 * qu'être brûlées : le coffre a un propriétaire qui peut les en ressortir.
 *
 * Rend `null` si la lecture a échoué. Sans elle on annonce le total frappé, ce
 * qui est vrai, plutôt qu'un « en circulation » qu'on n'a pas mesuré.
 */
export function fleetHeadline(off) {
  const minted = TOTAL_MACHINES;
  const vault = off?.vault ?? null;
  const dead = off?.dead ?? null;
  if (vault === null && dead === null) return null;
  const gone = (vault ?? 0) + (dead ?? 0);
  return {
    minted,
    vault,
    dead,
    // Le coffre est révocable, l'adresse morte ne l'est pas. La page a le droit
    // de les additionner pour dire « pas achetable », jamais pour dire « perdu ».
    circulating: minted - gone,
    share: gone / minted,
  };
}

export function composeSnapshot({
  grid, printer, eth, protocol, stats, book, inkMeta, meta, legend, ink, weights, anvil,
  deskIndex, vote, potUsd, sectorWeight, tickers, holdings, stockPrices, ownerOf, now,
  offCirculation, official, live, ritual, officialArt,
}) {
  // OpenSea republie les Dark avec des heures de retard, et une Dark forgée
  // garde en attendant l'image rouge de brûlée. Le site officiel, lui, publie
  // tout de suite l'œuvre de chaque Dark. Une retardataire emprunte donc l'image
  // OpenSea d'une Dark déjà republiée qui porte la même œuvre officielle.
  // Comparer les adresses OpenSea ne marche pas : le 2026-09-26, la même œuvre
  // y avait une adresse par jeton, la règle a cru à une révélation et sept Dark
  // — dont la #8643 — sont restées rouges. Après la vraie révélation, les
  // œuvres officielles diffèrent et chacune garde la sienne.
  const isPublishedDark = (id) => live?.status?.get(id) === "dark machine";
  const donorOf = new Map();   // œuvre officielle -> image OpenSea d'une Dark republiée
  for (const [id, art] of officialArt ?? []) {
    if (!donorOf.has(art) && isPublishedDark(id) && live?.image?.get(id)) donorOf.set(art, live.image.get(id));
  }
  const darkImageOf = (id) => (!isPublishedDark(id) && donorOf.get(officialArt?.get(id)))
    || live?.image?.get(id) || meta?.get(id)?.image || null;
  const activationPrinter = protocol?.activationInk
    ? Number(BigInt(protocol.activationInk) / 10n ** 15n) / 1000
    : null;

  const activationUsd = activationPrinter !== null && printer?.usd ? activationPrinter * printer.usd : null;
  const activationEth = activationUsd !== null && eth?.usd ? activationUsd / eth.usd : null;

  // Ce que l'ink coûte et ce que l'activation coûte sont deux montants
  // différents — 4 250 brûlent, 750 s'ajoutent sans brûler. La page affichait
  // le premier dans son bandeau et comptait le second dans les prix au point,
  // sans jamais dire qu'ils n'étaient pas le même nombre.
  const activationTotalPrinter = activationPrinter === null
    ? null
    : activationPrinter + OPERATING_CHARGE_PRINTER;
  const activationTotalUsd = activationTotalPrinter !== null && printer?.usd
    ? activationTotalPrinter * printer.usd
    : null;

  // Chaque machine en vente porte sa photo et son couvre-chef. Une photo
  // absente laisse `machine: null` et ne touche à aucun prix : on n'a pas
  // trouvé l'image, pas perdu le marché.
  const machineOf = (tokenId) => {
    const m = meta?.get(tokenId);
    if (!m) return null;
    // Le desk voyage avec la machine : la page filtre et étiquette sans avoir
    // à retraverser l'index pour chaque vignette. C'est un secteur, lu sur la
    // chaîne — plus une couleur de corps interprétée.
    const index = deskIndex?.get(tokenId);
    return {
      ...m,
      // L'image publiée aujourd'hui, pas celle du mint : le Meltdown a repeint
      // en rouge les machines qu'il a brûlées, et une vignette d'avant les
      // vendrait sous un visage qu'elles n'ont plus. Les traits, eux, restent
      // ceux du mint — c'est d'eux que dépend la dérivation des classes.
      image: ritual?.forged?.has(tokenId) || isPublishedDark(tokenId)
        ? darkImageOf(tokenId)
        : live?.image?.get(tokenId) ?? m.image,
      burned: live?.status?.get(tokenId) === "burned",
      // Forgée au Rituel noir, ou seulement publiée comme telle : la page dit
      // lequel, parce que la #23 était la seconde sans être la première.
      dark: Boolean(ritual?.forged?.has(tokenId) || live?.status?.get(tokenId) === "dark machine"),
      ritualId: ritual?.forged?.get(tokenId) ?? null,
      // Le nom officiel d'un desk est son ticker : c'est ce que publient les
      // métadonnées de la collection, et c'est ce que cherche un porteur — on
      // ne demande pas « les machines du secteur utilities », on demande GME.
      // Le secteur reste en second, pour ceux qui raisonnent par thème. Sans
      // métadonnée lue, on retombe sur le secteur plutôt que sur rien.
      desk: m.desk ?? deskName(index),
      sector: deskName(index),
      // Le ticker que ce desk porte cette epoch. Il voyageait déjà avec les
      // machines d'un portefeuille mais pas avec celles du carnet, si bien que
      // le panneau de détail annonçait « pas de ticker au bulletin » pour les
      // dix desks qui en avaient un.
      ticker: index === null || index === undefined ? null : (tickers?.[index] ?? null),
    };
  };

  const PRINTER = 10n ** 18n;

  // Ce qu'une machine toucherait si le pot était distribué maintenant. Le poids
  // total est celui de la chaîne : une dormante pèse zéro, donc il ne compte
  // déjà que les machines qui gagnent.
  const fleetWeight = protocol?.totalWeight === null || protocol?.totalWeight === undefined
    ? null
    : Number(protocol.totalWeight);
  // Le dépouillement en cours, dans l'ordre des desks : sans lui on ne peut pas
  // découper le pot en tranches, et le partage à plat est le seul honnête.
  const tally = vote ? Array.from({ length: 16 }, (_, d) => Number(vote.tally.get(d) ?? 0n)) : null;
  // Ce que la machine contient déjà, et ce que ça vaut. Le compte appartient
  // au jeton : cela part avec elle à la vente.
  const priceOf = (sym) => stockPrices?.get(sym) ?? null;
  const heldBy = (tokenId) => {
    const list = holdings?.get(tokenId);
    if (!list?.length) return null;
    const v = valueHoldings(list, priceOf);
    return { lines: v.lines, usd: v.usd };
  };

  const returnOf = (tokenId, weight) => epochUsd({
    weight, deskIndex: deskIndex?.get(tokenId) ?? null,
    totalWeight: fleetWeight, potUsd, tally, sectorWeight,
  });

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
      inkMult: weight && classValue ? weight / classValue : null,
      epochUsd: returnOf(e.tokenId, weight),
      // La chaîne dit d'une machine du rayon exactement ce qu'elle dit d'une
      // machine d'OpenSea. Le panneau de détail les affichait à moitié vide
      // parce qu'on ne les lui donnait pas, pas parce qu'elles manquaient.
      inkPrinter: ink?.get(e.tokenId) === undefined ? null : Number(ink.get(e.tokenId) / PRINTER),
      holds: heldBy(e.tokenId),
      askUsd: printer?.usd ? e.askPrinter * printer.usd : null,
      askEth: printer?.usd && eth?.usd ? (e.askPrinter * printer.usd) / eth.usd : null,
    };
  };

  // `burned` couvre aussi les Dark Machines : ni l'une ni l'autre ne touche le
  // pot selon l'équipe, et la page ne leur promet donc aucun drop.
  const withMachines = (cell, classValue, burned = false) => ({
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
        // La chaîne lui donne encore un poids, mais l'équipe annonce qu'une
        // brûlée ne touchera plus rien. On n'affiche pas un revenu que le
        // protocole a dit ne plus verser : ni zéro affirmé, ni montant.
        epochUsd: burned ? null : returnOf(e.tokenId, weight),
        holds: heldBy(e.tokenId),
        // Le compte du NFT et son porteur : de quoi vérifier soi-même ce que
        // la fiche annonce, sans avoir à nous croire.
        account: meta?.get(e.tokenId)?.wallet ?? null,
        owner: ownerOf?.get(e.tokenId) ?? null,
        // Une machine dormante ne pèse rien : un rapport n'aurait aucun sens.
        inkMult: weight && classValue ? weight / classValue : null,
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
    burned: withMachines(r.burned ?? { entries: [], anvilEntries: [] }, r.classValue, true),
  }));

  // Le carnet des Dark Machines : une case pour toute la collection.
  const darkBook = withMachines(grid.dark ?? { entries: [], anvilEntries: [] }, null, true);

  // Toutes les Dark Machines, en vente ou non. Une vingtaine : on les montre
  // toutes, parce qu'une catégorie dont on ne voit que ce qui se vend ne se
  // voit pas du tout le jour où rien ne se vend — c'était le cas à l'ouverture.
  // Une machine partie à l'adresse morte n'en fait plus partie.
  const DEAD = "0x000000000000000000000000000000000000dead";
  const askOf = new Map(darkBook.entries.map((e) => [e.tokenId, e.priceEth]));
  const darkIds = new Set([
    ...(ritual?.forged?.keys() ?? []),
    ...[...(live?.status ?? [])].filter(([, st]) => st === "dark machine").map(([id]) => id),
  ]);
  const darkFleet = [...darkIds]
    .filter((id) => ownerOf?.get(id)?.toLowerCase() !== DEAD)
    .sort((a, b) => a - b)
    .map((tokenId) => ({
      tokenId,
      image: darkImageOf(tokenId),
      ritualId: ritual?.forged?.get(tokenId) ?? null,
      owner: ownerOf?.get(tokenId) ?? null,
      priceEth: askOf.get(tokenId) ?? null,
    }));

  const listed = new Set();
  for (const e of darkBook.entries) listed.add(e.tokenId);
  for (const r of rows) {
    for (const e of r.inked.entries) listed.add(e.tokenId);
    for (const e of r.dormant.entries) listed.add(e.tokenId);
    for (const e of r.burned.entries) listed.add(e.tokenId);
  }

  // Le floor de la collection est le moins cher de nos quatorze cases, pas le
  // chiffre publié par OpenSea : il vient du même carnet que tout le reste de
  // la page, donc il ne peut pas la contredire. Les brûlées du Meltdown n'y
  // entrent pas — elles ont leur propre floor, à côté : le prix d'entrée dans
  // une flotte qui imprime n'est pas celui d'une machine qui ne pèsera plus.
  const minOf = (vals) => {
    const v = vals.filter((x) => x !== null && x !== undefined);
    return v.length ? Math.min(...v) : null;
  };
  const floorEth = minOf(rows.flatMap((r) => [r.inked.floorEth, r.dormant.floorEth]));
  const burnedFloorEth = minOf(rows.map((r) => r.burned.floorEth));
  const darkFloorEth = darkBook.floorEth ?? null;
  const inEth = (v) => (v !== null && v !== undefined && eth?.usd ? v * eth.usd : null);
  // Ce qui reste vivant : ni à l'adresse morte, ni marqué brûlé. C'est sur
  // cette flotte-là que le floor se multiplie — dix mille fois le prix d'une
  // vivante comptait 3 497 machines détruites et 4 381 brûlées.
  const dead = offCirculation?.dead ?? 0;
  const alive = TOTAL_MACHINES - dead - (grid.totals?.burned ?? 0) - (grid.totals?.dark ?? 0);

  const collection = {
    floorEth,
    floorUsd: inEth(floorEth),
    // Convention du marché NFT : floor x supply. C'est une valorisation
    // théorique, pas une somme observée — l'étiquette le dit sur la page.
    machines: alive,
    minted: TOTAL_MACHINES,
    destroyed: offCirculation?.dead ?? null,
    burned: grid.totals?.burned ?? null,
    burnedFloorEth,
    burnedFloorUsd: inEth(burnedFloorEth),
    dark: grid.totals?.dark ?? null,
    darkFloorEth,
    darkFloorUsd: inEth(darkFloorEth),
    marketCapEth: floorEth === null ? null : floorEth * alive,
    marketCapUsd: inEth(floorEth === null ? null : floorEth * alive),
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
    // La page bâtit ses liens avec ça au lieu de recopier l'adresse : au
    // basculement vers le nouveau contrat, elle suit sans être retouchée.
    contract: ADDRESSES.MACHINES,
    slug: OPENSEA.slug,
  };

  return {
    at: now,
    rows,
    darkBook,
    darkFleet,
    // Le Rituel noir tel que la chaîne l'enregistre, et ce que le statut publié
    // affirme en plus : une Dark Machine sans rituel est nommée, pas cachée.
    ritual: ritual ? {
      rituals: ritual.rituals, won: ritual.won, lost: ritual.lost, pending: ritual.pending,
      winRate: ritual.winRate, claimedWinRate: DARK.claimedWinBps / 10000,
      fuelBurned: ritual.fuelBurned, printerBurned: ritual.printerBurned, ethPaid: ritual.ethPaid,
      forged: ritual.forged.size,
      unforged: [...(live?.status ?? [])]
        .filter(([id, st]) => st === "dark machine" && !ritual.forged.has(id)).map(([id]) => id).sort((a, b) => a - b),
    } : null,
    // D'où vient chaque chiffre. Scellé, donc servi tel quel : c'est une
    // déclaration, pas une mesure.
    sources: { list: SOURCES, kinds: SOURCE_KINDS },
    legend: legend ?? null,
    traitFilters: meta ? buildTraitIndex({ meta, listed,
      deskOf: (id) => meta.get(id)?.desk ?? deskName(deskIndex?.get(id)) }) : null,
    excluded: grid.excluded,
    totals: grid.totals,
    printer,
    eth,
    // Le pot en attente et le poids de la flotte : les deux nombres qui
    // transforment un poids en dollars.
    pot: {
      usd: potUsd ?? null,
      fleetWeight,
    },
    ink: {
      activationPrinter,
      activationUsd,
      activationEth,
      activationTotalPrinter,
      activationTotalUsd,
      readAt: inkMeta?.readAt ?? null,
      failures: inkMeta?.failures ?? null,
    },
    protocol,
    // Ce que la collection a détruit, en tête de page. L'offre frappée au
    // départ est scellée à 200 millions : la part brûlée est donc une
    // soustraction, pas une estimation.
    burn: burnHeadline(protocol),
    fleet: fleetHeadline(offCirculation),
    // Ce que le protocole publie de son propre pot, et le recoupement contre ce
    // qu'on lit nous-mêmes. La page relaie un chiffre qu'elle ne dérive pas :
    // elle doit pouvoir dire quand il cesse de tenir.
    official: official
      ? { ...official, check: crossCheck({ official, swapperUsdg: potUsd }) }
      : null,
    // Le scrutin décide de la taille des parts du pot, donc du coefficient qui
    // s'applique par desk. Illisible, il vaut null : la page dira qu'elle ne
    // sait pas plutôt que d'annoncer seize parts égales, qu'elles ne sont pas.
    vote: deskShares({ vote, tickers }),
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

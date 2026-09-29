import { CLASSES } from "./config.js";

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const EMPTY = () => ({
  floorEth: null, floorTokenId: null, pelotonEth: null,
  listed: 0, supply: 0, listedRatio: null, entries: [], anvilEntries: [],
});

function buildCell(entries, supply, pelotonSize) {
  const cell = EMPTY();
  cell.supply = supply;
  cell.listed = entries.length;
  cell.listedRatio = supply > 0 ? entries.length / supply : null;
  if (!entries.length) return cell;

  // Le prix d'abord, puis l'identifiant : deux listings au même prix doivent
  // toujours produire le même floor, d'une exécution à l'autre.
  const sorted = [...entries].sort((a, b) => a.priceEth - b.priceEth || a.tokenId - b.tokenId);
  // Le carnet entier de cette case, du moins cher au plus cher. La page en
  // montre huit et déplie le reste ; le floor est simplement le premier.
  cell.entries = sorted.map((e) => ({ tokenId: e.tokenId, priceEth: e.priceEth }));
  cell.floorEth = sorted[0].priceEth;
  cell.floorTokenId = sorted[0].tokenId;
  cell.pelotonEth = sorted.length >= pelotonSize
    ? median(sorted.slice(0, pelotonSize).map((e) => e.priceEth))
    : null;
  return cell;
}

/**
 * `status` (la carte de `readLiveStatus`) et `gone` (les machines de l'adresse
 * morte) sont arrivés avec le Meltdown du 2026-09-23. Sans `status`, la grille
 * garde ses deux états d'avant — c'est ce que font les appelants qui n'en
 * savent rien. Avec, une machine que la carte ne connaît pas est exclue et
 * comptée : la ranger vivante déplacerait le floor des vivantes vers celui des
 * brûlées, sans erreur nulle part.
 *
 * `dark` (les vessels gagnés au Rituel noir, lus sur la chaîne) est arrivé le
 * lendemain. Une Dark Machine est aussi reconnue à son statut publié : la #23
 * l'était sans qu'aucun rituel ne l'ait produite. Elles ne se rangent pas par
 * classe — une vingtaine en tout, sans poids selon l'équipe, un marché à part —
 * et forment une seule case, `grid.dark`, à côté des lignes.
 */
export function buildGrid({ listings, traits, ink, pelotonSize, shelf, status, gone, dark, blue }) {
  const excluded = {
    unknownRarity: 0, unknownInk: 0, unknownStatus: 0, destroyed: 0,
    listingsOffGrid: 0, heldByAnvil: 0,
  };
  const stateOf = new Map();   // tokenId -> "inked" | "dormant" | "burned" | "dark"
  const classOf = new Map();   // tokenId -> weightClass
  const supply = new Map();    // "class:state" -> compte
  // Les Dark et les Blue Machines n'ont qu'une case chacune, sans classe.
  const keyOf = (wc, state) => (state === "dark" || state === "blue" ? state : `${wc}:${state}`);

  for (const [tokenId, t] of traits) {
    if (t?.weightClass == null) { excluded.unknownRarity++; continue; }
    // L'adresse morte ne rend rien : ce n'est plus de l'offre, dans aucune case.
    if (gone?.has(tokenId)) { excluded.destroyed++; continue; }
    const marked = status ? status.get(tokenId) : null;
    // Forgée sur la chaîne, elle est Dark même si OpenSea ne l'a pas encore
    // republiée — il avait six machines de retard le jour de l'ouverture.
    if (dark?.has(tokenId) || marked === "dark machine") {
      stateOf.set(tokenId, "dark");
      classOf.set(tokenId, t.weightClass);
      supply.set("dark", (supply.get("dark") ?? 0) + 1);
      continue;
    }
    // Remise par le contrat Blue (2026-09-28) : la chaîne le dit sans attendre
    // OpenSea. Même règle que les Dark : une case pour toute la collection.
    if (blue?.has(tokenId) || marked === "blue machine") {
      stateOf.set(tokenId, "blue");
      classOf.set(tokenId, t.weightClass);
      supply.set("blue", (supply.get("blue") ?? 0) + 1);
      continue;
    }
    if (status && marked === undefined) { excluded.unknownStatus++; continue; }
    const burned = ink.get(tokenId);
    if (burned == null) { excluded.unknownInk++; continue; }
    // Brûlée par le Meltdown, elle garde son encre et son poids sur la chaîne,
    // mais l'équipe annonce qu'elle ne portera plus jamais de poids. Elle n'est
    // ni une allumée ni une dormante qu'on pourrait allumer : sa propre case.
    const state = marked === "burned" ? "burned" : burned > 0n ? "inked" : "dormant";
    stateOf.set(tokenId, state);
    classOf.set(tokenId, t.weightClass);
    const k = keyOf(t.weightClass, state);
    supply.set(k, (supply.get(k) ?? 0) + 1);
  }

  const byCell = new Map();    // "class:state" -> entries[]
  for (const entry of listings.values()) {
    // Le vault détient les machines de son rayon : personne d'autre ne peut les
    // vendre. Un listing OpenSea qui subsiste pour l'une d'elles est un résidu,
    // inexécutable, et il tirerait le floor vers le bas sans que rien ne soit
    // achetable à ce prix.
    if (shelf?.has(entry.tokenId)) { excluded.heldByAnvil++; continue; }
    const state = stateOf.get(entry.tokenId);
    const wc = classOf.get(entry.tokenId);
    // En vente, mais sa rareté ou son encre n'a jamais été lue : impossible de
    // la placer, et deviner une case déplacerait silencieusement le floor de
    // cette case.
    if (state === undefined || wc === undefined) { excluded.listingsOffGrid++; continue; }
    const k = keyOf(wc, state);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(entry);
  }

  // Le rayon de l'anvil est un second marché, libellé en $PRINTER. Il se range
  // dans les mêmes cases mais reste à part : une machine que l'anvil détient
  // n'est pas en vente sur OpenSea, et les comptages du carnet ne doivent pas
  // l'inclure.
  const shelfByCell = new Map();
  for (const [tokenId, askPrinter] of shelf ?? []) {
    const state = stateOf.get(tokenId);
    const wc = classOf.get(tokenId);
    if (state === undefined || wc === undefined) continue;
    const k = keyOf(wc, state);
    if (!shelfByCell.has(k)) shelfByCell.set(k, []);
    shelfByCell.get(k).push({ tokenId, askPrinter });
  }
  const shelfFor = (key) =>
    (shelfByCell.get(key) ?? []).sort((a, b) => a.askPrinter - b.askPrinter || a.tokenId - b.tokenId);

  const rows = CLASSES.map((c) => {
    const inked = buildCell(byCell.get(`${c.value}:inked`) ?? [], supply.get(`${c.value}:inked`) ?? 0, pelotonSize);
    const dormant = buildCell(byCell.get(`${c.value}:dormant`) ?? [], supply.get(`${c.value}:dormant`) ?? 0, pelotonSize);
    const burned = buildCell(byCell.get(`${c.value}:burned`) ?? [], supply.get(`${c.value}:burned`) ?? 0, pelotonSize);
    inked.anvilEntries = shelfFor(`${c.value}:inked`);
    dormant.anvilEntries = shelfFor(`${c.value}:dormant`);
    burned.anvilEntries = shelfFor(`${c.value}:burned`);
    return {
      classValue: c.value,
      classLabel: c.label,
      docCount: c.docCount,
      chainCount: inked.supply + dormant.supply + burned.supply,
      inked,
      dormant,
      burned,
      spreadEth: inked.floorEth !== null && dormant.floorEth !== null
        ? inked.floorEth - dormant.floorEth
        : null,
    };
  });

  const darkCell = buildCell(byCell.get("dark") ?? [], supply.get("dark") ?? 0, pelotonSize);
  darkCell.anvilEntries = shelfFor("dark");
  const blueCell = buildCell(byCell.get("blue") ?? [], supply.get("blue") ?? 0, pelotonSize);
  blueCell.anvilEntries = shelfFor("blue");

  return {
    rows,
    dark: darkCell,
    blue: blueCell,
    excluded,
    totals: {
      inked: rows.reduce((n, r) => n + r.inked.supply, 0),
      dormant: rows.reduce((n, r) => n + r.dormant.supply, 0),
      burned: rows.reduce((n, r) => n + r.burned.supply, 0),
      dark: darkCell.supply,
      blue: blueCell.supply,
      listed: rows.reduce((n, r) => n + r.inked.listed + r.dormant.listed + r.burned.listed, 0) +
        darkCell.listed + blueCell.listed,
    },
  };
}

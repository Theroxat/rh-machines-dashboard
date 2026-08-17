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

export function buildGrid({ listings, traits, ink, pelotonSize, shelf, shelfQueue }) {
  const excluded = { unknownRarity: 0, unknownInk: 0, listingsOffGrid: 0, heldByAnvil: 0 };
  const stateOf = new Map();   // tokenId -> "inked" | "dormant"
  const classOf = new Map();   // tokenId -> weightClass
  const supply = new Map();    // "class:state" -> compte

  for (const [tokenId, t] of traits) {
    if (t?.weightClass == null) { excluded.unknownRarity++; continue; }
    const burned = ink.get(tokenId);
    if (burned == null) { excluded.unknownInk++; continue; }
    const state = burned > 0n ? "inked" : "dormant";
    stateOf.set(tokenId, state);
    classOf.set(tokenId, t.weightClass);
    const k = `${t.weightClass}:${state}`;
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
    const k = `${wc}:${state}`;
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
    const k = `${wc}:${state}`;
    if (!shelfByCell.has(k)) shelfByCell.set(k, []);
    shelfByCell.get(k).push({ tokenId, askPrinter, queuePrinter: shelfQueue?.get(tokenId) ?? null });
  }
  const shelfFor = (key) =>
    (shelfByCell.get(key) ?? []).sort((a, b) => a.askPrinter - b.askPrinter || a.tokenId - b.tokenId);

  const rows = CLASSES.map((c) => {
    const inked = buildCell(byCell.get(`${c.value}:inked`) ?? [], supply.get(`${c.value}:inked`) ?? 0, pelotonSize);
    const dormant = buildCell(byCell.get(`${c.value}:dormant`) ?? [], supply.get(`${c.value}:dormant`) ?? 0, pelotonSize);
    inked.anvilEntries = shelfFor(`${c.value}:inked`);
    dormant.anvilEntries = shelfFor(`${c.value}:dormant`);
    return {
      classValue: c.value,
      classLabel: c.label,
      docCount: c.docCount,
      chainCount: inked.supply + dormant.supply,
      inked,
      dormant,
      spreadEth: inked.floorEth !== null && dormant.floorEth !== null
        ? inked.floorEth - dormant.floorEth
        : null,
    };
  });

  return {
    rows,
    excluded,
    totals: {
      inked: rows.reduce((n, r) => n + r.inked.supply, 0),
      dormant: rows.reduce((n, r) => n + r.dormant.supply, 0),
      listed: rows.reduce((n, r) => n + r.inked.listed + r.dormant.listed, 0),
    },
  };
}

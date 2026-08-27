/**
 * D'où vient chaque chiffre.
 *
 * Le tableau de bord reproche au terminal officiel de ne pas cadrer ses
 * sources ; il ne peut pas se dispenser de le faire lui-même. Rien de ce qui
 * suit n'est décoratif : savoir qu'un floor vient d'une API et non de la chaîne
 * change ce qu'on peut en conclure, et le jour où cette API déraille — c'est
 * arrivé deux fois — le lecteur doit pouvoir le comprendre seul.
 *
 * La distinction n'est pas « fiable / douteux ». Elle est plus précise :
 *
 *   `chain`  — lu par RPC sur un contrat nommé. N'importe qui peut refaire la
 *              lecture et doit trouver le même chiffre. Rien à croire.
 *
 *   `api`    — servi par un tiers. Vérifiable seulement en interrogeant ce même
 *              tiers, donc on lui fait confiance ou on ne s'en sert pas.
 *
 *   `derived`— calculé ici à partir des deux précédents. C'est notre travail, et
 *              c'est là que nos erreurs vivent.
 *
 * Un prix en dollars ne peut pas venir de la chaîne : elle connaît les réserves
 * d'une pool, jamais un cours. Un carnet d'ordres non plus : les ordres OpenSea
 * sont signés hors chaîne et ne la touchent qu'à l'exécution. Ces deux-là ne
 * sont pas des raccourcis, ce sont des limites.
 */
export const SOURCES = Object.freeze([
  // --- la chaîne ---
  { what: "Weight and ink of every Machine", kind: "chain", from: "MINE contract" },
  { what: "Who owns every Machine", kind: "chain", from: "Machines contract" },
  { what: "Each Machine's desk", kind: "chain", from: "Machines contract" },
  { what: "The ballot and its tally", kind: "chain", from: "Vote contract" },
  { what: "USDG already converted and ready to buy", kind: "chain", from: "balance of the swapper" },
  { what: "The Anvil's bid, shelf and crate", kind: "chain", from: "Vault contract" },
  { what: "The stock held inside each Machine", kind: "chain", from: "each Machine's 6551 account" },
  { what: "Epoch, activation cost, sell fee", kind: "chain", from: "MINE contract" },
  { what: "Every coin on PRINTER.FUN", kind: "chain", from: "both pad factories" },
  { what: "Fusions, wins, losses, the vault", kind: "chain", from: "Proton contract logs" },
  { what: "$PRINTER supply and ink burned", kind: "chain", from: "token and MINE contracts" },

  // --- des tiers ---
  {
    what: "Every asking price on this site",
    kind: "api", from: "OpenSea",
    note: "Orders are signed off-chain and only touch the chain when someone buys. " +
      "There is no order book on-chain to read instead.",
  },
  { what: "Pictures and traits", kind: "api", from: "OpenSea" },
  { what: "Collection volume and sales", kind: "api", from: "OpenSea" },
  {
    what: "Every dollar figure on this site",
    kind: "api", from: "DexScreener, with CoinGecko as a fallback for ETH",
    note: "The chain knows a pool's reserves, never a price in dollars. Both pairs are pinned by " +
      "address: picked by symbol or by depth, the lookup lands on an impostor USDG that prices " +
      "ETH 5% wrong.",
  },
  { what: "Pool, cap and volume of graduated coins", kind: "api", from: "DexScreener" },
  {
    what: "The size of the pot, and how it splits",
    kind: "api", from: "the protocol's own service",
    note: "No contract exposes a view that adds the pot up — it is summed off-chain across four " +
      "contracts. Reproducing that sum here reaches about 80% of it, so the figure is taken from " +
      "the protocol and cross-checked against the USDG we read ourselves.",
  },

  // --- notre travail ---
  {
    what: "Which headwear grants which rarity",
    kind: "derived", from: "the collection itself, on every boot",
    note: "Cross-checked against the chain at startup; a headwear appearing under two rarities " +
      "would be named rather than filed under one.",
  },
  {
    what: "What a Machine earns from the pot",
    kind: "derived", from: "weight, desk and the tally",
    note: "Validated against the first real drop: predicted $77.77, paid $76.49.",
  },
  { what: "Price per weight point, and the ROI ranking", kind: "derived", from: "asking price and weight" },
]);

export const SOURCE_KINDS = Object.freeze({
  chain: { label: "read from the chain", blurb: "anyone can repeat the read and must get the same figure" },
  api: { label: "served by a third party", blurb: "trusted, not verifiable here" },
  derived: { label: "computed here", blurb: "our arithmetic, and so where our mistakes live" },
});

/** Les hôtes tiers réellement interrogés. Un test compare cette liste au code :
 *  une source ajoutée sans être déclarée ici fait échouer la suite. */
export const THIRD_PARTY_HOSTS = Object.freeze([
  "www.rhmachines.com",
  "api.opensea.io",
  "api.dexscreener.com",
  "api.coingecko.com",
]);

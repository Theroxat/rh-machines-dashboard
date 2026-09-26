export const CHAIN_ID = 4663;
export const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

/**
 * La collection est en cours de migration vers un nouveau contrat — l'original
 * n'imposait pas de frais de vente, et l'équipe en redéploie un qui les
 * applique. L'adresse et le slug se surchargent donc par l'environnement : le
 * jour du basculement, c'est un `.env` et un redémarrage, pas une modification
 * de code, une reconstruction et une suite de tests pendant que le marché tourne.
 */
export const MACHINES_ADDRESS =
  (process.env.MACHINES_ADDRESS ?? "").trim() || "0xB509e195bcB3E4461e235Ff152c68D66915f67b5";

export const ADDRESSES = Object.freeze({
  MACHINES:   MACHINES_ADDRESS,
  MINE:       "0x3C4E763E87Ac5775A23aE2eb2e69F90232f413E1",
  TRAITS:     "0x8a0833f41cE9e869d6ebd8aC16EfDC9Ee7a38a22",
  // The Anvil : le teneur de marché du protocole. Ni l'adresse ni l'ABI ne sont
  // documentées — extraites des bundles du terminal officiel, vérifiées on-chain.
  VAULT:      "0x03645012b560Ea96Ab9a050dF98C72BfCBc9bE4F",
  TOKEN:      "0x85a574f2fF0795685F58d1D7B0D4b51F148Ac489",
  MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  USDG:       "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  WETH:       "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  // Le hook Uniswap qui prélève le frais de vente du $PRINTER : sans lui, une
  // comparaison entre un prix en PRINTER et un prix en ETH surestime le premier.
  HOOK:       "0x3685cc4Aa1266813Fa0EF346853341b0778C80Cc",
  // Le scrutin, qui décide de la taille des parts du pot. Aucun des contrats
  // ci-dessus n'y renvoie : l'adresse vient de la carte publiée par les bundles
  // du terminal, relevée le 2026-08-17 et vérifiée on-chain.
  VOTE:       "0x315A3aefa0F8547e79E85e0Ce644DA2A149a018F",
  // Lus dans la même carte, gardés pour référence : ce sont eux qui achètent
  // les actions et qui les poussent dans les comptes des machines.
  SWAPPER:    "0xE43244260Ee978F28fD2052481a5E6E1FAcEbDc6",
  DISTRIBUTOR: "0xf1C50FfEB5cC8A50B153cEEd1b7Dd0C42f3e5438",
});

export const TOTAL_MACHINES = 10000;

/**
 * PRINTER.FUN — le memepad du même écosystème, lancé le 2026-08-23.
 *
 * Deux factories tournent en parallèle et partagent la même trésorerie ; la
 * seconde n'a pas remplacé la première, elles reçoivent des lancements toutes
 * les deux. Aucune n'est référencée par un contrat public : les adresses
 * viennent des bundles du site, et chacune a été vérifiée sur la chaîne par un
 * appel à `coinsCount()`.
 *
 * La trésorerie est gardée pour référence — c'est elle qui encaisse le frais de
 * 1% avant qu'il ne rachète et ne brûle du $PRINTER.
 */
/**
 * Le Proton et son coffre, ajoutés à l'écosystème le 2026-08-22.
 *
 * On y sacrifie une machine pour en alourdir une autre. La sacrifiée part au
 * coffre — elle n'est pas détruite : `totalSupply` du NFT ne bouge pas.
 *
 * Ni l'un ni l'autre n'est vérifié sur l'explorateur. Les adresses viennent de
 * `/api/protonConfig` du site officiel, relevées le 2026-08-25 et recoupées
 * on-chain : le Proton répond à `nextCommitId()`, le coffre à `heldCount()`.
 *
 * Les deux ont le même propriétaire, `0xA08c58FC…AA3d17`, une clé simple et non
 * un multisig. Le coffre expose `releaseMachine(uint256,address)`, réservée à ce
 * propriétaire : les machines y sont déposées, pas scellées.
 */
export const PROTON = Object.freeze({
  contract: "0xbA28ac2377291E1d92B4cB5fD587dC24604dA8aE",
  factory: "0xE4979E6c766a239C8e491433d42E697B22fAcf40",
  owner: "0xA08c58FCC285D9Cd48b7122293C8a62446AA3d17",
  claimedSuccessBps: 8000,
});

/**
 * Le Rituel noir, ouvert le 2026-09-23 à 22:22 UTC. Quatre machines brûlées
 * partent à l'adresse morte, une cinquième — le « vessel » — devient Dark
 * Machine si la partie est gagnée.
 *
 * L'équipe a changé de contrat le lendemain, 2026-09-24 à 19:14 UTC, sans rien
 * annoncer, et les numéros de rituel y repartent à 1. Le dashboard n'en lisait
 * qu'un : un porteur a gagné sa Dark sur le second et ne la voyait pas. Chaque
 * contrat a son plancher de lecture (`fromBlock`, un peu avant son premier
 * journal : ce nœud sert les journaux, pas l'état historique). Un contrat
 * suivant est découvert par `/api/dark` du site officiel et n'est lu que si son
 * `owner()` est la clé ci-dessous — celle du Proton et du coffre.
 */
export const DARK = Object.freeze({
  contracts: Object.freeze([
    Object.freeze({ address: "0x207455FDbb3F0DEc567b9c83176FCee3e0940506", fromBlock: 70_867_000 }),
    Object.freeze({ address: "0x6adA619F5e8613BaDb833445F74f467eEeF98c3E", fromBlock: 71_611_000 }),
  ]),
  api: "https://www.rhmachines.com/api/dark",
  owner: "0xA08c58FCC285D9Cd48b7122293C8a62446AA3d17",
  claimedWinBps: 6000,
});

/**
 * Le contrat de drop par tours, apparu le 2026-09-03 : un « keeper » pousse les
 * parts une à une (`airdrop(uint256[])`), et le contrat note pour chaque
 * machine sa part (`shareOf`) et si elle a été versée (`paidThisRound`). Il a
 * payé 7 689 machines en NVDA ce jour-là ; 193 ont une part enregistrée et
 * jamais versée — 16,3 NVDA en tout — et le 2026-09-24 le contrat n'en détenait
 * plus. Adresse relevée dans les journaux `Transfer` du NVDA reçu par #4347 ;
 * `owner()` est la clé du Proton. Le jeton n'est exposé par aucune vue : il est
 * figé ici pour le tour 1, et un autre tour se lit sans nom de jeton.
 */
export const DROPS = Object.freeze({
  contract: "0xFAc5FD9cabD83A97596063E853632122a901AF9d",
  rounds: Object.freeze({
    1: Object.freeze({ token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", symbol: "NVDA", decimals: 18, date: "2026-09-03" }),
  }),
});

export const PAD = Object.freeze({
  factories: Object.freeze([
    "0x0C8c78ab91b87a03659c8AD4A11e6d23d5Ab869b",
    "0x285c1778a6714480aa0fCC468317E621096F1cec",
  ]),
  treasury: "0x81c63D977aA9C2e6Ed5d51abE3fbfF2d2C23BC20",
  site: "https://www.printer.fun/",
});

/**
 * Activer une machine coûte 5 000 $PRINTER : 4 250 partent en ink — la chaîne
 * expose ce montant sous `ACTIVATION_INK`, et c'est le dénominateur de
 * `√(ink/4250)` — et 750 en charge d'exploitation, qui ne brûlent pas.
 *
 * Aucune vue du contrat ne publie ces 750 : ils viennent de la documentation.
 * Ils sont donc écrits ici, nommés et isolés, plutôt que fondus dans un total
 * qui se lirait comme une lecture on-chain. La part brûlée décide du poids ;
 * la facture entière décide de ce que l'activation coûte à l'acheteur, et les
 * deux ne doivent jamais être confondues.
 */
export const OPERATING_CHARGE_PRINTER = 750;

export const OPENSEA = Object.freeze({
  base: "https://api.opensea.io/api/v2",
  slug: (process.env.OPENSEA_SLUG ?? "").trim() || "rh-machines",
  chain: "robinhood",
  itemUrl: (tokenId) =>
    `https://opensea.io/assets/robinhood/${ADDRESSES.MACHINES.toLowerCase()}/${tokenId}`,
});

// Les deux paires sont épinglées par adresse. Les choisir par symbole ou par
// profondeur tombe sur l'imposteur USDG (0x63575aA9...), qui price l'ETH 5% faux.
export const DEX = Object.freeze({
  base: "https://api.dexscreener.com/latest/dex/pairs/robinhood",
  printerPair: "0xf6c9f0a8bf94ecda6751465a3097bc4c69914421126d2cbc3df723e36b8cf47b",
  ethPair: "0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca",
  coingecko: "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
  usdgDepegTolerance: 0.03,
});

/** Classes de rareté scellées. docCount est le recensement publié : il ne sert
 *  qu'à recouper ce que la chaîne renvoie, jamais de source. */
export const CLASSES = Object.freeze([
  { value: 100,  label: "x1",   docCount: 7131 },
  { value: 150,  label: "x1.5", docCount: 407  },
  { value: 200,  label: "x2",   docCount: 1356 },
  { value: 300,  label: "x3",   docCount: 559  },
  { value: 400,  label: "x4",   docCount: 429  },
  { value: 600,  label: "x6",   docCount: 81   },
  { value: 1000, label: "x10",  docCount: 37   },
]);

export const CLASS_BY_VALUE = new Map(CLASSES.map((c) => [c.value, c]));

export function loadConfig(env, raw) {
  const fail = (m) => { throw new Error(`invalid config: ${m}`); };

  const key = (env.OPENSEA_API_KEY || "").trim();
  if (!key) fail("OPENSEA_API_KEY is empty or absent");

  const num = (name, min, max) => {
    const v = raw[name];
    if (typeof v !== "number" || !Number.isFinite(v)) fail(`${name} must be a number`);
    if (v < min || v > max) fail(`${name} must be between ${min} and ${max}`);
    return v;
  };

  return Object.freeze({
    openseaApiKey: key,
    // Facultatif : sans lui, le service tourne et ne notifie rien. Une adresse
    // de webhook est un secret — elle vit dans l'environnement, jamais ici.
    discordWebhook: (env.DISCORD_WEBHOOK ?? "").trim() || null,
    port:                num("port", 1, 65535),
    bookPollIntervalMs:  num("bookPollIntervalMs", 10000, 3600000),
    inkPollIntervalMs:   num("inkPollIntervalMs", 60000, 86400000),
    pelotonSize:         num("pelotonSize", 3, 50),
    multicallBatchSize:  num("multicallBatchSize", 50, 1000),
    maxBookPages:        num("maxBookPages", 1, 5000),
    maxMetadataPages:    num("maxMetadataPages", 1, 1000),
    padPollIntervalMs:   num("padPollIntervalMs", 60000, 86400000),
    protonPollIntervalMs: num("protonPollIntervalMs", 60000, 86400000),
  });
}

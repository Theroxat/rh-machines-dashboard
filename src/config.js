export const CHAIN_ID = 4663;
export const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";

export const ADDRESSES = Object.freeze({
  MACHINES:   "0xB509e195bcB3E4461e235Ff152c68D66915f67b5",
  MINE:       "0x3C4E763E87Ac5775A23aE2eb2e69F90232f413E1",
  TRAITS:     "0x8a0833f41cE9e869d6ebd8aC16EfDC9Ee7a38a22",
  TOKEN:      "0x85a574f2fF0795685F58d1D7B0D4b51F148Ac489",
  MULTICALL3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  USDG:       "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  WETH:       "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
});

export const TOTAL_MACHINES = 10000;

export const OPENSEA = Object.freeze({
  base: "https://api.opensea.io/api/v2",
  slug: "rh-machines",
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
    port:                num("port", 1, 65535),
    bookPollIntervalMs:  num("bookPollIntervalMs", 10000, 3600000),
    inkPollIntervalMs:   num("inkPollIntervalMs", 60000, 86400000),
    pelotonSize:         num("pelotonSize", 3, 50),
    multicallBatchSize:  num("multicallBatchSize", 50, 1000),
    maxBookPages:        num("maxBookPages", 1, 5000),
    maxMetadataPages:    num("maxMetadataPages", 1, 1000),
  });
}

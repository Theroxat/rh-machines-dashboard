import { DEX, ADDRESSES } from "./config.js";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function pair(url, fetchImpl, label) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`DexScreener returned ${res.status} for ${label}`);
  const body = await res.json();
  const p = body?.pairs?.[0];
  if (!p) throw new Error(`${label} pair is absent from the DexScreener response`);
  return p;
}

export async function fetchPrinter(fetchImpl = fetch) {
  const p = await pair(`${DEX.base}/${DEX.printerPair}`, fetchImpl, "PRINTER");
  const usd = num(p.priceUsd);
  if (usd === null || usd <= 0) throw new Error("PRINTER price is unreadable");
  return {
    usd,
    change24h: num(p.priceChange?.h24),
    liquidityUsd: num(p.liquidity?.usd),
    fdv: num(p.fdv),
  };
}

/**
 * L'ETH est prixé depuis le pool USDG/WETH de cette chaîne, épinglé par adresse.
 * Deux tokens de Robinhood Chain répondent au symbole USDG, et le plus profond
 * des deux pools utilise le mauvais — il price l'ETH 5% trop bas. Le symbole et
 * la profondeur sont donc tous deux inutilisables comme sélecteurs : les
 * adresses sont vérifiées à chaque lecture.
 */
export async function fetchEthUsd(fetchImpl = fetch) {
  const p = await pair(`${DEX.base}/${DEX.ethPair}`, fetchImpl, "USDG/WETH");

  const base = (p.baseToken?.address ?? "").toLowerCase();
  const quote = (p.quoteToken?.address ?? "").toLowerCase();
  if (base !== ADDRESSES.USDG.toLowerCase() || quote !== ADDRESSES.WETH.toLowerCase()) {
    throw new Error(`ETH pair holds unexpected tokens: ${base} / ${quote}`);
  }

  const usdgInWeth = num(p.priceNative);
  const usdgUsd = num(p.priceUsd);
  if (!usdgInWeth || usdgInWeth <= 0 || !usdgUsd) throw new Error("ETH pair is unreadable");
  if (Math.abs(usdgUsd - 1) > DEX.usdgDepegTolerance) {
    throw new Error(`USDG depeg: quoted at ${usdgUsd}, outside the ${DEX.usdgDepegTolerance} tolerance`);
  }

  const local = (1 / usdgInWeth) * usdgUsd;

  let coingecko = null;
  try {
    const res = await fetchImpl(DEX.coingecko);
    if (res.ok) coingecko = num((await res.json())?.ethereum?.usd);
  } catch {
    coingecko = null;   // un deuxième avis qui manque n'est pas une raison de s'arrêter
  }

  return {
    usd: local,
    local,
    coingecko,
    spreadPct: coingecko ? Math.abs(local - coingecko) / coingecko * 100 : null,
  };
}

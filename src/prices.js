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
    volume24h: num(p.volume?.h24),
    fdv: num(p.fdv),
    marketCap: num(p.marketCap),
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
  const usdg = ADDRESSES.USDG.toLowerCase();
  const weth = ADDRESSES.WETH.toLowerCase();

  // DexScreener a retourné cette paire un matin : `base` et `quote` ont changé
  // de place sans prévenir, et le garde par adresse — écrit pour écarter le
  // faux USDG — a refusé la vraie paire pendant que le site ne servait plus
  // rien. Les deux jetons comptent, leur ordre non : c'est l'orientation qui
  // décide comment lire le prix, pas ce qu'on accepte.
  const pairIs = (a, b) => base === a && quote === b;
  if (!pairIs(usdg, weth) && !pairIs(weth, usdg)) {
    throw new Error(`ETH pair holds unexpected tokens: ${base} / ${quote}`);
  }
  const usdgFirst = pairIs(usdg, weth);

  const native = num(p.priceNative);
  const inUsd = num(p.priceUsd);
  if (!native || native <= 0 || !inUsd) throw new Error("ETH pair is unreadable");

  // `priceUsd` cote toujours le jeton de base. Le peg de l'USDG se vérifie donc
  // sur ce prix quand il est en base, et sur `priceUsd ÷ priceNative` quand
  // c'est le WETH qui l'est — dans les deux cas, ce que vaut un USDG.
  const usdgUsd = usdgFirst ? inUsd : inUsd / native;
  if (Math.abs(usdgUsd - 1) > DEX.usdgDepegTolerance) {
    throw new Error(`USDG depeg: quoted at ${usdgUsd}, outside the ${DEX.usdgDepegTolerance} tolerance`);
  }

  // USDG en base : `priceNative` est le prix d'un USDG en WETH, donc l'ETH vaut
  // son inverse. WETH en base : `priceUsd` est déjà le prix de l'ETH.
  const local = usdgFirst ? (1 / native) * usdgUsd : inUsd;

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


/**
 * Ce que valent les actions tokenisées, une requête par jeton.
 *
 * DexScreener les cote toutes. Un jeton sans paire garde sa quantité et reste
 * hors des totaux — mieux vaut une ligne sans prix qu'un prix inventé, parce
 * qu'un zéro ferait passer une machine pleine pour une machine vide.
 */
export async function fetchStockPrices(tokens, fetchImpl = fetch) {
  const out = new Map();
  await Promise.all((tokens ?? []).map(async (t) => {
    try {
      const res = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${t.address}`);
      if (!res.ok) return;
      const pairs = (await res.json())?.pairs ?? [];
      // La paire la plus liquide : sur un jeton coté à plusieurs endroits, la
      // plus fine donne un prix que personne ne pourrait obtenir.
      const best = pairs
        .filter((x) => Number(x?.priceUsd) > 0)
        .sort((a, b) => (Number(b?.liquidity?.usd) || 0) - (Number(a?.liquidity?.usd) || 0))[0];
      if (best) out.set(t.symbol, Number(best.priceUsd));
    } catch {
      // Sans prix, la quantité reste affichée et le total se tait.
    }
  }));
  return out;
}

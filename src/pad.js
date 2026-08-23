/**
 * PRINTER.FUN — le memepad du même écosystème.
 *
 * On y lance une pièce adossée à une action Robinhood tokenisée, échangée sur
 * une courbe de liaison libellée dans cette action. 1% de chaque échange rachète
 * et brûle du $PRINTER ; un dixième de ce frais revient au créateur.
 *
 * Tout est lu sur la chaîne, et pour une raison : l'API du site se contredit
 * elle-même — elle annonce zéro volume et zéro échange sur l'heure dans le même
 * payload que vingt-cinq échanges horodatés, dont un à un million et demi de
 * dollars sur un pad qui n'immobilise pas douze mille dollars. Les deux
 * factories, elles, tiennent le compte exact.
 *
 * Deux chiffres cohabitent et ne disent pas la même chose. L'argent immobilisé
 * est ce que des gens ont réellement versé dans les courbes et qui s'y trouve
 * encore. La capitalisation est le prix marginal de la courbe multiplié par tout
 * le jeton émis — sur une courbe à réserves virtuelles, elle porte sur des
 * jetons que personne n'a achetés. Les deux sont affichés côte à côte, jamais
 * l'un à la place de l'autre.
 */
import { ethers } from "ethers";

export const FACTORY_ABI = new ethers.Interface([
  "function coinsCount() view returns (uint256)",
  "function allCoins(uint256) view returns (address)",
  "function coins(address token) view returns (address base, address creator, uint256 baseReserve, uint256 tokenReserve, uint256 realBase, bool graduated, (uint256,uint256,uint256,uint256,uint256,uint16))",
  "function treasury() view returns (address)",
]);

const TOKEN_ABI = new ethers.Interface([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function totalSupply() view returns (uint256)",
]);

const n18 = (v) => Number(ethers.formatUnits(v ?? 0n, 18));

/** Le graphique d'une pièce graduée, chez DexTools. */
export const dextoolsUrl = (pairAddress) =>
  pairAddress ? `https://www.dextools.io/app/en/robinhood/pair-explorer/${pairAddress}` : null;

/**
 * Ce qu'une pièce vaut, une fois connu le prix de l'action qui lui sert de base.
 * Sans ce prix, les deux montants se taisent — la progression, elle, est un
 * rapport entre deux quantités de la même action et n'en a pas besoin.
 */
export function priceCoin(coin, basePrice) {
  const reserve = n18(coin.tokenReserve);
  const perToken = reserve ? n18(coin.baseReserve) / reserve : 0;
  const grad = n18(coin.gradBase);
  return {
    ...coin,
    basePrice: basePrice ?? null,
    lockedUsd: basePrice == null ? null : n18(coin.realBase) * basePrice,
    nominalUsd: basePrice == null ? null : perToken * n18(coin.supply) * basePrice,
    // Une pièce graduée a quitté la courbe : sa barre est pleine, quoi qu'il
    // reste dans les réserves.
    progress: coin.graduated ? 1 : grad ? Math.min(1, n18(coin.realBase) / grad) : 0,
  };
}

/**
 * La pool d'une pièce graduée.
 *
 * Graduer vide la courbe : les réserves partent dans une vraie pool et la pièce
 * s'y échange. Une graduée affiche donc zéro dans la courbe — par construction,
 * pas par abandon — et c'est dans la pool qu'il faut la lire. Sans cette
 * lecture, les trois seules réussites du pad se rangent au milieu des mortes.
 */
export async function readPools(coins, fetchImpl = fetch) {
  const out = new Map();
  await Promise.all(coins.map(async (c) => {
    try {
      const res = await fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${c.token}`);
      if (!res.ok) return;
      const pairs = (await res.json())?.pairs ?? [];
      // La plus profonde : une pièce cotée à plusieurs endroits donnerait
      // sinon un prix que personne ne pourrait obtenir.
      const best = pairs
        .filter((x) => Number(x?.liquidity?.usd) >= 0 && Number(x?.priceUsd) > 0)
        .sort((a, b) => (Number(b?.liquidity?.usd) || 0) - (Number(a?.liquidity?.usd) || 0))[0];
      if (!best) return;
      out.set(c.token, {
        poolUsd: Number(best.liquidity?.usd) || 0,
        priceUsd: Number(best.priceUsd) || null,
        capUsd: Number(best.marketCap ?? best.fdv) || null,
        vol24hUsd: Number(best.volume?.h24) || 0,
        trades24h: (Number(best.txns?.h24?.buys) || 0) + (Number(best.txns?.h24?.sells) || 0),
        // L'adresse de la paire, pour le lien DexTools : c'est le graphique que
        // les visiteurs vont chercher, et il ne se déduit pas de l'adresse du
        // jeton. Format relevé dans les bundles de printer.fun.
        pairAddress: best.pairAddress ?? null,
      });
    } catch {
      // Sans pool lisible, la pièce garde sa ligne et ses montants se taisent.
    }
  }));
  return out;
}

/** Les totaux du pad. Une pièce qu'on n'a pas su valoriser ne compte pas pour
 *  zéro dans les dollars : elle est comptée à part, et le total le dit. */
export function padStats(coins) {
  const priced = coins.filter((c) => c.lockedUsd !== null);
  const byBase = new Map();
  for (const c of coins) {
    const b = byBase.get(c.baseSymbol) ?? { symbol: c.baseSymbol, coins: 0, lockedUsd: 0, graduated: 0 };
    b.coins++;
    b.lockedUsd += c.lockedUsd ?? 0;
    b.graduated += c.graduated ? 1 : 0;
    byBase.set(c.baseSymbol, b);
  }
  const grads = coins.filter((c) => c.graduated);
  return {
    launched: coins.length,
    graduated: grads.length,
    // Une graduée a vidé sa courbe dans une pool : son `realBase` est nul par
    // construction. La compter parmi celles que personne n'a achetées rangeait
    // les trois seules réussites du pad au milieu des cent quarante-neuf mortes.
    untouched: coins.filter((c) => !c.graduated && !Number(c.realBase)).length,
    poolUsd: grads.some((c) => c.pool) ? grads.reduce((a, c) => a + (c.pool?.poolUsd ?? 0), 0) : null,
    vol24hUsd: grads.some((c) => c.pool) ? grads.reduce((a, c) => a + (c.pool?.vol24hUsd ?? 0), 0) : null,
    trades24h: grads.reduce((a, c) => a + (c.pool?.trades24h ?? 0), 0),
    creators: new Set(coins.map((c) => c.creator.toLowerCase())).size,
    lockedUsd: priced.length ? priced.reduce((a, c) => a + c.lockedUsd, 0) : null,
    nominalUsd: priced.length ? priced.reduce((a, c) => a + c.nominalUsd, 0) : null,
    unpriced: coins.length - priced.length,
    bases: [...byBase.values()].sort((a, b) => b.lockedUsd - a.lockedUsd),
  };
}

/**
 * Les deux factories, lues d'un bout à l'autre. `allCoins(i)` rend l'ordre de
 * création : l'indice est la date de lancement, et c'est la seule qu'on ait
 * sans journal — les logs de la chaîne sortent de la fenêtre du RPC.
 */
export async function readPad({ provider, aggregate3, factories, batchSize = 300 }) {
  const call = async (calls) => {
    const out = [];
    for (let i = 0; i < calls.length; i += batchSize) {
      out.push(...await aggregate3(calls.slice(i, i + batchSize)));
    }
    return out;
  };
  const one = (target, callData) => ({ target, allowFailure: true, callData });
  const coins = [];

  for (const factory of factories) {
    const count = Number(FACTORY_ABI.decodeFunctionResult("coinsCount",
      await provider.call({ to: factory, data: FACTORY_ABI.encodeFunctionData("coinsCount") }))[0]);

    const addrs = (await call(Array.from({ length: count }, (_, i) =>
      one(factory, FACTORY_ABI.encodeFunctionData("allCoins", [i])))))
      .map((r) => { try { return r[0] ? FACTORY_ABI.decodeFunctionResult("allCoins", r[1])[0] : null; } catch { return null; } });

    const live = addrs.map((a, i) => [a, i]).filter(([a]) => a);
    const [states, syms, names, sups] = await Promise.all([
      call(live.map(([a]) => one(factory, FACTORY_ABI.encodeFunctionData("coins", [a])))),
      call(live.map(([a]) => one(a, TOKEN_ABI.encodeFunctionData("symbol")))),
      call(live.map(([a]) => one(a, TOKEN_ABI.encodeFunctionData("name")))),
      call(live.map(([a]) => one(a, TOKEN_ABI.encodeFunctionData("totalSupply")))),
    ]);

    const dec = (iface, fn, r, fallback) => {
      try { return r?.[0] ? iface.decodeFunctionResult(fn, r[1])[0] : fallback; } catch { return fallback; }
    };
    live.forEach(([token, index], i) => {
      if (!states[i]?.[0]) return;
      let s;
      try { s = FACTORY_ABI.decodeFunctionResult("coins", states[i][1]); } catch { return; }
      coins.push({
        factory, token, index,
        symbol: dec(TOKEN_ABI, "symbol", syms[i], "?"),
        name: dec(TOKEN_ABI, "name", names[i], ""),
        supply: dec(TOKEN_ABI, "totalSupply", sups[i], 0n),
        base: s[0], creator: s[1],
        baseReserve: s[2], tokenReserve: s[3], realBase: s[4], graduated: s[5],
        gradBase: s[6][3], feeBps: Number(s[6][5]),
      });
    });
  }

  // Le symbole de chaque action de base : les pièces en nomment une dizaine, et
  // les redemander une fois par pièce coûterait deux cent soixante-dix appels
  // pour onze réponses.
  const baseAddrs = [...new Set(coins.map((c) => c.base))];
  const bs = await call(baseAddrs.map((a) => one(a, TOKEN_ABI.encodeFunctionData("symbol"))));
  const baseSymbol = new Map(baseAddrs.map((a, i) => {
    try { return [a, bs[i]?.[0] ? TOKEN_ABI.decodeFunctionResult("symbol", bs[i][1])[0] : "?"]; }
    catch { return [a, "?"]; }
  }));

  return coins.map((c) => ({ ...c, baseSymbol: baseSymbol.get(c.base) ?? "?" }));
}

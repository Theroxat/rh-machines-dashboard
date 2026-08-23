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
    // Le montant en unités de l'action, à côté de sa conversion : un écart se
    // mesure là-dessus, sinon un cours qui monte se lit comme de l'argent entré.
    realBaseUnits: n18(coin.realBase),
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

/**
 * Les homonymes.
 *
 * Rien n'empêche deux pièces de porter le même nom, et le pad en est plein :
 * cent vingt-six jetons sur trois cents partagent leur symbole avec un autre.
 * Un lancement est copié dans les créneaux qui le suivent — dix-sept ZEUB, aux
 * indices 129 à 145, seize wallets différents.
 *
 * Le tableau montrait dix-sept lignes identiques, chacune avec un lien d'achat.
 * Qui clique sur la mauvaise paie un imposteur.
 *
 * `allCoins(i)` rend l'ordre de création : au sein d'une même factory, l'indice
 * le plus bas est l'original, et c'est démontrable. Un groupe à cheval sur les
 * deux factories n'a pas d'ordre — elles tournent en parallèle — et aucun rang
 * n'est alors avancé, plutôt qu'un rang inventé.
 */
export function markNamesakes(coins) {
  const groups = new Map();
  for (const c of coins) groups.set(c.symbol, [...(groups.get(c.symbol) ?? []), c]);

  for (const group of groups.values()) {
    const orderable = new Set(group.map((c) => c.factory)).size === 1;
    const ranked = orderable ? [...group].sort((a, b) => a.index - b.index) : null;
    for (const c of group) {
      c.sharing = group.length;
      c.rank = ranked ? ranked.indexOf(c) + 1 : null;
    }
  }
  return coins;
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
    // Combien de jetons ne sont pas seuls à porter leur nom.
    namesakes: coins.filter((c) => (c.sharing ?? 1) > 1).length,
    bases: [...byBase.values()].sort((a, b) => b.lockedUsd - a.lockedUsd),
  };
}

/**
 * Ce qui a bougé.
 *
 * La page disait ce qui existe et non ce qui se passe : tout y aurait été
 * identique si le pad avait été gelé huit jours, et il ne l'est pas — cinq
 * pièces sont apparues en une heure pendant qu'on la regardait.
 *
 * L'écart se mesure en unités de l'action de base, jamais en dollars. Une
 * courbe adossée à NVDA « gagne » quinze pour cent le jour où NVDA les gagne,
 * sans que personne n'y ait mis un centime ; convertir à la fin, au cours du
 * moment, isole l'argent qui est réellement entré.
 *
 * `oldest` est le premier enregistrement, pas la naissance du pad. Tant qu'il
 * est plus récent que la fenêtre demandée, la fenêtre réelle est plus courte et
 * la page l'annonce — sans quoi « 7 lancées aujourd'hui » voudrait dire
 * « 7 depuis qu'on regarde », ce qui n'est pas la même affirmation.
 */
export function padMovement({ coins, baseline, now, windowMs }) {
  if (!baseline?.at?.size) return null;
  const cutoff = now - windowMs;
  const since = baseline.oldest === null ? cutoff : Math.max(cutoff, baseline.oldest);
  const partial = since > cutoff;

  let inUsd = 0, outUsd = 0, touched = 0, launched = 0, launchedTraded = 0, graduatedIn = 0;
  const moved = [];
  const graduated = [];

  for (const c of coins) {
    const born = baseline.firstSeen?.get(c.token);
    // Née après la coupure — et après le tout premier relevé.
    //
    // Sans cette seconde condition, les deux cent quatre-vingts pièces déjà
    // lancées comptent comme des lancements le jour où l'on commence à
    // enregistrer : « +281 launched » alors qu'aucune n'est née. Rencontrer une
    // pièce n'est pas la voir naître, et la page ne peut pas confondre les deux.
    const isNew = born !== undefined && born > cutoff && born > (baseline.oldest ?? -Infinity);
    if (isNew) {
      launched++;
      if (Number(c.realBaseUnits)) launchedTraded++;
    }
    const was = baseline.at.get(c.token) ?? (isNew ? 0 : null);
    if (was === null) continue;

    // Graduer vide la courbe. Ce n'est ni une vente ni une fuite : l'argent
    // passe dans une vraie pool. Compté comme un flux sortant, TONER prenait la
    // tête du classement des courbes qui refroidissent le jour même où elle
    // réussissait — à −$6 760, soit le plus gros « départ » de la fenêtre.
    const wasGraduated = baseline.gradAt?.has(c.token) ?? false;
    if (c.graduated && !wasGraduated) {
      graduatedIn++;
      graduated.push({ token: c.token, symbol: c.symbol, baseSymbol: c.baseSymbol });
      continue;
    }

    const delta = Number(c.realBaseUnits) - was;
    if (!delta) continue;
    touched++;
    const usd = c.basePrice == null ? null : delta * c.basePrice;
    if (usd !== null) (usd > 0 ? (inUsd += usd) : (outUsd -= usd));
    moved.push({
      token: c.token, symbol: c.symbol, baseSymbol: c.baseSymbol,
      deltaUsd: usd, wasProgress: progressOf(c, was), progress: c.progress,
    });
  }

  const by = (dir) => moved
    .filter((m) => (dir > 0 ? m.deltaUsd > 0 : m.deltaUsd < 0))
    .sort((a, b) => dir * (b.deltaUsd - a.deltaUsd))
    .slice(0, 6);

  return {
    since, windowMs, partial,
    launched, launchedTraded, graduatedIn, graduated,
    inUsd, outUsd, touched,
    climbing: by(1), cooling: by(-1),
  };
}

/** La progression qu'affichait une courbe à un montant donné. */
const progressOf = (coin, units) => {
  const grad = Number(ethers.formatUnits(coin.gradBase ?? 0n, 18));
  return coin.graduated ? 1 : grad ? Math.min(1, units / grad) : 0;
};

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

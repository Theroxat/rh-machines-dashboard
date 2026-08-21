import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";

/**
 * Ce qu'une machine contient.
 *
 * Chaque NFT possède son propre compte — une vraie adresse, avec du code
 * déployé — et c'est là que les actions achetées par le protocole atterrissent.
 * Le compte appartient au jeton, pas au porteur : **vendre la machine vend ce
 * qu'elle contient**. Une x1 à $100 avec $12 d'actions dedans et la même vidée
 * ne sont pas la même affaire, et rien ne le disait, ni ici ni sur OpenSea.
 *
 * Le porteur peut retirer, et certains l'ont fait dès le premier drop : le
 * compte de #4 est vide pendant que son propriétaire détient 4,63 NVDA. Un
 * solde nul est donc une information, pas une lecture manquée.
 */
const ERC20 = new ethers.Interface([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);
const VOTE = new ethers.Interface(["function choicesFor(uint256) view returns (address[])"]);

/**
 * Les actions qu'un scrutin a pu faire acheter, tous tours confondus.
 *
 * Un compte peut détenir une action votée il y a trois epochs : ne regarder que
 * le bulletin en cours ferait disparaître ce qu'une machine a accumulé.
 */
export async function readStockTokens({ provider, epoch }) {
  const seen = new Map();
  for (let e = 1; e <= Number(epoch ?? 0); e++) {
    let choices;
    try {
      const raw = await provider.call({ to: ADDRESSES.VOTE, data: VOTE.encodeFunctionData("choicesFor", [e]) });
      if (raw === "0x") continue;
      choices = VOTE.decodeFunctionResult("choicesFor", raw)[0];
    } catch {
      continue;
    }
    for (const a of choices) {
      if (a === ethers.ZeroAddress || seen.has(a)) continue;
      try {
        const [s, d] = await Promise.all([
          provider.call({ to: a, data: ERC20.encodeFunctionData("symbol", []) }),
          provider.call({ to: a, data: ERC20.encodeFunctionData("decimals", []) }),
        ]);
        seen.set(a, {
          address: a,
          symbol: ERC20.decodeFunctionResult("symbol", s)[0],
          decimals: Number(ERC20.decodeFunctionResult("decimals", d)[0]),
        });
      } catch {
        // Un jeton qui ne se nomme pas ne se comptera pas : mieux vaut
        // l'ignorer qu'afficher une ligne sans symbole ni décimales.
      }
    }
  }
  return [...seen.values()];
}

/**
 * Les avoirs de chaque compte, en un seul appel groupé par lot.
 *
 * Une lecture en échec ne produit aucune entrée : un zéro se lirait comme un
 * compte vidé, ce qui est justement l'information qu'on cherche à établir.
 */
export async function readHoldings({ aggregate3, accounts, tokens, batchSize = 400 }) {
  const out = new Map();
  if (!accounts?.length || !tokens?.length) return out;

  const calls = [];
  for (const [tokenId, account] of accounts) {
    for (const t of tokens) {
      calls.push({ tokenId, account, t, call: { target: t.address, allowFailure: true, callData: ERC20.encodeFunctionData("balanceOf", [account]) } });
    }
  }

  let failures = 0;
  for (let start = 0; start < calls.length; start += batchSize) {
    const chunk = calls.slice(start, start + batchSize);
    const res = await aggregate3(chunk.map((c) => c.call));
    chunk.forEach((c, i) => {
      const r = res[i];
      if (!r?.[0]) { failures++; return; }
      let raw;
      try { raw = ERC20.decodeFunctionResult("balanceOf", r[1])[0]; } catch { failures++; return; }
      if (raw === 0n) return;
      const amount = Number(ethers.formatUnits(raw, c.t.decimals));
      if (!out.has(c.tokenId)) out.set(c.tokenId, []);
      out.get(c.tokenId).push({ symbol: c.t.symbol, address: c.t.address, amount });
    });
  }

  for (const list of out.values()) list.sort((a, b) => b.amount - a.amount);
  return { holdings: out, failures };
}

/** Ce que les avoirs valent, quand on sait les prix. Une action sans prix garde
 *  sa quantité et n'entre dans aucun total : un zéro fausserait la somme. */
export function valueHoldings(list, priceOf) {
  if (!list?.length) return { lines: [], usd: null, priced: 0 };
  let usd = 0, priced = 0;
  const lines = list.map((h) => {
    const p = priceOf?.(h.symbol) ?? null;
    const v = p === null ? null : h.amount * p;
    if (v !== null) { usd += v; priced++; }
    return { ...h, usd: v };
  });
  return { lines, usd: priced ? usd : null, priced };
}

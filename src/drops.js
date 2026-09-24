/**
 * Les parts de drop enregistrées et jamais versées.
 *
 * Le contrat de drop du 2026-09-03 tient deux comptes par machine : sa part du
 * tour (`shareOf`) et si elle a été versée (`paidThisRound`). Une part non
 * nulle et non versée est un dû — et le porteur ne peut pas le réclamer :
 * seul le keeper pousse les versements. Le jour où on l'a vu, 193 machines
 * attendaient 16,3 NVDA, et le contrat n'en détenait plus.
 */
import { ethers } from "ethers";

export const DROP_ABI = new ethers.Interface([
  "function roundId() view returns (uint256)",
  "function shareOf(uint256) view returns (uint256)",
  "function paidThisRound(uint256) view returns (bool)",
]);
const ERC20 = new ethers.Interface(["function balanceOf(address) view returns (uint256)"]);

/**
 * Un seul multicall : le tour, puis part et versement de chaque machine, puis
 * ce que le contrat détient encore du jeton de ce tour. Une lecture en échec
 * n'invente pas de dû : la machine est simplement absente de la carte.
 */
export async function readUnpaid({ aggregate3, contract, ids, token = null }) {
  const calls = [{ target: contract, allowFailure: true, callData: DROP_ABI.encodeFunctionData("roundId") }];
  for (const id of ids) {
    calls.push({ target: contract, allowFailure: true, callData: DROP_ABI.encodeFunctionData("shareOf", [id]) });
    calls.push({ target: contract, allowFailure: true, callData: DROP_ABI.encodeFunctionData("paidThisRound", [id]) });
  }
  if (token) calls.push({ target: token, allowFailure: true, callData: ERC20.encodeFunctionData("balanceOf", [contract]) });
  const res = await aggregate3(calls);
  const dec = (iface, fn, r) => { if (!r?.[0]) return null; try { return iface.decodeFunctionResult(fn, r[1])[0]; } catch { return null; } };

  const round = dec(DROP_ABI, "roundId", res[0]);
  const owed = new Map();
  ids.forEach((id, i) => {
    const share = dec(DROP_ABI, "shareOf", res[1 + 2 * i]);
    const paid = dec(DROP_ABI, "paidThisRound", res[2 + 2 * i]);
    if (share === null || paid === null) return;
    if (share > 0n && !paid) owed.set(id, share);
  });
  const left = token ? dec(ERC20, "balanceOf", res[res.length - 1]) : null;
  return { round: round === null ? null : Number(round), owed, left };
}

/**
 * Les lignes que la page affiche. Le jeton d'un tour n'est exposé par aucune
 * vue : sans lui on dit « une part », jamais un symbole deviné. `funded` dit si
 * le contrat détient encore de quoi payer ce qui est dû.
 */
export function unpaidLines({ owed, round, left, rounds, priceOf }) {
  const info = rounds?.[round] ?? null;
  const lines = [...(owed ?? [])].sort((a, b) => a[0] - b[0]).map(([tokenId, raw]) => {
    const amount = info ? Number(ethers.formatUnits(raw, info.decimals)) : null;
    const price = info ? priceOf?.(info.symbol) ?? null : null;
    return { tokenId, amount, symbol: info?.symbol ?? null, usd: amount !== null && price !== null ? amount * price : null };
  });
  const total = [...(owed ?? []).values()].reduce((a, b) => a + b, 0n);
  return {
    round, date: info?.date ?? null, lines,
    funded: left === null || left === undefined ? null : left >= total,
  };
}

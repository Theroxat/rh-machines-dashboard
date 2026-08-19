import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";
import { SECTORS } from "./desks.js";

/**
 * Le bulletin d'une epoch : quel ticker occupe quel desk.
 *
 * Le desk est scellé au mint — une machine reste sur `real estate` pour
 * toujours — mais **le ticker posé dessus change à chaque epoch**, et peut même
 * changer en cours de scrutin : un desk dont l'action n'a pas de pool sur cette
 * chaîne reste un trou jusqu'à ce que l'équipe le réattribue. Un porteur
 * cherche « SPCX », pas « real estate ».
 *
 * Ceci se lisait d'abord dans l'évènement `BallotOpened`, et c'était une
 * erreur. Un journal n'est interrogeable que sur une fenêtre de blocs, la
 * chaîne en produit des centaines de milliers par jour, et l'ouverture d'une
 * epoch sort de portée bien avant sa clôture — sans bruit, en rendant zéro
 * résultat plutôt qu'une erreur. Le contrat publie l'état, lui, et le publie
 * toujours : `choicesFor` répond aussi bien le premier jour que le dernier, et
 * suit les réattributions au lieu de figer l'ouverture.
 */
const VOTE = new ethers.Interface([
  "function choicesFor(uint256) view returns (address[])",
]);
const ERC20 = new ethers.Interface(["function symbol() view returns (string)"]);

/** Les symboles ne changent pas pour une adresse donnée : lus une fois, gardés. */
const symbolCache = new Map();

async function symbolOf(provider, address) {
  if (symbolCache.has(address)) return symbolCache.get(address);
  let sym = null;
  try {
    const raw = await provider.call({ to: address, data: ERC20.encodeFunctionData("symbol", []) });
    if (raw !== "0x") sym = ERC20.decodeFunctionResult("symbol", raw)[0];
  } catch {
    sym = null;
  }
  symbolCache.set(address, sym);
  return sym;
}

/**
 * Les seize tickers, dans l'ordre des desks. Un desk sans jeton rend null : ce
 * tour-ci il n'est pas sur le bulletin, on ne peut pas voter pour lui, et le
 * dire vaut mieux que d'afficher un tiret qu'on prendrait pour une donnée
 * manquante.
 */
export async function readBallotTickers({ provider, epoch }) {
  if (epoch === null || epoch === undefined) return null;
  try {
    const raw = await provider.call({
      to: ADDRESSES.VOTE,
      data: VOTE.encodeFunctionData("choicesFor", [BigInt(epoch)]),
    });
    if (raw === "0x") return null;
    const choices = VOTE.decodeFunctionResult("choicesFor", raw)[0];
    if (!choices?.length) return null;

    const out = new Array(SECTORS.length).fill(null);
    await Promise.all([...choices].slice(0, SECTORS.length).map(async (addr, i) => {
      if (addr === ethers.ZeroAddress) return;
      out[i] = await symbolOf(provider, addr);
    }));
    return out;
  } catch {
    return null;
  }
}

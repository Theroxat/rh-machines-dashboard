import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";
import { SECTORS } from "./desks.js";

/**
 * Le bulletin d'une epoch : quel ticker occupe quel desk.
 *
 * Le desk est scellé au mint — une machine reste sur `real estate` pour
 * toujours — mais **le ticker posé dessus change à chaque epoch**. Un porteur
 * cherche « SPCX », pas « real estate » : sans cette table, la page nomme un
 * secteur pendant que le terminal officiel propose une action, et personne ne
 * fait le lien.
 *
 * Aucune vue ne publie la liste. Elle est dans l'évènement `BallotOpened`,
 * émis à l'ouverture, et les symboles se lisent sur chaque jeton.
 */
const BALLOT_EVENT = new ethers.Interface([
  "event BallotOpened(uint256 indexed epoch, address[] tickers, uint256 closesAt)",
]);
const ERC20 = new ethers.Interface(["function symbol() view returns (string)"]);

/** De combien de blocs on remonte pour retrouver l'ouverture. Une epoch dure
 *  3,5 jours ; large, mais borné — un `getLogs` sans borne se fait refuser. */
const LOOKBACK_BLOCKS = 400000;

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
    const head = await provider.getBlockNumber();
    const logs = await provider.getLogs({
      address: ADDRESSES.VOTE,
      topics: [
        BALLOT_EVENT.getEvent("BallotOpened").topicHash,
        ethers.zeroPadValue(ethers.toBeHex(BigInt(epoch)), 32),
      ],
      fromBlock: Math.max(0, head - LOOKBACK_BLOCKS),
      toBlock: head,
    });
    if (!logs.length) return null;

    const { tickers } = BALLOT_EVENT.decodeEventLog("BallotOpened", logs[0].data, logs[0].topics);
    const out = new Array(SECTORS.length).fill(null);
    await Promise.all([...tickers].slice(0, SECTORS.length).map(async (addr, i) => {
      if (addr === ethers.ZeroAddress) return;
      out[i] = await symbolOf(provider, addr);
    }));
    return out;
  } catch {
    return null;
  }
}

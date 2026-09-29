/**
 * Les Blue Machines.
 *
 * Le contrat Blue ne fabrique rien : il détient des machines que l'équipe lui
 * confie et en remet une à chaque mint. Une machine qu'il a remise à un
 * portefeuille est Blue, et c'est la chaîne qui le dit — un `Transfer` du
 * contrat NFT dont l'expéditeur est le contrat Blue.
 *
 * Mais tout ce qui sort du contrat n'est pas Blue : il reçoit aussi des
 * brûlées en paiement et les envoie à l'adresse morte. Le 2026-09-29, sur 474
 * sorties, 372 allaient à `0x…dEaD` — la page annonçait alors 474 Blue quand
 * il en existait 102, le compte d'OpenSea.
 */
import { ethers } from "ethers";

const TRANSFER = ethers.id("Transfer(address,address,uint256)");
const DEAD_TOPIC = ethers.zeroPadValue("0x000000000000000000000000000000000000dEaD", 32).toLowerCase();

/**
 * Les machines que le contrat Blue a remises entre deux blocs, par tranches.
 * Une tranche refusée fait échouer toute la lecture : l'appelant garde son
 * curseur et relira la même fenêtre, plutôt que de sauter par-dessus un trou.
 */
export async function readBlueMints({ provider, machines, contract, fromBlock, toBlock, span = 100_000 }) {
  const out = [];
  const from = ethers.zeroPadValue(contract, 32);
  for (let lo = fromBlock; lo <= toBlock; lo += span) {
    const hi = Math.min(lo + span - 1, toBlock);
    const logs = await provider.getLogs({ address: machines, topics: [TRANSFER, from], fromBlock: lo, toBlock: hi });
    for (const l of logs) {
      // Une brûlée détruite en paiement n'est pas une Blue remise.
      if (l.topics[2].toLowerCase() === DEAD_TOPIC) continue;
      out.push({ tokenId: Number(BigInt(l.topics[3])), to: ethers.getAddress("0x" + l.topics[2].slice(26)), block: l.blockNumber });
    }
  }
  return out;
}

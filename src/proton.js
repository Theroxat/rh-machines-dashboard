/**
 * Le Proton et son coffre.
 *
 * On y sacrifie une machine pour en alourdir une autre : 80% de réussite
 * annoncés, et la machine sacrifiée part au coffre — la « Factory » — avant
 * même que le dé ne roule. Elle n'est pas détruite. `totalSupply` du NFT ne
 * bouge pas ; le coffre a un propriétaire, et une fonction `releaseMachine`
 * qui peut l'en ressortir vers n'importe quelle adresse.
 *
 * Rien de tout cela n'est publié. Les deux contrats ne sont pas vérifiés sur
 * l'explorateur, leurs adresses viennent de `/api/protonConfig` du site
 * officiel, et chacune a été recoupée on-chain — même méthode que pour VOTE,
 * SWAPPER et les factories du pad.
 *
 * Les journaux de cette chaîne défilent en quelques heures (un bloc toutes les
 * 0,1 s) : la lecture remonte par tranches jusqu'à ce que plusieurs tranches
 * consécutives soient vides, et le compte se recoupe avec `nextCommitId()`.
 * Sans ce recoupement on ne saurait pas si l'on a tout vu.
 */
import { ethers } from "ethers";

export const PROTON_ABI = new ethers.Interface([
  "function nextCommitId() view returns (uint256)",
  "function feeWei() view returns (uint256)",
  "event FuseCommitted(uint256 indexed commitId,uint256 indexed targetId,uint256 indexed sacrificeId,address by,uint256 fee,uint256 printerBurned,uint256 readyAt)",
  "event Fused(uint256 indexed commitId,uint256 indexed targetId,address indexed by,bool sacrificeWasActive,uint256 weightAdded,uint256 feePaid)",
  "event FuseFailed(uint256 indexed commitId,uint256 indexed targetId,address indexed by,bool lateDraw)",
]);

const TRANSFER = ethers.id("Transfer(address,address,uint256)");
const DEAD = "0x000000000000000000000000000000000000dead";
const SPAN = 100_000;
const DRY = 20;

/** Remonte les journaux par tranches jusqu'à `DRY` tranches vides d'affilée. */
async function walkBack({ provider, address, topics, head }) {
  const seen = new Map();
  let from = head;
  let dry = 0;
  while (from > 0 && dry < DRY) {
    const lo = Math.max(0, from - SPAN);
    let logs;
    try {
      logs = await provider.getLogs({ address, topics, fromBlock: lo, toBlock: from });
    } catch {
      // Le nœud refuse la tranche : on s'arrête là et l'appelant le saura par
      // le recoupement, plutôt que de présenter un compte tronqué comme entier.
      break;
    }
    if (logs.length) {
      for (const l of logs) seen.set(`${l.blockNumber}:${l.index}`, l);
      dry = 0;
    } else dry++;
    from = lo - 1;
  }
  return { logs: [...seen.values()], reachedBlock: from };
}

export async function readProton({ provider, proton, factory, machines }) {
  const head = await provider.getBlockNumber();

  const [ev, into, outOf] = await Promise.all([
    walkBack({ provider, address: proton, head }),
    walkBack({ provider, address: machines, topics: [TRANSFER, null, ethers.zeroPadValue(factory, 32)], head }),
    walkBack({ provider, address: machines, topics: [TRANSFER, ethers.zeroPadValue(factory, 32), null], head }),
  ]);

  let committed = 0, won = 0, lost = 0, lateDraws = 0, printerBurned = 0, weightAdded = 0, feeWei = 0n;
  for (const l of ev.logs) {
    // `parseLog` rend null — et ne lève pas — sur un évènement qu'il ne connaît
    // pas. Le Proton en émet d'autres que ces trois-là : un changement de
    // propriétaire suffisait à emporter toute la lecture.
    let d;
    try { d = PROTON_ABI.parseLog(l); } catch { continue; }
    if (!d) continue;
    if (d.name === "FuseCommitted") {
      committed++;
      printerBurned += Number(ethers.formatUnits(d.args.printerBurned, 18));
      feeWei += d.args.fee;
    } else if (d.name === "Fused") {
      won++;
      weightAdded += Number(d.args.weightAdded);
    } else if (d.name === "FuseFailed") {
      lost++;
      if (d.args.lateDraw) lateDraws++;
    }
  }

  // Le contrat compte lui-même les engagements. Si notre lecture n'y retombe
  // pas, la fenêtre de journaux nous en a caché, et la page doit le dire plutôt
  // que d'annoncer un taux d'échec calculé sur un échantillon amputé.
  let expected = null;
  try {
    const raw = await provider.call({ to: proton, data: PROTON_ABI.encodeFunctionData("nextCommitId") });
    expected = Number(PROTON_ABI.decodeFunctionResult("nextCommitId", raw)[0]) - 1;
  } catch { /* le compteur est indisponible : on le dira */ }

  const heldIds = new Set(into.logs.map((l) => Number(BigInt(l.topics[3]))));
  for (const l of outOf.logs) heldIds.delete(Number(BigInt(l.topics[3])));

  return {
    proton, factory,
    committed, won, lost, lateDraws,
    pending: committed - won - lost,
    printerBurned,
    weightAdded,
    feeEth: Number(ethers.formatEther(feeWei)),
    heldIds: [...heldIds],
    released: outOf.logs.length,
    // Sorties vers l'adresse morte, comptées à part : le 2026-09-23 le coffre y
    // a envoyé 3 477 machines d'un coup, et la page annonçait « 3,477 have
    // come back out » — comme si elles étaient revenues à quelqu'un.
    releasedToDead: outOf.logs.filter((l) => l.topics[2] === ethers.zeroPadValue(DEAD, 32).toLowerCase()).length,
    // Vrai quand notre compte retombe sur celui du contrat : sans lui, aucune
    // statistique tirée de ces évènements n'a le droit d'être présentée.
    complete: expected === null ? null : committed >= expected,
    expected,
    readAt: Date.now(),
  };
}

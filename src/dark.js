/**
 * Le Rituel noir et ses Dark Machines.
 *
 * Annoncé le 2026-09-23 par @btcordinal : quatre machines brûlées au Meltdown
 * partent à l'adresse morte, une cinquième — le « vessel » — est jouée à une
 * machine à sous de cent tours. Gagné, le vessel devient Dark Machine ; perdu,
 * tout est brûlé. 60 % de réussite annoncés. L'équipe dit qu'une Dark Machine
 * ne porte plus de poids mais touche dix fois sur les revenus de printer.fun et
 * des jeux — une promesse hors chaîne, que rien ici ne mesure.
 *
 * Ce qui, en revanche, est sur la chaîne : chaque partie (`Charged`) et son
 * issue (`Settled`, avec `won`). C'est l'autorité pour dire qu'une machine a
 * été forgée. Les métadonnées disent « Dark Machine » aussi, mais le jour de
 * l'ouverture elles en comptaient une — la #23 — qu'aucun rituel n'a produite :
 * marquée à la main. La page montre les deux et ne les confond pas.
 */
import { ethers } from "ethers";

export const DARK_ABI = new ethers.Interface([
  "event Charged(address indexed by,uint256 indexed ritualId,uint256 indexed vessel,bytes32 seed,uint256[] burnedFuel,uint256 printerBurned,uint256 ethPaid)",
  "event Settled(address indexed by,uint256 indexed ritualId,uint256 indexed vessel,bool won,uint256 spinsUsed,uint256 points)",
]);
const CHARGED = DARK_ABI.getEvent("Charged").topicHash;
const SETTLED = DARK_ABI.getEvent("Settled").topicHash;

/**
 * Les parties entre deux blocs, par tranches. Une tranche refusée fait échouer
 * toute la lecture : l'appelant garde alors son curseur et relira la même
 * fenêtre, plutôt que d'avancer par-dessus un trou qu'il ne verrait plus.
 */
export async function readRitualLogs({ provider, contract, fromBlock, toBlock, span = 100_000 }) {
  const events = [];
  for (let lo = fromBlock; lo <= toBlock; lo += span) {
    const hi = Math.min(lo + span - 1, toBlock);
    const logs = await provider.getLogs({ address: contract, topics: [[CHARGED, SETTLED]], fromBlock: lo, toBlock: hi });
    for (const l of logs) {
      let x;
      try { x = DARK_ABI.parseLog(l); } catch { continue; }
      if (!x) continue;
      const base = {
        contract: contract.toLowerCase(), block: l.blockNumber, index: l.index,
        ritualId: Number(x.args.ritualId), vessel: Number(x.args.vessel), by: x.args.by,
      };
      events.push(x.name === "Charged"
        ? { ...base, kind: "charged", fuel: x.args.burnedFuel.map(Number), printerBurned: x.args.printerBurned, ethPaid: x.args.ethPaid }
        : { ...base, kind: "settled", won: x.args.won });
    }
  }
  return events;
}

/** Le décompte, recalculé en entier à chaque fois : quelques centaines
 *  d'événements, et une somme ne peut pas dériver. Un doublon — la même
 *  tranche relue — ne compte qu'une fois.
 *
 *  Un rituel se désigne par son contrat ET son numéro : le second contrat,
 *  déployé le 2026-09-24, recompte à partir de 1, et son rituel #20 aurait
 *  écrasé celui du premier. La page les numérote dans l'ordre où ils ont été
 *  joués, tous contrats confondus — 1 à 56 le 2026-09-26, comme l'API. */
export function tallyRituals(events) {
  const key = (e) => `${e.contract ?? ""}:${e.ritualId}`;
  const charged = new Map();   // contrat:rituel -> charged
  const settled = new Map();   // contrat:rituel -> settled
  for (const e of events) (e.kind === "charged" ? charged : settled).set(key(e), e);

  // L'ordre de jeu, tous contrats confondus : bloc, puis position dans le bloc.
  const seq = new Map([...charged.entries()]
    .sort(([, a], [, b]) => a.block - b.block || a.index - b.index)
    .map(([k], i) => [k, i + 1]));

  const forged = new Map();    // vessel -> numéro de rituel, dans l'ordre de jeu
  let won = 0, lost = 0, fuelBurned = 0;
  let printerBurned = 0n, ethPaid = 0n;
  for (const c of charged.values()) {
    fuelBurned += c.fuel.length;
    printerBurned += BigInt(c.printerBurned);
    ethPaid += BigInt(c.ethPaid);
  }
  for (const [k, s] of settled) {
    if (s.won) { won++; forged.set(s.vessel, seq.get(k) ?? s.ritualId); } else lost++;
  }
  const done = won + lost;
  return {
    rituals: charged.size,
    won, lost,
    // Payée, pas encore jouée : ni gagnée ni perdue, et on ne l'annonce pas.
    pending: [...charged.keys()].filter((k) => !settled.has(k)).length,
    winRate: done ? won / done : null,
    fuelBurned,
    printerBurned: Number(printerBurned / 10n ** 18n),
    ethPaid: Number(ethPaid) / 1e18,
    forged,
  };
}

const OWNER = new ethers.Interface(["function owner() view returns (address)"]);

/**
 * Le contrat de rituel que le site officiel annonce, s'il est nouveau.
 *
 * Le 2026-09-24 l'équipe a changé de contrat sans prévenir, et une Dark gagnée
 * sur le nouveau restait invisible ici. L'adresse annoncée n'est suivie que si
 * son `owner()` sur la chaîne est la clé attendue : l'API ne décide pas seule
 * de ce qu'on lit. Rend l'adresse, ou null — connue, illisible ou refusée.
 */
export async function discoverRitualContract({ provider, api, known, owner, fetchImpl = fetch }) {
  let addr;
  try {
    const res = await fetchImpl(api, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    addr = (await res.json())?.contract;
  } catch {
    return null;
  }
  if (typeof addr !== "string" || !ethers.isAddress(addr)) return null;
  if (known.some((a) => a.toLowerCase() === addr.toLowerCase())) return null;
  try {
    const raw = await provider.call({ to: addr, data: OWNER.encodeFunctionData("owner") });
    const who = OWNER.decodeFunctionResult("owner", raw)[0];
    return who.toLowerCase() === owner.toLowerCase() ? ethers.getAddress(addr) : null;
  } catch {
    return null;
  }
}

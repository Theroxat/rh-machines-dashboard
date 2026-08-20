import { ethers } from "ethers";
import { ADDRESSES } from "./config.js";
import { readUintMap } from "./multicall.js";
import { deskName } from "./desks.js";

/**
 * Le scrutin — contrat VOTE, `0x315A3aef…`.
 *
 * Il n'est documenté nulle part et n'était référencé par aucun des contrats que
 * la page lisait déjà : son adresse et son ABI viennent de la carte publiée par
 * les bundles du terminal officiel, relevée le 2026-08-17, puis vérifiées
 * contre la chaîne.
 *
 * Ce qu'il décide compte : le pot d'une epoch ne se partage pas en seize parts
 * égales, il se partage entre les desks au prorata des voix, et un desk sans
 * voix ne reçoit rien. Une machine touche au prorata de son poids sur chaque
 * part, et le double sur celle de son propre desk. Le rendement reste donc
 * strictement proportionnel au poids — mais multiplié par un coefficient qui
 * dépend du desk, et que seul ce scrutin fixe.
 */
export const VOTE_ABI = new ethers.Interface([
  "function tally(uint256,uint256) view returns (uint256)",
  "function desksFor(uint256) view returns (uint8[])",
  "function closesAt(uint256) view returns (uint256)",
  "function finalized(uint256) view returns (bool)",
]);

/** Les seize desks du bulletin, indexés comme la chaîne les indexe. */
export const DESK_SLOTS = 16;

const MINE_DESK_ABI = new ethers.Interface([
  "function deskOf(uint256) view returns (uint8)",
]);

/**
 * Le desk de chaque machine, lu sur MINE. Il est scellé au mint, donc lu une
 * fois au démarrage et jamais réinterrogé.
 *
 * La page le déduisait de la couleur du corps, faute de mieux. La déduction
 * était juste — recoupée machine par machine, elle reproduit exactement le
 * recensement on-chain des seize desks — mais une déduction reste une
 * déduction : c'est désormais la chaîne qui range, et la couleur qui nomme.
 */
export async function readDeskIndex({ aggregate3, ids, batchSize = 400 }) {
  const { values } = await readUintMap({
    aggregate3, iface: MINE_DESK_ABI, target: ADDRESSES.MINE, fn: "deskOf", ids, batchSize,
  });
  const index = new Map();
  for (const [id, v] of values) index.set(id, Number(v));
  return index;
}

/**
 * Le dépouillement d'une epoch. Chaque appel a le droit d'échouer seul : un
 * `desksFor` qui révoque avant l'ouverture du bulletin ne doit pas emporter les
 * seize comptes avec lui.
 *
 * `open` distingue trois états qu'un tableau de zéros confondrait : le bulletin
 * pas encore ouvert, le bulletin ouvert et vide, le bulletin clos. Afficher des
 * parts nulles dans le premier cas ferait croire que personne n'a voté, alors
 * que personne n'a encore pu.
 */
export async function readVote({ provider, epoch }) {
  if (epoch === null || epoch === undefined) return null;
  const ep = BigInt(epoch);

  const one = async (fn, args) => {
    try {
      const raw = await provider.call({ to: ADDRESSES.VOTE, data: VOTE_ABI.encodeFunctionData(fn, args) });
      return raw === "0x" ? null : VOTE_ABI.decodeFunctionResult(fn, raw)[0];
    } catch {
      return null;
    }
  };

  const [closesAtRaw, finalizedRaw] = await Promise.all([one("closesAt", [ep]), one("finalized", [ep])]);
  const closesAt = closesAtRaw === null ? null : Number(closesAtRaw) * 1000;

  const counts = await Promise.all(
    Array.from({ length: DESK_SLOTS }, (_, d) => one("tally", [ep, d])),
  );

  const tally = new Map();
  let total = 0n;
  counts.forEach((v, d) => {
    if (v === null) return;
    tally.set(d, v);
    total += v;
  });

  return {
    epoch: Number(ep),
    // `closesAt` vaut zéro tant qu'aucun bulletin n'a été ouvert pour l'epoch.
    closesAt: closesAt || null,
    finalized: finalizedRaw === null ? null : Boolean(finalizedRaw),
    opened: Boolean(closesAt),
    tally,
    totalVotes: total,
  };
}

/**
 * Ce que chaque desk a tiré du pot.
 *
 * L'index vient de la chaîne, le nom de la table des secteurs. Il n'y a plus
 * rien à recouper : la page nommait ces desks d'après des tickers déduits, et
 * la déduction était fausse.
 */
export function deskShares({ vote, tickers = [] }) {
  if (!vote) return null;

  const total = vote.totalVotes;
  const desks = [];
  for (let index = 0; index < DESK_SLOTS; index++) {
    const weight = vote.tally.get(index);
    if (weight === undefined) continue;
    desks.push({
      index,
      // Même règle que partout : le ticker nomme, le secteur situe.
      desk: tickers[index] ?? deskName(index),
      sector: deskName(index),
      // Sur le bulletin de cette epoch, ou non : un desk dont l'action n'a pas
      // de pool n'est pas votable ce tour-ci, même s'il porte un nom.
      ticker: tickers[index] ?? null,
      // Le poids voté, en points : une machine vote avec son poids, pas pour
      // une voix.
      votedWeight: Number(weight / 100n),
      // Sans une seule voix il n'y a pas de part à annoncer — pas une part nulle.
      share: total > 0n ? Number((weight * 1000000n) / total) / 1000000 : null,
    });
  }

  desks.sort((a, b) => b.votedWeight - a.votedWeight || a.index - b.index);
  return { desks, opened: vote.opened, finalized: vote.finalized, closesAt: vote.closesAt };
}

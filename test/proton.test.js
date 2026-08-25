import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { readProton, PROTON_ABI } from "../src/proton.js";

const PROTON = "0x" + "a".repeat(40);
const FACTORY = "0x" + "b".repeat(40);
const MACHINES = "0x" + "c".repeat(40);
const TRANSFER = ethers.id("Transfer(address,address,uint256)");
const e18 = (x) => ethers.parseUnits(String(x), 18);

const fuseLog = (name, args, block, index) => ({
  ...PROTON_ABI.encodeEventLog(PROTON_ABI.getEvent(name), args),
  blockNumber: block, index, address: PROTON,
});
const xfer = (from, to, id, block, index) => ({
  topics: [TRANSFER, ethers.zeroPadValue(from, 32), ethers.zeroPadValue(to, 32), ethers.toBeHex(id, 32)],
  data: "0x", blockNumber: block, index, address: MACHINES,
});

/** Une chaîne simulée : les journaux vivent dans une seule tranche. */
function chain({ events = [], transfers = [], nextCommitId = null, refuseLogs = false } = {}) {
  return {
    getBlockNumber: async () => 1_000_000,
    getLogs: async ({ address, topics, fromBlock }) => {
      if (refuseLogs) throw new Error("query returned more than 10000 results");
      if (fromBlock < 900_000) return [];             // au-delà d'une tranche : vide
      if (address === PROTON) return events;
      const from = topics?.[1], to = topics?.[2];
      return transfers.filter((t) => (!from || t.topics[1] === from) && (!to || t.topics[2] === to));
    },
    call: async () => {
      if (nextCommitId === null) throw new Error("no such function");
      return PROTON_ABI.encodeFunctionResult("nextCommitId", [nextCommitId]);
    },
  };
}
const read = (c) => readProton({ provider: c, proton: PROTON, factory: FACTORY, machines: MACHINES });

test("wins, losses and what they burned are counted from the events", async () => {
  const r = await read(chain({
    nextCommitId: 4,
    events: [
      fuseLog("FuseCommitted", [1n, 10n, 11n, PROTON, e18(0.002), e18(5000), 0n], 950_000, 0),
      fuseLog("FuseCommitted", [2n, 20n, 21n, PROTON, e18(0.002), e18(5000), 0n], 950_001, 0),
      fuseLog("FuseCommitted", [3n, 30n, 31n, PROTON, e18(0.002), e18(25000), 0n], 950_002, 0),
      fuseLog("Fused", [1n, 10n, PROTON, false, 300n, e18(0.002)], 950_010, 0),
      fuseLog("Fused", [2n, 20n, PROTON, true, 150n, e18(0.002)], 950_011, 0),
      fuseLog("FuseFailed", [3n, 30n, PROTON, false], 950_012, 0),
    ],
  }));
  assert.equal(r.committed, 3);
  assert.equal(r.won, 2);
  assert.equal(r.lost, 1);
  assert.equal(r.pending, 0);
  assert.equal(r.printerBurned, 35000);
  assert.equal(r.weightAdded, 450);
  assert.equal(r.feeEth.toFixed(3), "0.006");
});

// Un engagement dont le dé n'a pas encore roulé n'est ni gagné ni perdu.
test("a commit awaiting its roll is pending, not counted as a loss", async () => {
  const r = await read(chain({
    nextCommitId: 2,
    events: [
      fuseLog("FuseCommitted", [1n, 10n, 11n, PROTON, 0n, e18(5000), 0n], 950_000, 0),
      fuseLog("FuseCommitted", [2n, 20n, 21n, PROTON, 0n, e18(5000), 0n], 950_001, 0),
      fuseLog("Fused", [1n, 10n, PROTON, false, 300n, 0n], 950_010, 0),
    ],
  }));
  assert.equal(r.pending, 1);
  assert.equal(r.lost, 0);
});

// Un échec pour révélation tardive n'est pas un dé perdu : c'est le joueur qui
// n'est pas revenu à temps, et le confondre fausserait le taux annoncé.
test("a late draw is counted apart from a lost roll", async () => {
  const r = await read(chain({
    nextCommitId: 3,
    events: [
      fuseLog("FuseFailed", [1n, 10n, PROTON, true], 950_000, 0),
      fuseLog("FuseFailed", [2n, 20n, PROTON, false], 950_001, 0),
    ],
  }));
  assert.equal(r.lost, 2);
  assert.equal(r.lateDraws, 1);
});

// Le Proton émet aussi des évènements que nous ne déclarons pas — un changement
// de propriétaire, par exemple. `parseLog` rend null dessus au lieu de lever, et
// un seul suffisait à emporter toute la lecture.
test("an event we do not know is skipped, not fatal", async () => {
  const OTHER = new ethers.Interface(["event OwnershipTransferred(address indexed a,address indexed b)"]);
  const stray = {
    ...OTHER.encodeEventLog(OTHER.getEvent("OwnershipTransferred"), [PROTON, FACTORY]),
    blockNumber: 950_005, index: 0, address: PROTON,
  };
  const r = await read(chain({
    nextCommitId: 2,
    events: [
      fuseLog("FuseCommitted", [1n, 10n, 11n, PROTON, 0n, e18(5000), 0n], 950_000, 0),
      stray,
      fuseLog("Fused", [1n, 10n, PROTON, false, 300n, 0n], 950_010, 0),
    ],
  }));
  assert.equal(r.committed, 1);
  assert.equal(r.won, 1);
});

// --- le coffre --------------------------------------------------------------

test("what the vault holds is what went in minus what came out", async () => {
  const r = await read(chain({
    nextCommitId: 1,
    transfers: [
      xfer(PROTON, FACTORY, 100, 950_000, 0),
      xfer(PROTON, FACTORY, 101, 950_001, 0),
      xfer(PROTON, FACTORY, 102, 950_002, 0),
      xfer(FACTORY, PROTON, 101, 950_010, 0),     // ressortie
    ],
  }));
  assert.deepEqual(r.heldIds.sort((a, b) => a - b), [100, 102]);
  assert.equal(r.released, 1);
});

// Le coffre a un propriétaire et une fonction pour vider : une sortie doit se
// voir, jamais se fondre dans le compte.
test("a machine released from the vault is reported, not silently dropped", async () => {
  const r = await read(chain({
    nextCommitId: 1,
    transfers: [xfer(PROTON, FACTORY, 100, 950_000, 0), xfer(FACTORY, "0x" + "d".repeat(40), 100, 950_010, 0)],
  }));
  assert.equal(r.heldIds.length, 0);
  assert.equal(r.released, 1);
});

// --- l'aveu d'incomplétude --------------------------------------------------

// Les journaux de cette chaîne défilent en quelques heures. Si notre lecture ne
// retombe pas sur le compteur du contrat, tout taux calculé dessus est faux.
test("a reading that misses commits admits it rather than passing for whole", async () => {
  const r = await read(chain({
    nextCommitId: 100,                       // le contrat en annonce 99
    events: [fuseLog("FuseCommitted", [1n, 10n, 11n, PROTON, 0n, e18(5000), 0n], 950_000, 0)],
  }));
  assert.equal(r.expected, 99);
  assert.equal(r.committed, 1);
  assert.equal(r.complete, false);
});

test("a reading that reaches the contract's own count is whole", async () => {
  const r = await read(chain({
    nextCommitId: 2,
    events: [fuseLog("FuseCommitted", [1n, 10n, 11n, PROTON, 0n, e18(5000), 0n], 950_000, 0)],
  }));
  assert.equal(r.complete, true);
});

// Sans le compteur, on ne peut pas savoir si l'on a tout vu — et « je ne sais
// pas » n'est pas « oui ».
test("with no counter to check against, completeness is unknown, not assumed", async () => {
  const r = await read(chain({ nextCommitId: null, events: [] }));
  assert.equal(r.complete, null);
  assert.equal(r.expected, null);
});

test("a node that refuses the log range yields a reading, flagged incomplete", async () => {
  const r = await read(chain({ nextCommitId: 50, refuseLogs: true }));
  assert.equal(r.committed, 0);
  assert.equal(r.complete, false);
});

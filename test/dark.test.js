import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { readRitualLogs, tallyRituals, DARK_ABI } from "../src/dark.js";

const E18 = 10n ** 18n;
const charged = (ritualId, vessel, fuel = [1, 2, 3, 4]) => ({
  kind: "charged", ritualId, vessel, fuel, printerBurned: 10000n * E18, ethPaid: E18 / 60n, block: ritualId, index: 0, by: "0x1",
});
const settled = (ritualId, vessel, won) => ({ kind: "settled", ritualId, vessel, won, block: ritualId + 1, index: 0, by: "0x1" });

test("a vessel is forged only by a ritual settled as won", () => {
  const t = tallyRituals([
    charged(1, 93), settled(1, 93, true),
    charged(2, 50), settled(2, 50, false),
    charged(3, 77),
  ]);
  assert.deepEqual([...t.forged], [[93, 1]]);
  assert.equal(t.won, 1);
  assert.equal(t.lost, 1);
  // Payée, pas encore jouée : ni gagnée ni perdue.
  assert.equal(t.pending, 1);
  assert.equal(t.rituals, 3);
  assert.equal(t.winRate, 0.5);
  // Le carburant part à l'adresse morte que la partie soit gagnée ou non.
  assert.equal(t.fuelBurned, 12);
  assert.equal(t.printerBurned, 30000);
});

test("the same window read twice counts every ritual once", () => {
  const evs = [charged(1, 93), settled(1, 93, true)];
  const t = tallyRituals([...evs, ...evs]);
  assert.equal(t.rituals, 1);
  assert.equal(t.won, 1);
  assert.equal(t.fuelBurned, 4);
});

test("with nothing settled there is no win rate, not a zero one", () => {
  assert.equal(tallyRituals([charged(1, 5)]).winRate, null);
  assert.equal(tallyRituals([]).winRate, null);
});

// Les journaux lus pour de vrai, encodés comme le contrat les émet.
const log = (name, args, block) => {
  const ev = DARK_ABI.getEvent(name);
  const { data, topics } = DARK_ABI.encodeEventLog(ev, args);
  return { data, topics, blockNumber: block, index: 0 };
};

test("the reader decodes both events and walks the window in spans", async () => {
  const by = "0x" + "a".repeat(40);
  const logs = [
    log("Charged", [by, 1, 93, ethers.ZeroHash, [1, 2, 3, 4], 10000n * E18, 1n], 5),
    log("Settled", [by, 1, 93, true, 40, 235], 150),
  ];
  const windows = [];
  const provider = { getLogs: async ({ fromBlock, toBlock }) => {
    windows.push([fromBlock, toBlock]);
    return logs.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
  } };
  const evs = await readRitualLogs({ provider, contract: "0x1", fromBlock: 0, toBlock: 199, span: 100 });
  assert.deepEqual(windows, [[0, 99], [100, 199]]);
  assert.deepEqual(evs.map((e) => [e.kind, e.ritualId, e.vessel]), [["charged", 1, 93], ["settled", 1, 93]]);
  assert.deepEqual(evs[0].fuel, [1, 2, 3, 4]);
  assert.equal(evs[1].won, true);
});

// Avancer le curseur par-dessus une tranche refusée ferait disparaître pour
// toujours les parties qu'elle contenait.
test("a refused span fails the whole read instead of skipping it", async () => {
  const provider = { getLogs: async ({ fromBlock }) => { if (fromBlock === 100) throw new Error("429"); return []; } };
  await assert.rejects(readRitualLogs({ provider, contract: "0x1", fromBlock: 0, toBlock: 199, span: 100 }), /429/);
});

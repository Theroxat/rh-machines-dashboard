import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { readBlueMints } from "../src/blue.js";

const T = ethers.id("Transfer(address,address,uint256)");
const BLUE = "0x" + "b".repeat(40), NFT = "0x" + "c".repeat(40), ME = "0x" + "e".repeat(40);
const log = (from, to, id, block) => ({
  blockNumber: block, topics: [T, ethers.zeroPadValue(from, 32), ethers.zeroPadValue(to, 32), ethers.zeroPadValue(ethers.toBeHex(id), 32)], data: "0x",
});

// Est Blue une machine que le contrat Blue a remise à quelqu'un.
test("a Blue Machine is one the Blue contract handed out, read in spans", async () => {
  const windows = [];
  const provider = { getLogs: async ({ topics, fromBlock, toBlock }) => {
    windows.push([fromBlock, toBlock]);
    assert.equal(topics[1], ethers.zeroPadValue(BLUE, 32));
    return [log(BLUE, ME, 1523, 150)].filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
  } };
  const mints = await readBlueMints({ provider, machines: NFT, contract: BLUE, fromBlock: 0, toBlock: 199, span: 100 });
  assert.deepEqual(windows, [[0, 99], [100, 199]]);
  assert.deepEqual(mints, [{ tokenId: 1523, to: ethers.getAddress(ME), block: 150 }]);
});

test("a refused span fails the whole read instead of skipping it", async () => {
  const provider = { getLogs: async ({ fromBlock }) => { if (fromBlock === 100) throw new Error("429"); return []; } };
  await assert.rejects(readBlueMints({ provider, machines: NFT, contract: BLUE, fromBlock: 0, toBlock: 199, span: 100 }), /429/);
});

// Le 2026-09-29 : 372 des 474 sorties du contrat Blue allaient à l'adresse
// morte — des brûlées reçues en paiement. Elles ne sont pas des Blue.
test("a machine the Blue contract sends to the dead address is not a Blue Machine", async () => {
  const DEAD = "0x000000000000000000000000000000000000dEaD";
  const provider = { getLogs: async () => [log(BLUE, DEAD, 86, 10), log(BLUE, ME, 1523, 11)] };
  const mints = await readBlueMints({ provider, machines: NFT, contract: BLUE, fromBlock: 0, toBlock: 99, span: 100 });
  assert.deepEqual(mints.map((m) => m.tokenId), [1523]);
});

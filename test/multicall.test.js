import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { readUintMap } from "../src/multicall.js";

const iface = new ethers.Interface(["function value(uint256) view returns (uint256)"]);
const encode = (n) => iface.encodeFunctionResult("value", [n]);

test("ids are read in batches and merged into one map", async () => {
  const seen = [];
  const aggregate3 = async (calls) => {
    seen.push(calls.length);
    return calls.map((_, i) => [true, encode(100 + i)]);
  };
  const { values, failures } = await readUintMap({
    aggregate3, iface, target: "0x0", fn: "value", ids: [1, 2, 3, 4, 5], batchSize: 2,
  });
  assert.deepEqual(seen, [2, 2, 1]);
  assert.equal(values.size, 5);
  assert.equal(values.get(1), 100n);
  assert.equal(values.get(3), 100n);
  assert.equal(failures, 0);
});

test("a failed sub-call yields no entry at all, never a zero", async () => {
  const aggregate3 = async (calls) => calls.map((_, i) => (i === 0 ? [false, "0x"] : [true, encode(7)]));
  const { values, failures } = await readUintMap({
    aggregate3, iface, target: "0x0", fn: "value", ids: [1, 2], batchSize: 10,
  });
  assert.equal(values.has(1), false);
  assert.equal(values.get(2), 7n);
  assert.equal(failures, 1);
});

test("undecodable return data is a failure, not a guess", async () => {
  const aggregate3 = async (calls) => calls.map(() => [true, "0xdead"]);
  const { values, failures } = await readUintMap({
    aggregate3, iface, target: "0x0", fn: "value", ids: [1], batchSize: 10,
  });
  assert.equal(values.size, 0);
  assert.equal(failures, 1);
});

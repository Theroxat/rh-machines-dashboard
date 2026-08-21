import { test } from "node:test";
import assert from "node:assert/strict";
import { readHoldings, valueHoldings } from "../src/holdings.js";
import { ethers } from "ethers";

const ERC20 = new ethers.Interface(["function balanceOf(address) view returns (uint256)"]);
const TOKENS = [
  { address: "0x" + "1".repeat(40), symbol: "NVDA", decimals: 18 },
  { address: "0x" + "2".repeat(40), symbol: "SPCX", decimals: 18 },
];
const acct = (n) => "0x" + String(n).repeat(40);

const fake = (balances) => async (calls) =>
  calls.map((c) => {
    const key = `${c.target}:${"0x" + c.callData.slice(-40)}`;
    const v = balances[key];
    return v === undefined ? [false, "0x"] : [true, ERC20.encodeFunctionResult("balanceOf", [v])];
  });

test("a machine's account is read for every stock the protocol has bought", async () => {
  const { holdings } = await readHoldings({
    aggregate3: fake({
      [`${TOKENS[0].address}:${acct(7)}`]: 10n ** 17n,
      [`${TOKENS[1].address}:${acct(7)}`]: 5n * 10n ** 16n,
    }),
    accounts: [[42, acct(7)]], tokens: TOKENS, batchSize: 10,
  });
  assert.deepEqual(holdings.get(42), [
    { symbol: "NVDA", address: TOKENS[0].address, amount: 0.1 },
    { symbol: "SPCX", address: TOKENS[1].address, amount: 0.05 },
  ]);
});

// Un compte vidé est une information — son porteur a retiré — pas une lecture
// manquée. Il ne doit produire aucune ligne, et surtout pas une ligne à zéro.
test("an emptied account holds nothing, and says nothing", async () => {
  const { holdings } = await readHoldings({
    aggregate3: fake({ [`${TOKENS[0].address}:${acct(7)}`]: 0n, [`${TOKENS[1].address}:${acct(7)}`]: 0n }),
    accounts: [[42, acct(7)]], tokens: TOKENS, batchSize: 10,
  });
  assert.equal(holdings.has(42), false);
});

test("a balance that could not be read is counted as a failure, never as zero", async () => {
  const { holdings, failures } = await readHoldings({
    aggregate3: fake({ [`${TOKENS[0].address}:${acct(7)}`]: 10n ** 18n }),
    accounts: [[42, acct(7)]], tokens: TOKENS, batchSize: 10,
  });
  assert.equal(failures, 1);
  assert.equal(holdings.get(42).length, 1);
});

test("holdings come back heaviest first", async () => {
  const { holdings } = await readHoldings({
    aggregate3: fake({
      [`${TOKENS[0].address}:${acct(7)}`]: 10n ** 16n,
      [`${TOKENS[1].address}:${acct(7)}`]: 10n ** 18n,
    }),
    accounts: [[42, acct(7)]], tokens: TOKENS, batchSize: 10,
  });
  assert.deepEqual(holdings.get(42).map((h) => h.symbol), ["SPCX", "NVDA"]);
});

test("what a machine holds is valued at what the stocks trade for", () => {
  const v = valueHoldings([{ symbol: "NVDA", amount: 0.037 }, { symbol: "SPCX", amount: 0.0044 }],
    (s) => ({ NVDA: 217.66, SPCX: 134.53 })[s] ?? null);
  assert.equal(v.usd.toFixed(2), "8.65");
  assert.equal(v.priced, 2);
});

// Une action sans prix garde sa quantité et n'entre dans aucun total : la
// compter à zéro ferait passer une machine pleine pour une machine vide.
test("a stock with no price keeps its amount and stays out of the total", () => {
  const v = valueHoldings([{ symbol: "NVDA", amount: 0.1 }, { symbol: "MYSTERY", amount: 99 }],
    (s) => (s === "NVDA" ? 200 : null));
  assert.equal(v.usd.toFixed(2), "20.00");
  assert.equal(v.lines.find((l) => l.symbol === "MYSTERY").usd, null);
  assert.equal(v.priced, 1);
});

test("a machine holding nothing is valued at nothing, not at zero dollars", () => {
  assert.deepEqual(valueHoldings([], () => 1), { lines: [], usd: null, priced: 0 });
});

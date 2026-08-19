import { test } from "node:test";
import assert from "node:assert/strict";
import { readBallotTickers } from "../src/ballot.js";
import { ethers } from "ethers";

const VOTE = new ethers.Interface(["function choicesFor(uint256) view returns (address[])"]);
const ERC20 = new ethers.Interface(["function symbol() view returns (string)"]);
const addr = (n) => "0x" + String(n).padStart(40, "0");

/** Un fournisseur de pacotille : il répond au contrat de vote et aux jetons. */
const fakeProvider = (choices, symbols = {}) => ({
  calls: 0,
  async call({ to, data }) {
    this.calls++;
    if (data.startsWith(VOTE.getFunction("choicesFor").selector)) {
      return choices === null ? "0x" : VOTE.encodeFunctionResult("choicesFor", [choices]);
    }
    const s = symbols[to.toLowerCase()];
    if (s === undefined) throw new Error("no symbol");
    return ERC20.encodeFunctionResult("symbol", [s]);
  },
});

test("the ballot is read from state, so it answers as well on the last day as the first", async () => {
  const p = fakeProvider([addr(1), addr(2)], { [addr(1)]: "NVDA", [addr(2)]: "AMD" });
  const t = await readBallotTickers({ provider: p, epoch: 2 });
  assert.equal(t[0], "NVDA");
  assert.equal(t[1], "AMD");
  assert.equal(t.length, 16);
});

// Un desk dont l'action n'a pas de pool reste un trou jusqu'à réattribution.
// Un null se lit comme « pas sur le bulletin » ; un tiret se lirait comme une
// donnée qu'on n'a pas su lire.
test("a desk with no token this epoch is null, not a dash", async () => {
  const p = fakeProvider([addr(1), ethers.ZeroAddress], { [addr(1)]: "NVDA" });
  const t = await readBallotTickers({ provider: p, epoch: 2 });
  assert.equal(t[0], "NVDA");
  assert.equal(t[1], null);
});

// L'équipe réattribue un desk en cours de scrutin. Lire l'ouverture du bulletin
// figeait la liste ; lire l'état la suit.
test("a desk remapped mid-ballot is picked up on the next sweep", async () => {
  const before = await readBallotTickers({ provider: fakeProvider([ethers.ZeroAddress]), epoch: 2 });
  assert.equal(before[0], null);
  const after = await readBallotTickers({
    provider: fakeProvider([addr(9)], { [addr(9)]: "SPY" }), epoch: 2,
  });
  assert.equal(after[0], "SPY");
});

test("a symbol is read once per address, however many epochs ask for it", async () => {
  const p = fakeProvider([addr(3)], { [addr(3)]: "COIN" });
  await readBallotTickers({ provider: p, epoch: 2 });
  const first = p.calls;
  await readBallotTickers({ provider: p, epoch: 3 });
  assert.equal(p.calls - first, 1, "un seul appel de plus : le bulletin, pas le symbole");
});

test("an unreadable ballot yields nothing rather than sixteen holes", async () => {
  assert.equal(await readBallotTickers({ provider: fakeProvider(null), epoch: 2 }), null);
  assert.equal(await readBallotTickers({ provider: fakeProvider([]), epoch: 2 }), null);
  assert.equal(await readBallotTickers({ provider: fakeProvider([addr(1)]), epoch: null }), null);
});

test("a token that will not name itself leaves its desk unnamed, not broken", async () => {
  const t = await readBallotTickers({ provider: fakeProvider([addr(7)]), epoch: 2 });
  assert.equal(t[0], null);
});

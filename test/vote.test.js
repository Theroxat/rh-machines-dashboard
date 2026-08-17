import { test } from "node:test";
import assert from "node:assert/strict";
import { deskShares, DESK_SLOTS } from "../src/vote.js";

const voteOf = (over = {}) => ({
  epoch: 1, closesAt: null, finalized: false, opened: false,
  tally: new Map(), totalVotes: 0n, ...over,
});

// Chaque machine vote avec son poids, pas pour une voix. Le tally est donc en
// poids brut — 100 par x1 tout juste activée — et se lit en points.
const tallyOf = (pairs) => new Map(pairs.map(([d, w]) => [d, BigInt(w)]));

const INDEX = new Map([[1, 5], [2, 5], [3, 0], [4, 14]]);
const TICKERS = new Map([[1, "AAPL"], [2, "AAPL"], [3, "NVDA"], [4, "ETH"]]);
const tickerOf = (id) => TICKERS.get(id) ?? null;

test("a desk's share is what it drew out of every vote cast", () => {
  const { desks } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[5, 30000], [0, 10000]]), totalVotes: 40000n }),
    deskIndex: INDEX, tickerOf,
  });
  const aapl = desks.find((d) => d.ticker === "AAPL");
  assert.equal(aapl.share, 0.75);
  assert.equal(aapl.votedWeight, 300);
  assert.equal(desks.find((d) => d.ticker === "NVDA").share, 0.25);
});

test("the desk that drew most comes first, whatever its index", () => {
  const { desks } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[0, 100], [5, 900], [14, 500]]), totalVotes: 1500n }),
    deskIndex: INDEX, tickerOf,
  });
  assert.deepEqual(desks.map((d) => d.ticker), ["AAPL", "ETH", "NVDA"]);
});

// Un desk sans voix ne reçoit rien du pot. C'est un fait, pas une absence de
// donnée : il garde sa ligne, à zéro.
test("a desk nobody voted for keeps its line, at nothing", () => {
  const { desks } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[5, 1000], [0, 0]]), totalVotes: 1000n }),
    deskIndex: INDEX, tickerOf,
  });
  const nvda = desks.find((d) => d.ticker === "NVDA");
  assert.equal(nvda.votedWeight, 0);
  assert.equal(nvda.share, 0);
});

// Zéro voix et zéro part ne sont pas la même chose : avant l'ouverture du
// bulletin personne n'a voté parce que personne n'a encore pu, et annoncer
// « 0% du pot » ferait passer une attente pour un désaveu.
test("before a single vote no share is announced, rather than a share of nothing", () => {
  const { desks, opened } = deskShares({
    vote: voteOf({ tally: tallyOf([[5, 0], [0, 0]]), totalVotes: 0n }),
    deskIndex: INDEX, tickerOf,
  });
  assert.equal(opened, false);
  for (const d of desks) assert.equal(d.share, null);
});

test("an index that two tickers claim is reported, not arbitrated", () => {
  const { desks, conflicts } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[5, 100]]), totalVotes: 100n }),
    deskIndex: new Map([[1, 5], [2, 5]]),
    tickerOf: (id) => (id === 1 ? "AAPL" : "TSLA"),
  });
  assert.deepEqual(conflicts, [5]);
  assert.equal(desks.find((d) => d.index === 5).ticker, null);
});

test("a machine whose ticker is unknown names no desk and breaks none", () => {
  const { desks, conflicts } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[5, 100]]), totalVotes: 100n }),
    deskIndex: new Map([[1, 5], [9, 5]]),
    tickerOf: (id) => (id === 1 ? "AAPL" : null),
  });
  assert.deepEqual(conflicts, []);
  assert.equal(desks.find((d) => d.index === 5).ticker, "AAPL");
});

test("a ballot that could not be read at all yields nothing, never an empty tally", () => {
  assert.equal(deskShares({ vote: null, deskIndex: INDEX, tickerOf }), null);
});

test("the ballot carries sixteen desks", () => {
  assert.equal(DESK_SLOTS, 16);
});

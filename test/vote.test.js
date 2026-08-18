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

test("a desk's share is what it drew out of every vote cast", () => {
  const { desks } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[5, 30000], [0, 10000]]), totalVotes: 40000n }),
  });
  const health = desks.find((d) => d.desk === "health");
  assert.equal(health.share, 0.75);
  assert.equal(health.votedWeight, 300);
  assert.equal(desks.find((d) => d.desk === "energy").share, 0.25);
});

test("the desk that drew most comes first, whatever its index", () => {
  const { desks } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[0, 100], [5, 900], [10, 500]]), totalVotes: 1500n }),
  });
  assert.deepEqual(desks.map((d) => d.desk), ["health", "real estate", "energy"]);
});

// Un desk sans voix ne reçoit rien du pot. C'est un fait, pas une absence de
// donnée : il garde sa ligne, à zéro.
test("a desk nobody voted for keeps its line, at nothing", () => {
  const { desks } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[5, 1000], [0, 0]]), totalVotes: 1000n }),
  });
  const energy = desks.find((d) => d.desk === "energy");
  assert.equal(energy.votedWeight, 0);
  assert.equal(energy.share, 0);
});

// Zéro voix et zéro part ne sont pas la même chose : avant l'ouverture du
// bulletin personne n'a voté parce que personne n'a encore pu, et annoncer
// « 0% du pot » ferait passer une attente pour un désaveu.
test("before a single vote no share is announced, rather than a share of nothing", () => {
  const { desks, opened } = deskShares({
    vote: voteOf({ tally: tallyOf([[5, 0], [0, 0]]), totalVotes: 0n }),
  });
  assert.equal(opened, false);
  for (const d of desks) assert.equal(d.share, null);
});

// Les desks se nommaient d'après des tickers déduits d'une couleur de corps.
// C'était faux : ce sont des secteurs, et la chaîne les indexe.
test("every desk is named for its sector, never for a stock", () => {
  const { desks } = deskShares({
    vote: voteOf({ opened: true, tally: tallyOf([[7, 100], [15, 50]]), totalVotes: 150n }),
  });
  assert.equal(desks.find((d) => d.index === 7).desk, "tech");
  assert.equal(desks.find((d) => d.index === 15).desk, "semis");
  for (const d of desks) assert.doesNotMatch(d.desk, /^[A-Z]{3,5}$/);
});

test("a ballot that could not be read at all yields nothing, never an empty tally", () => {
  assert.equal(deskShares({ vote: null }), null);
});

test("the ballot carries sixteen desks", () => {
  assert.equal(DESK_SLOTS, 16);
});

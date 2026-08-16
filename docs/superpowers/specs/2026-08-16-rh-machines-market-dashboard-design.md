# RH MACHINES — Market Dashboard (design)

Date: 2026-08-16

## What this is

A read-only web dashboard that answers one question about the `rh-machines`
collection on Robinhood Chain: **what does each rarity class actually cost right
now, and how deep is the market behind that price?**

It is not a sniper, not a portfolio tracker, not an alerting service. It holds no
private key, signs nothing, and places no order. It reads public marketplace
listings and public chain state, computes floors, and shows them.

## Why the split by ink matters

A Machine is activated by burning $PRINTER into it ("ink"). Activation costs
5,000 $PRINTER, of which 4,250 is burned as ink and 750 is an operating charge.
Once activated it is permanent, and a dormant Machine earns nothing, cannot vote,
and receives no stock.

At the prices measured on 2026-08-16 — $PRINTER at $0.01260, ETH at $1880.69 —
the activation ink is worth **$53.55 ≈ 0.0285 ETH**, against a collection floor
of **0.0889891 ETH ≈ $167**. The ink is therefore about **32% of the price of a
floor Machine**.

That is the whole reason this dashboard exists. A single "floor of the x2 class"
that mixes activated and dormant Machines averages two assets separated by a
third of their value, and the resulting number describes neither. Every floor
here is computed per class **and** per ink state, or not at all.

## Scope

In scope:

- Floors per sealed rarity class × ink state (14 cells).
- Supply and listed-ratio per cell, which requires reading ink for all 10,000
  Machines, not only the listed ones.
- The ink/dormant spread per class, compared against the live cost of ink.
- Live context: $PRINTER price, ETH/USD, protocol state (epoch, ceiling, burns).

Explicitly out of scope, and why:

- **Buy signals / undervalued listings.** A different product with a different
  failure mode. The market-state grid is what was asked for.
- **Effective-weight grouping** (rarity × √(ink/4250)). More faithful to how
  farming actually works, but a more abstract read; sealed class × ink state is
  the grid the user reasons in.
- **Over-inked breakout.** Machines burned beyond 4,250 weigh more than their
  sealed class. They are counted as inked like any other. Noted as a known
  simplification, revisitable.
- **Historical series.** Storage, retention and charts for a value that only
  exists after days of collection. The snapshot shape makes it additive later.
- **Portfolio view.** Not asked for.

## Data sources

| What | Source | Notes |
|---|---|---|
| Listings | OpenSea v2 `/listings/collection/rh-machines/all` | Cursor-paginated. Price is `price.current.value` in wei, currency ETH, 18 decimals. |
| Sealed rarity + desk | `TRAITS.weightOf(id)`, `TRAITS.sectorOf(id)` via Multicall3 | 10,000 reads, once, cached to disk forever. |
| Ink | `MINE.inkBurned(id)` via Multicall3 | 10,000 reads, refreshed on its own slow loop. |
| Protocol state | `MINE` — `currentEpoch`, `multiplierCeiling`, `totalInkBurned`, `activeMachines`, `totalWeight`, `nextGate`, `ACTIVATION_INK` | |
| $PRINTER price | DexScreener API, pair `robinhood/0xf6c9…f47b` | PRINTER/USDG, Uniswap v4. |
| ETH/USD | DexScreener pair `0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca` (USDG/WETH, Uniswap v3, ~$8.7M liquidity) | Cross-checked against CoinGecko; both values and their spread are displayed. |

**Two different tokens on this chain both call themselves USDG.** The canonical
one, quoted against $PRINTER and used by the protocol, is
`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`. A second,
`0x63575aA902DE35ef2dc3a3D32355233bbb44CDa7`, sits in the deepest USDG/WETH pool
on the chain (~$110M) and prices ETH at **$1786** against the canonical pool's
**$1883** and CoinGecko's **$1884** — 5% wrong, with no error anywhere. Picking a
pool by liquidity alone lands on the impostor.

Two guards, because this number scales the entire ink axis:

- The pair's `baseToken.address` and `quoteToken.address` are checked against the
  expected addresses on every read. A mismatch is a failure, not a fallback.
- USDG's own `priceUsd` must stay within 3% of $1. The impostor sat at $1.053.

Chain: Robinhood Chain, id **4663**, RPC `https://rpc.mainnet.chain.robinhood.com`.

Contracts:

```
MACHINES    0xB509e195bcB3E4461e235Ff152c68D66915f67b5
MINE        0x3C4E763E87Ac5775A23aE2eb2e69F90232f413E1
TRAITS      0x8a0833f41cE9e869d6ebd8aC16EfDC9Ee7a38a22
TOKEN       0x85a574f2fF0795685F58d1D7B0D4b51F148Ac489
MULTICALL3  0xcA11bde05977b3631167028862bE2a173976CA11
```

**`weightOf` exists on two contracts and returns two different things.** On
TRAITS it is the sealed class (100…1000). On MINE it is the effective weight
including ink. This dashboard reads the sealed class from TRAITS only.

## Rarity classes

| Class | On-chain value | Count | Share |
|---|---|---|---|
| x1 | 100 | 7,131 | 71.3% |
| x1.5 | 150 | 407 | 4.1% |
| x2 | 200 | 1,356 | 13.6% |
| x3 | 300 | 559 | 5.6% |
| x4 | 400 | 429 | 4.3% |
| x6 | 600 | 81 | 0.8% |
| x10 | 1000 | 37 | 0.4% |

Counts come from the published documentation and are used only as a sanity check
against what is read from chain. A mismatch is surfaced, not silently accepted.

## The grid

Seven rows (one per sealed class), each split into an **inked** half and a
**dormant** half. A Machine is inked when `inkBurned(id) > 0`.

Each of the 14 cells carries:

- **Floor (min)** — the cheapest live listing, with its tokenId and OpenSea link.
  This is the actionable price: what it costs to buy right now.
- **Peloton (median of the 5 cheapest)** — the market level, robust to a single
  dust or fat-finger listing.
- **Listed** — number of distinct Machines on sale in this cell.
- **Supply** — how many Machines exist in this class in this ink state.
- **Listed ratio** — listed ÷ supply. This is what gives the floor its meaning:
  x6 at 0.8 ETH with 2 of 81 on sale is not the same market as 40 of 81.

Showing min **and** peloton side by side is deliberate. When they diverge
sharply, the divergence is itself the signal — an isolated anomaly sits at the
bottom of the book.

## The ink spread

Per class: `floor(inked) − floor(dormant)`, displayed next to the live cost of
activation ink in ETH. When the spread is below the ink cost, the market is
selling activation for less than it costs to perform — a fact worth seeing, not
a recommendation.

A spread is only computed when **both** halves of the row have a floor. One
missing half yields no spread, never a spread against zero.

## Rules that keep the page honest

A wrong dashboard is worse than no dashboard. These are requirements, not
polish.

1. **No listing means "no listing", never `0`.** A floor of zero reads as the
   bargain of the century.
2. **Fewer than 5 listings in a cell means no peloton at all** — `null`,
   rendered as "3 listed, no peloton". A median over two values must never be
   presented with the same authority as a median over five. Classes x6 (81
   Machines) and x10 (37) will hit this routinely.
3. **An unreadable rarity is `null`, never a default of x1.** Affected Machines
   are excluded from every count, and the number excluded is displayed. A silent
   default would inflate the most common class with unknowns.
4. **A failed sweep never overwrites a good one.** The last valid snapshot stays
   on screen under a banner naming its age and the last error. Stale-and-labelled
   beats fresh-and-wrong.
5. **OpenSea's published `floor_price` enters no computation.** It was measured
   on this chain at ~10× the real book (0.1240 announced against real listings
   between 0.0128 and 0.020). It is displayed separately, as a comparison point
   only.
6. **Listings are deduplicated by tokenId, keeping the cheapest.** The API
   returns the same token more than once (token 5504 appeared twice in the first
   five rows on 2026-08-16). Without dedup, listing counts and the peloton median
   are both inflated by duplicates.
7. **Both ETH/USD sources are shown with their spread.** They agreed to 0.2% at
   design time. A future divergence is information, not something to average away.

## Architecture

```
src/
  config.js      addresses, RPC, class table, .env loading
  opensea.js     paginate the book, dedup by tokenId, wei -> ETH
  traits.js      10,000 sealed rarities via Multicall3, cached to disk forever
  ink.js         10,000 inkBurned via Multicall3, refreshed on a slow loop
  prices.js      $PRINTER via DexScreener, ETH/USD via local pool + CoinGecko
  protocol.js    MINE state
  floors.js      PURE: (listings, traits, ink) -> 14 cells. No I/O.
  server.js      the two loops + HTTP
  public/        the page
```

`floors.js` holds every rule above that is a computation, takes plain data, and
returns plain data. It is the only module that needs exhaustive tests, and it can
have them because it touches nothing.

The readers each do one thing and report failure as failure. None of them
substitutes a default for a value it could not read.

## Cadences

- OpenSea book + prices: **60 s**
- Ink across 10,000 Machines: **10 min**, in its own loop
- Sealed traits: once, then cache (they are sealed at mint; there is no
  staleness risk)
- Protocol state: 60 s

The two loops are independent. Either one failing leaves the other running, and
the page says which half is stale.

## HTTP surface

- `GET /` — the dashboard page
- `GET /api/snapshot` — the computed snapshot as JSON, the same object the page
  renders

## Visual direction

Trading terminal, not landing page. The page should look like an instrument
someone built to read numbers fast.

**In:** near-black neutral background; 1px hairline rules instead of shadows;
monospace tabular figures, right-aligned, units in muted small text; dense
layout; semantic colour only — amber for inked, cold grey-blue for dormant;
small-caps muted labels; corner radius 0–2px.

**Out:** purple/indigo gradients, glassmorphism, floating rounded cards, emoji,
gradient text, hero sections, decorative colour, generous whitespace where data
belongs.

## Testing

`floors.js` against fixtures, covering: a token listed twice (dedup keeps the
cheapest), an empty cell, a cell with 4 listings (no peloton), a null rarity
(excluded and counted), ties at identical prices, and a row with only one half
populated (no spread).

`opensea.js`: cursor pagination and dedup.

No test performs network I/O.

## Deployment

Node service in Docker, published on port **3050** — audited free on the host,
and declared by no container, running or stopped. `OPENSEA_API_KEY` comes from
`.env`, which is gitignored and never committed.

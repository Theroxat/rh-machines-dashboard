# RH MACHINES — market dashboard

A read-only dashboard for the [`rh-machines`](https://opensea.io/collection/rh-machines)
collection on Robinhood Chain. It answers one question: **what does each rarity
class actually cost right now, and how deep is the market behind that price?**

It never holds a private key, never signs a transaction, and never places an
order. It reads public marketplace listings and public chain state, computes
floors, and shows them. Every decision to buy is made by a person, off this tool.

## Why every floor is split by ink

A Machine is activated by burning $PRINTER into it — *ink*. Activation costs
5,000 $PRINTER: 4,250 burned as ink, 750 taken as an operating charge. Once
activated it is permanent. A dormant Machine earns nothing, cannot vote, and
receives no stock.

Measured on 2026-08-16, with $PRINTER at $0.0126 and ETH at $1,883, the
activation ink is worth **$53.72 ≈ 0.0285 ETH**, against a collection floor of
**0.0869 ETH ≈ $164**. The ink is roughly **a third of the price of a floor
Machine**.

So a single "floor of the x2 class" that mixes activated and dormant Machines
averages two assets separated by a third of their value, and the resulting number
describes neither. Every floor here is computed per class **and** per ink state,
or not at all.

## Running it

Create `.env` in the project root (gitignored, never committed):

```
OPENSEA_API_KEY=<your OpenSea API key>
```

Then:

```bash
docker compose up -d --build
```

The dashboard is at **http://192.168.0.11:3050**. The compose file publishes the
container's port only on the host's `192.168.0.11` address — it is not reachable
on `0.0.0.0`, and not on `localhost` from the host itself.

Two files persist under `./data`:

- `traits.json` — the 10,000 sealed rarities, read once from chain (about 20
  seconds) and cached forever. They are sealed at mint and never change, so
  there is no staleness risk. Delete it and the next boot re-reads them.

To run without Docker: `npm install`, then
`set -a && . ./.env && set +a && npm start`. Tests: `npm test`.

## Reading the grid

Seven rows, one per sealed rarity class, each split into an **inked** half and a
**dormant** half. A Machine is inked when its `inkBurned` is above zero.

| Column | What it is |
|---|---|
| **Floor** | The cheapest live listing, linked to the exact Machine that sets it. This is the actionable price: what it costs to buy right now. |
| **Peloton** | The median of the five cheapest listings — the market level, unmoved by a single dust or fat-finger listing. |
| **Listed** | How many distinct Machines are on sale in that cell. |
| **Supply** | How many Machines exist in that class in that ink state, listed or not. |
| **Listed %** | Listed ÷ supply. This is what gives the floor its meaning: x6 at 0.70 ETH with 3 of 46 on sale is not the same market as 40 of 46. |
| **Spread vs cost of ink** | `floor(inked) − floor(dormant)`, drawn as a bar from zero, with a ▲ marking what ink costs. A bar that stops short of the ▲ is a market paying less for activation than activation costs. |

Floor and peloton are shown side by side on purpose. When they diverge sharply,
the divergence is itself the signal — an isolated anomaly is sitting at the
bottom of that book.

## What the page will not do

A wrong dashboard is worse than no dashboard. These are enforced, not aspirational:

- **"No listing" is never `0`.** A floor of zero reads as the bargain of the century.
- **Fewer than five listings means no peloton at all.** The cell says how many it
  has instead. A median over two values must never be presented with the same
  authority as a median over five. The x6 and x10 classes hit this routinely —
  there are 81 and 37 of them in total.
- **An unreadable value is excluded and counted, never defaulted.** A rarity that
  failed to read does not silently become an x1. The footer states how many
  Machines were excluded and why.
- **A failed sweep never overwrites a good one.** The last valid snapshot stays on
  screen under a red banner naming its age and the error. Stale and labelled beats
  fresh and wrong.
- **OpenSea's published `floor_price` enters no computation.** On this chain it has
  been measured at roughly ten times the real book. It is displayed at the bottom,
  for comparison only.
- **The listings book is read to exhaustion or not at all.** A truncated book would
  silently move floors; the reader throws instead.
- **Listings are deduplicated by Machine.** The API returns the same token more
  than once; without dedup, listing counts and the peloton are inflated.

## Two tokens called USDG

Robinhood Chain carries two tokens with the symbol `USDG`. The canonical one,
quoted against $PRINTER and used by the protocol, is
`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`. A second,
`0x63575aA902DE35ef2dc3a3D32355233bbb44CDa7`, sits in the deepest USDG/WETH pool
on the chain (~$110M) and prices ETH at **$1,786** against the canonical pool's
**$1,883** and CoinGecko's **$1,884** — 5% wrong, with no error anywhere.

Selecting a pool by symbol or by liquidity lands on the impostor, and the ink
axis of this entire dashboard is scaled by that number. So the pair is pinned by
address, its `baseToken`/`quoteToken` addresses are verified on every read, and
USDG's own price must stay within 3% of $1 or the conversion is refused.

ETH is priced from the on-chain pool and cross-checked against CoinGecko. Both
values and the gap between them are displayed; a future divergence is
information, not something to average away.

## Where the data comes from

| What | Source |
|---|---|
| Listings | OpenSea v2, `/listings/collection/rh-machines/all`, cursor-paginated |
| Sealed rarity and desk | `TRAITS.weightOf` / `TRAITS.sectorOf` via Multicall3 |
| Ink | `MINE.inkBurned` via Multicall3, all 10,000 Machines |
| Protocol state | `MINE` — epoch, multiplier ceiling, total burned, active Machines |
| $PRINTER price | DexScreener, PRINTER/USDG on Uniswap v4 |
| ETH/USD | DexScreener, canonical USDG/WETH pool, cross-checked with CoinGecko |

Chain: Robinhood Chain, id 4663, RPC `https://rpc.mainnet.chain.robinhood.com`.

`weightOf` exists on two contracts and returns two different things: on TRAITS it
is the sealed class (100…1000), on MINE it is the effective weight including ink.
This dashboard reads the sealed class from TRAITS only.

## Cadences

The listings book, prices and protocol state refresh every **60 seconds**. Ink
across all 10,000 Machines refreshes every **10 minutes**, in its own loop — it
only changes when someone activates or re-inks, so it does not need the book's
rhythm and must never block the display. The two loops are independent: either
one failing leaves the other running, and the page says which half is stale.

## Design and plan

- Design: `docs/superpowers/specs/2026-08-16-rh-machines-market-dashboard-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-16-rh-machines-market-dashboard.md`

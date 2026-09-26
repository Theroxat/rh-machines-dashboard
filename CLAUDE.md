# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A read-only dashboard for the `rh-machines` NFT collection on Robinhood Chain (id 4663). It reads
public OpenSea listings and public chain state, computes floors per rarity class **and** per ink
state, and serves one page. It holds no key, signs nothing, and has no write path.

`README.md` explains *why* the numbers are shaped the way they are (the inked/dormant split, the
USDG impostor, the headwear→rarity derivation, the cache-hash story). Read it before changing
anything that produces a number. `docs/protocol.md` separates what is verified on-chain from what is
merely documented, and names where each undocumented contract address came from.

## Commands

```bash
npm test                      # node --test test/*.test.js — 482 tests, ~2 s, no network, no .env
node --test test/floors.test.js                     # one file
node --test --test-name-pattern "peloton" test/*.test.js   # by name (glob, not test/)

set -a && . ./.env && set +a && npm start           # run locally on :3050
```

### Deploying — read this before any `docker compose up`

**Prod has visitors.** Rebuilding `rh-dashboard` takes it down for ~56 s. Develop on the bench,
touch prod only to ship (`DEPLOY.md`):

```bash
npm test                                                     # first, always
docker compose --profile staging up -d --build rh-dashboard-staging
until curl -sf http://192.168.0.11:3051/api/snapshot >/dev/null; do sleep 5; done
docker compose up -d --build rh-dashboard                    # prod, when verified
```

Three services, all bound to `192.168.0.11` only (never `0.0.0.0`): prod `:3050` → `data/`, bench
`:3051` → `data-staging/` (profile `staging`, Discord webhook blanked, no auto-restart), archived
version `:3052` → `data-legacy/` (profile `legacy`). The legacy service deliberately has **no
`build:`** — its image is built once from the `legacy` branch (`git archive legacy | docker build -t
rh-dashboard:legacy -`) so `up --build` cannot silently replace it with today's code. A test enforces
this, and another enforces that no two services claim the same host port.

## Architecture

One Node 22 ESM process, no framework, no frontend build step, `ethers` as the only runtime
dependency. History uses the built-in `node:sqlite` (`DatabaseSync`), which is one reason Node 22 is
the floor — do not add an SQLite package.

**Readers → pure compute → snapshot store → HTTP.** Each `src/*.js` is either a *reader* that does one
thing against one source and reports failure as failure (`opensea`, `prices`, `ink`, `traits`,
`metadata`, `owners`, `anvil`, `vote`, `ballot`, `dark`, `drops`, `pot`, `protocol`, `pad`, `proton`, `official`,
`holdings`, `balances`), or a *pure* module that takes plain data and returns plain data (`floors`,
`snapshot`, `rarity`, `scarcity`, `worth`, `wallet`, `alert`, `desks`, `traitindex`, `http`).
Plumbing: `multicall` (Multicall3 batching), `store` (the non-regressing snapshot holder), `history`
(SQLite change log). `server.js` is the only place that wires them, owns the mutable state, and
touches the network.

**Seven independent loops**, each rescheduling itself *after* it finishes so a slow sweep can never
overlap the next (`loop()` in `server.js`): book+prices+protocol 60 s, ink 10 min, owners 10 min,
status 10 min, dark 2 min, pad 2 min, proton 10 min. Owners and status reuse `inkPollIntervalMs`;
dark reuses `padPollIntervalMs` and reads ritual logs incrementally, one cursor per contract in
`DARK.contracts` (the node serves logs but no historical state). The team swapped ritual contracts
once without notice (ids restart at 1): rituals are keyed by contract + id, and a contract announced by
`/api/dark` is followed only if its `owner()` is `DARK.owner`. The book sweep throws until status has been read once.
One loop failing leaves the others running, and the page says which half is stale.

**The store never regresses.** `createStore` keeps the last payload that actually computed; a failed
sweep records its error and leaves the data alone. Stale-and-labelled beats fresh-and-wrong — the
page shows a red banner naming the age and the error.

**Dependency injection is why tests need no network.** Readers take `provider`, `aggregate3`
(from `multicallOf`), or `fetchImpl = fetch` as parameters. Tests pass fakes. Never reach for a
global `fetch` or construct a provider inside a reader.

**`src/public/app.js` is dual-use.** The browser loads it as a module, and `test/page.test.js`
imports its render functions directly. Everything above the `CÂBLAGE` marker must stay pure and
DOM-free; all wiring lives below `if (typeof document !== "undefined")`. It has no build step, so no
JSX, no bundler syntax, no bare imports.

**Chain reads go through Multicall3.** 10,000 machines in batches of `multicallBatchSize` (500).
Never loop 10,000 individual RPC calls.

### HTTP surface

`GET`/`HEAD` only (anything else is 405, checked before the first route). Routes match on
`url.pathname`, never the whole URL — `/?utm_source=x` must equal `/`. Every response, the 404
included, carries `securityHeaders()`.

| Route | Notes |
|---|---|
| `/`, `/index.html` | `no-cache`; carries the hashed script address |
| `/app.<hash>.js` | content-addressed, `immutable`, cached a year |
| `/app.js` | unversioned fallback, never cached |
| `/api/snapshot` | `no-cache` + ETag; `503` (never an empty `200`) until the first sweep lands |
| `/api/pad`, `/api/scarcity` | own routes because they move on 10-minute cadences, not the book's |
| `/api/wallet?address=` | the only route that reads the chain per request — one multicall, `WALLET_MAX_INFLIGHT` = 8 |

The snapshot body is serialized once per sweep, not per request, and deliberately carries no age
field: an age would change the ETag on every request and defeat the 304s. The page recomputes age
from `at` and the response `Date` header.

## Invariants — these are enforced, not aspirational

Breaking one produces a dashboard that is confidently wrong, which is worse than no dashboard.
The full list with reasoning is in README §"What the page will not do". The load-bearing ones:

- "No listing" is never `0`. An unreadable value is excluded and counted, never defaulted.
- Fewer than `pelotonSize` (5) listings means **no peloton at all**, not a median over two.
- The listings book is read to exhaustion or it throws. Listings are deduplicated by machine.
- Every row has three cells since the 2026-09-23 Meltdown: inked, dormant, **burned**. Dark
  Machines (Dark Ritual, same day) are a fourth state but **one collection-level cell**,
  `grid.dark` → `snapshot.darkBook`, filtered on the page as the pseudo-class `"Dark"`. The burned
  mark exists only in off-chain metadata (`readLiveStatus`); destroyed Machines are those owned by
  `0x…dEaD`, read on-chain. A Machine with no status read is excluded, never assumed alive. The
  collection floor and market cap cover the living only.
- A burned or Dark Machine keeps its on-chain weight: anything that values or rewards a Machine must
  read its status before its weight (`worth.js` valued burned ones at the living floor until
  2026-09-24). `epochUsd` still models proportional slices; drops have been winner-takes-all since
  2026-08-27 (see `docs/protocol.md`).
- Sealed rarity comes from `TRAITS.weightOf` only — `MINE.weightOf` is a different number
  (effective weight including ink) on a different contract.
- DEX pairs are pinned **by address** in `src/config.js`. Selecting by symbol or by liquidity lands
  on the impostor USDG (`0x63575aA9…`) which prices ETH 5% wrong with no error anywhere.
- OpenSea's published `floor_price` enters no computation; it is displayed for comparison only.
- History writes happen after serving, inside try/catch. A failed write is counted, never fatal.
- `server.listen` must precede the first read, so a cold start is a warming site, not a dead one.

Anything with a new third-party host must also be declared in `SOURCES` / `THIRD_PARTY_HOSTS`
(`src/sources.js`) — `test/official.test.js` fails otherwise. The page shows that provenance table,
so a number whose source is not stated is a bug.

### Tests that read source text

`test/routing.test.js` and `test/smoke.test.js` assert against the *text* of `server.js` and
`docker-compose.yml` (the server builds everything at import, so it cannot be imported for testing).
Refactoring `server.js` can therefore break tests that match literal strings like
`req.method !== "GET"` or `p.has ? 200 : 503`. Keep the guarantee and update the matcher — never
delete the test.

## Configuration

- `config.json` — numeric knobs only, every one range-validated by `loadConfig` in `src/config.js`.
- Env (`.env`, gitignored): `OPENSEA_API_KEY` (required, boot fails without it), `DISCORD_WEBHOOK`
  (optional; absent = no alerts), `MACHINES_ADDRESS` and `OPENSEA_SLUG` (override for the collection's
  pending contract migration — a `.env` change and a restart, not a code change).
- Contract addresses are frozen in `src/config.js`, each with a comment saying how it was obtained.
  Several are undocumented and were lifted from the official terminal's bundles then verified
  on-chain; they can change without notice.
- `data/` (gitignored) holds `traits.json` and `metadata.json`, both sealed-at-mint and cached
  forever, plus `history-<contract8>.db`, one SQLite file per contract, which records *changes*
  rather than states. `traits.json` is safe to delete. **`metadata.json` is not**: OpenSea no longer
  publishes the `Wallet`/`Desk`/`Weight` traits it holds, and the Meltdown rewrote the published
  headwear of 4,381 Machines, so a refetch would lose the 6551 accounts and break the
  headwear→class legend. Current pictures come from the status loop instead.

## Conventions

- Code comments and internal docs (`DEPLOY.md`, `docs/protocol.md`) are in **French**; all
  user-facing copy — page, HTTP responses, `README.md` — is in **English**. Be consistent within a file.
- Comments explain *why*, usually naming the incident that caused the line, with dates and measured
  figures. Match that register: a comment asserting an invariant the code no longer guarantees is
  considered more dangerous than no comment.
- Commit subjects are lowercase `type: ` prose describing the effect, not the diff
  ("fix: the pot was waiting for the whole row, and left a hole in the hero").

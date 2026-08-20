import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ethers } from "ethers";

import { loadConfig, RPC_URL, CHAIN_ID, ADDRESSES, TOTAL_MACHINES } from "./config.js";
import { fetchListings, fetchCollectionStats } from "./opensea.js";
import { loadTraits } from "./traits.js";
import { loadMetadata } from "./metadata.js";
import { deriveHeadwearLegend } from "./rarity.js";
import { readInk } from "./ink.js";
import { fetchPrinter, fetchEthUsd } from "./prices.js";
import { readProtocol } from "./protocol.js";
import { readAnvil } from "./anvil.js";
import { readVote, readDeskIndex } from "./vote.js";
import { readPot, epochUsd } from "./pot.js";
import { readBallotTickers } from "./ballot.js";
import { readOwners, tokensOf } from "./owners.js";
import { openHistory } from "./history.js";
import { analyseWallet, isAddress } from "./wallet.js";
import { SECTORS } from "./desks.js";
import { deskName, crossCheckDesks } from "./desks.js";
import { buildGrid } from "./floors.js";
import { composeSnapshot } from "./snapshot.js";
import { createStore } from "./store.js";
import { assetHash, assetPath, stampPage, cacheHeaders, securityHeaders, etagOf } from "./http.js";
import { multicallOf } from "./multicall.js";

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig(process.env, JSON.parse(readFileSync(join(here, "..", "config.json"), "utf8")));
const app = readFileSync(join(here, "public", "app.js"), "utf8");
const favicon = readFileSync(join(here, "public", "favicon.svg"), "utf8");
const appHash = assetHash(app);
const appPath = assetPath(appHash);
// La page part avec l'adresse du script qu'elle a été construite pour exécuter.
const page = stampPage(readFileSync(join(here, "public", "index.html"), "utf8"), appHash);

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
const STALE_AFTER_MS = cfg.bookPollIntervalMs * 3;
const store = createStore({ staleAfterMs: STALE_AFTER_MS });

/**
 * Le corps de l'API est sérialisé une fois par snapshot, pas une fois par
 * requête : il pèse 174 Ko, le carnet ne bouge qu'une fois par minute, et deux
 * cents visiteurs le redemandent huit cents fois dans le même temps.
 *
 * L'âge et la péremption ne sont volontairement plus dans le corps : ils
 * changeaient à chaque requête, ce qui aurait donné un ETag différent à chaque
 * fois et annulé tout l'intérêt. La page les recalcule depuis `at` et l'en-tête
 * `Date` de la réponse — deux horloges du serveur, donc immunisé au décalage de
 * celle du visiteur.
 */
let cachedPayload = { key: null, body: null, etag: null, has: false };

function apiPayload() {
  const v = store.get();
  const key = `${v.at}|${v.lastError}`;
  if (cachedPayload.key !== key) {
    const body = JSON.stringify({
      data: v.data, at: v.at, lastError: v.lastError, staleAfterMs: STALE_AFTER_MS,
    });
    cachedPayload = { key, body, etag: etagOf(body), has: v.data !== null };
  }
  return cachedPayload;
}

let traits = new Map();
let ink = new Map();
let weights = new Map();
let inkMeta = { readAt: null, failures: null };
let meta = new Map();
let legend = null;
// Le desk est scellé au mint : lu une fois au démarrage, jamais réinterrogé.
let deskIndex = new Map();

/**
 * L'historique. Le service voyait tout et n'en gardait rien.
 *
 * Il s'ouvre au démarrage et n'est jamais une condition : si le fichier ne peut
 * pas s'ouvrir — disque plein, dossier en lecture seule, base d'une version
 * qu'on ne sait plus lire — la page continue de servir sans lui, et le dit.
 */
let history = null;
let historyFailures = 0;
try {
  // Un fichier par contrat. La collection migre, et deux collections dont les
  // identifiants se ressemblent ne doivent pas se retrouver dans la même table :
  // au basculement, un fichier neuf commence et l'ancien reste lisible.
  history = openHistory(join(here, "..", "data", `history-${ADDRESSES.MACHINES.slice(2, 10).toLowerCase()}.db`));
  console.log(`history: recording to data/history-${ADDRESSES.MACHINES.slice(2, 10).toLowerCase()}.db`);
} catch (e) {
  console.error(`history: not recording — ${e.message}`);
}
// Les propriétaires bougent à chaque vente : relus sur la boucle de l'encre.
let owners = { byToken: new Map(), byOwner: new Map(), failures: null };
// Quel ticker occupe quel desk cette epoch, et le dépouillement en cours.
let tickers = null;
let tally = new Array(16).fill(0);

async function sweepOwners() {
  owners = await readOwners({
    aggregate3: multicallOf(provider, ADDRESSES.MULTICALL3),
    ids: Array.from({ length: TOTAL_MACHINES }, (_, i) => i + 1),
    batchSize: cfg.multicallBatchSize,
  });
  console.log(`owners: ${owners.byOwner.size} wallets hold ${owners.byToken.size} machines` +
    (owners.failures ? `, ${owners.failures} unreadable` : ""));
}

async function sweepInk() {
  const { ink: fresh, weights: freshWeights, failures } = await readInk({ provider, batchSize: cfg.multicallBatchSize });
  ink = fresh;
  weights = freshWeights;
  inkMeta = { readAt: Date.now(), failures };
  const reinked = [...fresh].filter(([, v]) => v > 4250n * 10n ** 18n).length;
  console.log(`ink: ${fresh.size} machines read, ${reinked} re-inked past activation, ${failures} failures`);
}

async function sweepBook() {
  const [book, printer, eth, protocol, stats] = await Promise.all([
    fetchListings({ apiKey: cfg.openseaApiKey, maxPages: cfg.maxBookPages }),
    fetchPrinter(),
    fetchEthUsd(),
    readProtocol({ provider }),
    fetchCollectionStats({ apiKey: cfg.openseaApiKey }),
  ]);

  // Le scrutin se lit après le protocole, qui seul dit de quelle epoch il
  // s'agit. Un bulletin illisible ne doit pas emporter la page avec lui : la
  // part de chaque desk est une information de plus, pas une condition.
  const vote = await readVote({ provider, epoch: protocol?.epoch })
    .catch((e) => { console.error(`vote: ${e.message}`); return null; });

  // Le pot en attente : le solde USDG de celui qui achètera. Aucun contrat ne
  // le nomme, et sans lui la page ne peut annoncer aucun retour.
  const potUsd = await readPot({ provider }).catch(() => null);

  // Le ticker posé sur chaque desk change à chaque epoch : un porteur cherche
  // « SPCX », pas « real estate ». Sans cette table la page nomme un secteur
  // pendant que le terminal officiel propose une action.
  tickers = await readBallotTickers({ provider, epoch: protocol?.epoch })
    .catch(() => null) ?? tickers;
  tally = vote ? Array.from({ length: 16 }, (_, d) => Number(vote.tally.get(d) ?? 0n)) : tally;

  // L'anvil est lu après le carnet parce qu'il faut savoir quelles machines sont
  // en vente pour lui demander ce qu'il en donnerait — et avant la grille, parce
  // que son rayon se range dans les mêmes cases.
  const anvil = await readAnvil({
    provider,
    aggregate3: multicallOf(provider, ADDRESSES.MULTICALL3),
    tokenIds: [...book.listings.keys()],
    batchSize: cfg.multicallBatchSize,
  }).catch((e) => { console.error(`anvil: ${e.message}`); return null; });

  const grid = buildGrid({
    listings: book.listings, traits, ink, pelotonSize: cfg.pelotonSize,
    shelf: anvil?.shelfListings,
  });

  // Le poids de chaque desk : il décide de la dilution sur sa propre tranche.
  const sectorWeight = new Array(16).fill(0);
  for (const [tokenId, index] of deskIndex) sectorWeight[index] += Number(weights.get(tokenId) ?? 0n);

  const composed = composeSnapshot({
    grid, printer, eth, protocol, stats,
    book: { listed: book.listings.size, pages: book.pages, skipped: book.skipped },
    inkMeta, meta, legend, ink, weights, anvil, deskIndex, vote, potUsd, sectorWeight, tickers, now: Date.now(),
  });
  store.succeed(composed);

  // Après avoir servi, jamais avant. Une écriture qui échoue est comptée et
  // annoncée ; elle ne peut pas emporter le balayage avec elle.
  if (history) {
    try {
      const n = history.record(composed, { ink, weights });
      if (n.listing || n.floor || n.machine || n.tally || n.ballot) {
        console.log(`history: ${n.listing} listing, ${n.floor} floor, ${n.tally} tally, ` +
          `${n.ballot} ballot, ${n.shelf} shelf, ${n.machine} machine`);
      }
    } catch (e) {
      historyFailures++;
      console.error(`history: write failed (${historyFailures} so far) — ${e.message}`);
    }
  }

  const under = composed.rows
    .flatMap((r) => [...r.inked.entries, ...r.dormant.entries])
    .filter((e) => e.underBid).length;
  console.log(`book: ${book.listings.size} listings over ${book.pages} pages` +
    (anvil ? `, anvil spot ${Math.round(anvil.spotPrinter)} PRINTER, shelf ${anvil.shelf}` +
      (anvil.bidPaused ? ", BID PAUSED" : "") : ", anvil unreadable") + `, ${under} under the anvil bid`);
}

/** Chaque boucle se replanifie après s'être terminée, pour qu'un balayage lent
 *  ne puisse jamais chevaucher le suivant. Un échec est enregistré et la boucle
 *  continue.
 *  `runNow: false` sert à l'encre, déjà lue une fois au démarrage : sans ça la
 *  boucle relit les 10 000 machines dans la seconde qui suit, pour rien. */
function loop(name, fn, intervalMs, { runNow = true } = {}) {
  const tick = async () => {
    try { await fn(); }
    catch (e) { store.fail(e); console.error(`${name}: ${e.message}`); }
    finally { setTimeout(tick, intervalMs).unref?.(); }
  };
  if (runNow) tick();
  else setTimeout(tick, intervalMs).unref?.();
}

const server = createServer((req, res) => {
  if (req.url === "/api/snapshot") {
    const p = apiPayload();
    const headers = {
      "content-type": "application/json",
      etag: p.etag,
      ...cacheHeaders("api"),
      ...securityHeaders(),
    };
    if (p.has && req.headers["if-none-match"] === p.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(p.has ? 200 : 503, headers);
    res.end(p.body);
    return;
  }
  // Le portefeuille d'un visiteur. Tout est déjà en mémoire : l'index des
  // propriétaires, les poids, les desks, le dépouillement. La requête ne
  // touche pas la chaîne, donc elle ne peut pas servir à la marteler.
  if (req.url.startsWith("/api/wallet")) {
    const address = new URL(req.url, "http://x").searchParams.get("address");
    const headers = { "content-type": "application/json", ...cacheHeaders("api"), ...securityHeaders() };
    // Ce qui entre ici interroge un index et ressort dans du balisage : une
    // adresse, quarante hexadécimaux, rien d'autre.
    if (!isAddress(address)) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: "not an address" }));
      return;
    }
    const snap = store.get().data;
    const sectorWeight = new Array(16).fill(0);
    for (const [tokenId, index] of deskIndex) sectorWeight[index] += Number(weights.get(tokenId) ?? 0n);
    const fleetWeight = snap?.pot?.fleetWeight ?? null;
    const body = analyseWallet({
      address: address.trim().toLowerCase(),
      tokenIds: tokensOf(owners.byOwner, address),
      weightOf: (id) => Number(weights.get(id) ?? 0n),
      deskOf: (id) => deskIndex.get(id) ?? null,
      // La même fonction que le tableau : sans quoi la somme des machines d'un
      // portefeuille ne retomberait pas sur le total annoncé au-dessus d'elles.
      epochUsdOf: (w, id) => epochUsd({
        weight: w, deskIndex: deskIndex.get(id) ?? null,
        totalWeight: fleetWeight, potUsd: snap?.pot?.usd ?? null, tally, sectorWeight,
      }),
      tally, potUsd: snap?.pot?.usd ?? null, fleetWeight, sectorWeight,
      tickers: tickers ?? new Array(16).fill(null),
    });
    res.writeHead(200, headers);
    res.end(JSON.stringify({ ...body, sectors: SECTORS, closesAt: snap?.vote?.closesAt ?? null }));
    return;
  }
  if (req.url === appPath) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", ...cacheHeaders("asset"), ...securityHeaders() });
    res.end(app);
    return;
  }
  if (req.url === "/favicon.svg") {
    res.writeHead(200, { "content-type": "image/svg+xml", ...cacheHeaders("page"), ...securityHeaders() });
    res.end(favicon);
    return;
  }
  if (req.url === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", ...cacheHeaders("asset-unversioned"), ...securityHeaders() });
    res.end(app);
    return;
  }
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...cacheHeaders("page"), ...securityHeaders() });
    res.end(page);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

const started = async () => {
  const { traits: t, source } = await loadTraits({
    provider,
    cachePath: join(here, "..", "data", "traits.json"),
    batchSize: cfg.multicallBatchSize,
  });
  traits = t;
  console.log(`traits: ${t.size} sealed rarities (${source})`);

  // Les images et les traits sont scellés au mint comme les raretés : lus une
  // fois, cachés à vie. Un échec ici coûte les vignettes et la légende, pas le
  // marché — le dashboard démarre quand même.
  try {
    const loaded = await loadMetadata({
      apiKey: cfg.openseaApiKey,
      cachePath: join(here, "..", "data", "metadata.json"),
      maxPages: cfg.maxMetadataPages,
      wanted: [...traits.keys()],
    });
    meta = loaded.meta;
    legend = deriveHeadwearLegend({ meta, traits });
    const amb = legend.ambiguous.length;
    console.log(`metadata: ${meta.size} machines (${loaded.source}` +
      (loaded.filled ? `, ${loaded.filled} backfilled one by one` : "") + ")" +
      (amb ? `, ${amb} ambiguous headwear` : ", headwear maps cleanly to class"));

    // Le desk est scellé au mint et la chaîne le publie : lu une fois, jamais
    // réinterrogé. La page le déduisait de la couleur du corps et le nommait
    // d'après des tickers — c'était faux, et la déduction a disparu avec.
    deskIndex = await readDeskIndex({
      aggregate3: multicallOf(provider, ADDRESSES.MULTICALL3),
      ids: Array.from({ length: TOTAL_MACHINES }, (_, i) => i + 1),
      batchSize: cfg.multicallBatchSize,
    }).catch((e) => { console.error(`desks: deskOf unreadable — ${e.message}`); return new Map(); });
    const named = new Set([...deskIndex.values()].map(deskName).filter(Boolean));
    console.log(`desks: ${deskIndex.size} machines placed across ${named.size} sectors`);

    // L'équipe ajoute le desk aux métadonnées. La chaîne reste l'autorité, mais
    // le jour où les deux se contrediront il faut le voir, pas le supposer.
    // Le contrôle a fait son travail : il a montré que les métadonnées nomment
    // les desks par leur ticker, et la page a adopté ce nom. Il reste en place
    // pour la prochaine divergence, celle qu'on n'attend pas — un index dont le
    // ticker changerait sans qu'on le voie.
    const cross = crossCheckDesks({ deskIndex, meta });
    const naming = [...new Set([...deskIndex.entries()]
      .map(([id, i]) => meta.get(id)?.desk && `${i}=${meta.get(id).desk}`).filter(Boolean))].length;
    if (!cross.checked) {
      console.log("desks: metadata carries no desk yet — the page names them by sector");
    } else {
      console.log(`desks: metadata names ${naming} desks by ticker, on ${cross.checked} machines — ` +
        `the page follows those names, with the sector alongside`);
    }
  } catch (e) {
    console.error(`metadata: ${e.message} — the dashboard runs without pictures`);
  }

  await sweepInk().catch((e) => console.error(`ink: ${e.message}`));

  loop("book", sweepBook, cfg.bookPollIntervalMs);
  loop("ink", sweepInk, cfg.inkPollIntervalMs, { runNow: false });
  loop("owners", sweepOwners, cfg.inkPollIntervalMs);

  server.listen(cfg.port, () => console.log(`dashboard on :${cfg.port}, serving ${appPath}`));
};

started().catch((e) => { console.error(e); process.exit(1); });

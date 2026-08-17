import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ethers } from "ethers";

import { loadConfig, RPC_URL, CHAIN_ID } from "./config.js";
import { fetchListings, fetchCollectionStats } from "./opensea.js";
import { loadTraits } from "./traits.js";
import { loadMetadata } from "./metadata.js";
import { deriveHeadwearLegend } from "./rarity.js";
import { deriveDeskTickers, deriveBodyTickers } from "./desks.js";
import { readInk } from "./ink.js";
import { fetchPrinter, fetchEthUsd } from "./prices.js";
import { readProtocol } from "./protocol.js";
import { buildGrid } from "./floors.js";
import { composeSnapshot } from "./snapshot.js";
import { createStore } from "./store.js";
import { assetHash, assetPath, stampPage, cacheHeaders, securityHeaders, etagOf } from "./http.js";

const here = dirname(fileURLToPath(import.meta.url));
const cfg = loadConfig(process.env, JSON.parse(readFileSync(join(here, "..", "config.json"), "utf8")));
const app = readFileSync(join(here, "public", "app.js"), "utf8");
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
let bodyTickers = new Map();

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

  const grid = buildGrid({ listings: book.listings, traits, ink, pelotonSize: cfg.pelotonSize });

  store.succeed(composeSnapshot({
    grid, printer, eth, protocol, stats,
    book: { listed: book.listings.size, pages: book.pages, skipped: book.skipped },
    inkMeta, meta, legend, bodyTickers, ink, weights, now: Date.now(),
  }));
  console.log(`book: ${book.listings.size} listings over ${book.pages} pages`);
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
  if (req.url === appPath) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", ...cacheHeaders("asset"), ...securityHeaders() });
    res.end(app);
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

    // Aucun contrat ne dit quel ticker porte le desk 7 : la correspondance se
    // déduit en appariant les comptages de la chaîne au recensement publié.
    // Si elle ne tient plus, on le dit et on n'affiche aucun ticker.
    const desks = deriveDeskTickers(traits);
    if (desks.ok) {
      bodyTickers = deriveBodyTickers({ traits, meta, byIndex: desks.byIndex });
      const named = [...bodyTickers.values()].filter(Boolean).length;
      console.log(`desks: ${desks.byIndex.size} tickers resolved, ${named}/${bodyTickers.size} body colours named`);
    } else {
      console.error(`desks: no ticker mapping — ${desks.reason}`);
    }
  } catch (e) {
    console.error(`metadata: ${e.message} — the dashboard runs without pictures`);
  }

  await sweepInk().catch((e) => console.error(`ink: ${e.message}`));

  loop("book", sweepBook, cfg.bookPollIntervalMs);
  loop("ink", sweepInk, cfg.inkPollIntervalMs, { runNow: false });

  server.listen(cfg.port, () => console.log(`dashboard on :${cfg.port}, serving ${appPath}`));
};

started().catch((e) => { console.error(e); process.exit(1); });

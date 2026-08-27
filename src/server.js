import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ethers } from "ethers";

import { loadConfig, RPC_URL, CHAIN_ID, ADDRESSES, TOTAL_MACHINES, PAD, PROTON } from "./config.js";
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
import { readStockTokens, readHoldings, valueHoldings } from "./holdings.js";
import { findDeals, dealEmbed, dealMessage, dealKey, postToDiscord, COOLDOWN_MS } from "./alert.js";
import { fetchStockPrices } from "./prices.js";
import { analyseWallet, isAddress } from "./wallet.js";
import { valueWallet } from "./worth.js";
import { SECTORS } from "./desks.js";
import { deskName, crossCheckDesks, crossCheckWeights } from "./desks.js";
import { buildGrid } from "./floors.js";
import { composeSnapshot } from "./snapshot.js";
import { createStore } from "./store.js";
import { assetHash, assetPath, stampPage, cacheHeaders, securityHeaders, etagOf } from "./http.js";
import { readBalances } from "./balances.js";
import { multicallOf } from "./multicall.js";
import { readPad, readPools, priceCoin, padStats, padMovement, markNamesakes } from "./pad.js";
import { readProton } from "./proton.js";
import { readOfficial, crossCheck } from "./official.js";
import { burnSplit, lockUp, fuseOdds } from "./scarcity.js";

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
// Les actions que le protocole a déjà achetées, et ce qu'elles valent.
let stockTokens = [];
let stockPrices = new Map();
// PRINTER.FUN, l'autre produit de l'écosystème. Il vit sur sa propre cadence :
// deux cent soixante-quatorze pièces ne bougent pas à la minute, et les relire
// à chaque balayage du carnet coûterait mille appels pour rien.
let pad = null;
// Le Proton, son coffre, et ce que l'écosystème a détruit. Lu à part : remonter
// les journaux coûte une centaine de requêtes, et rien de tout cela ne bouge à
// la minute.
let scarcity = null;

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

// Vingt-quatre heures : assez pour qu'un lancement compte, assez court pour que
// « ce qui monte » désigne quelque chose qui monte encore.
const PAD_WINDOW_MS = 24 * 60 * 60 * 1000;

async function sweepPad() {
  const coins = await readPad({
    provider,
    aggregate3: multicallOf(provider, ADDRESSES.MULTICALL3),
    factories: PAD.factories,
    batchSize: cfg.multicallBatchSize,
  });

  // Le prix des actions qui servent de base. Ce sont les mêmes jetons que ceux
  // que le protocole achète pour les machines, lus par la même route ; celles
  // que le pad utilise et que le protocole n'a jamais achetées s'y ajoutent.
  const bases = [...new Map(coins.map((c) => [c.baseSymbol, { symbol: c.baseSymbol, address: c.base }])).values()];
  const prices = await fetchStockPrices(bases).catch(() => new Map());
  const priced = markNamesakes(coins.map((c) => priceCoin(c, prices.get(c.baseSymbol) ?? null)));

  // Graduer vide la courbe dans une vraie pool : les trois graduées lisent zéro
  // partout tant qu'on ne va pas chercher la pool où elles s'échangent
  // réellement. C'est là qu'est l'essentiel de l'activité du pad.
  const pools = await readPools(priced.filter((c) => c.graduated)).catch(() => new Map());
  for (const c of priced) c.pool = pools.get(c.token) ?? null;

  // Le snapshot part en JSON : les réserves sont des BigInt et ne s'y sérialisent
  // pas. Seuls partent les champs que la page affiche, ce qui divise aussi par
  // six le poids d'un tableau de deux cent soixante-quatorze lignes.
  const wire = priced.map((c) => ({
    token: c.token, symbol: c.symbol, name: c.name,
    baseSymbol: c.baseSymbol, base: c.base,
    lockedUsd: c.lockedUsd, nominalUsd: c.nominalUsd,
    progress: c.progress, graduated: c.graduated,
    // Une graduée a échangé — c'est la condition pour graduer. Son `realBase`
    // est nul parce que la courbe s'est vidée, pas parce que rien ne s'est passé.
    traded: c.graduated || Boolean(Number(c.realBase)),
    // Qui l'a lancée, et si elle est seule à porter son nom : dix-sept lignes
    // « ZEUB » sans rien pour les départager sont un piège, pas un tableau.
    creator: c.creator, sharing: c.sharing, rank: c.rank,
    pool: c.pool,
  }));

  // Ce qui a bougé depuis hier. La ligne de base est relevée avant l'écriture :
  // après, la valeur d'il y a une minute serait celle de maintenant.
  const now = Date.now();
  const movement = history
    ? padMovement({ coins: priced, baseline: history.padBaseline(now - PAD_WINDOW_MS), now, windowMs: PAD_WINDOW_MS })
    : null;
  if (history) {
    try { history.recordPad(priced, now); }
    catch (e) { console.error(`pad history: ${e.message}`); }
  }

  pad = { ...padStats(priced), coins: wire, movement, readAt: now, site: PAD.site };
  console.log(`pad: ${pad.launched} coins, ${pad.graduated} graduated, ${pad.untouched} never bought` +
    (pad.lockedUsd === null ? ", none priced" : `, $${Math.round(pad.lockedUsd)} in curves`) +
    (pad.poolUsd === null ? "" : `, $${Math.round(pad.poolUsd)} in pools, $${Math.round(pad.vol24hUsd)} traded in 24h`) +
    (movement ? `; since ${new Date(movement.since).toISOString().slice(11, 16)}: ` +
      `+${movement.launched} launched, $${Math.round(movement.inUsd)} in, $${Math.round(movement.outUsd)} out` : ""));
}

/**
 * Les machines qui ne circulent plus.
 *
 * Deux sorties, et elles ne sont pas de même nature. Le coffre du Proton en
 * garde — son propriétaire peut les en ressortir, donc elles ne sont pas
 * perdues. L'adresse morte en a une, envoyée à la main : celle-là ne revient
 * pas. Aucune n'est détruite : `totalSupply` ne bouge pas d'un pouce, et
 * confondre « hors circulation » avec « brûlée » changerait ce qu'un floor
 * veut dire.
 */
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const ERC721_BAL = new ethers.Interface(["function balanceOf(address) view returns (uint256)"]);

async function readOffCirculation(provider) {
  const count = async (holder) => {
    try {
      const raw = await provider.call({
        to: ADDRESSES.MACHINES,
        data: ERC721_BAL.encodeFunctionData("balanceOf", [holder]),
      });
      return raw === "0x" ? null : Number(ERC721_BAL.decodeFunctionResult("balanceOf", raw)[0]);
    } catch {
      return null;
    }
  };
  const [vault, dead] = await Promise.all([count(PROTON.factory), count(DEAD_ADDRESS)]);
  return { vault, dead };
}

async function sweepScarcity() {
  const p = await readProton({
    provider,
    proton: PROTON.contract,
    factory: PROTON.factory,
    machines: ADDRESSES.MACHINES,
  });

  // Le poids des machines du coffre : le protocole annonce qu'il les active et
  // partage leurs revenus. Le vérifier tient en une lecture par machine.
  const MINE = new ethers.Interface(["function weightOf(uint256) view returns (uint256)"]);
  let awake = null, vaultWeight = null;
  if (p.heldIds.length) {
    try {
      const res = await multicallOf(provider, ADDRESSES.MULTICALL3)(
        p.heldIds.map((id) => ({ target: ADDRESSES.MINE, allowFailure: true, callData: MINE.encodeFunctionData("weightOf", [id]) })));
      awake = 0; vaultWeight = 0;
      for (const r of res) {
        if (!r[0]) continue;
        const w = Number(MINE.decodeFunctionResult("weightOf", r[1])[0]);
        if (w > 0) { awake++; vaultWeight += w; }
      }
    } catch (e) { console.error(`vault weights: ${e.message}`); }
  }

  // L'offre de $PRINTER et l'encre brûlée : deux lectures, et la soustraction
  // qui les sépare dit ce qui a brûlé ailleurs.
  const ERC = new ethers.Interface(["function totalSupply() view returns (uint256)"]);
  const num = async (to, iface, fn) => {
    try { return Number(ethers.formatUnits(iface.decodeFunctionResult(fn, await provider.call({ to, data: iface.encodeFunctionData(fn) }))[0], 18)); }
    catch { return null; }
  };
  const supply = await num(ADDRESSES.TOKEN, ERC, "totalSupply");
  const inkBurned = await num(ADDRESSES.MINE, new ethers.Interface(["function totalInkBurned() view returns (uint256)"]), "totalInkBurned");

  // Le rythme réel, sur trois fenêtres. Le site officiel n'annonce qu'une
  // moyenne depuis le lancement — écrasée par la ruée d'activation initiale, et
  // trois à treize fois au-dessus du rythme du moment.
  const rate = history
    ? { day: history.burnRate(24 * 3600000), week: history.burnRate(7 * 24 * 3600000), all: history.burnRate(365 * 24 * 3600000) }
    : null;

  scarcity = {
    proton: p,
    rate,
    vault: lockUp({ held: p.heldIds.length, awake, weight: vaultWeight, total: TOTAL_MACHINES }),
    burn: burnSplit({ supply, inkBurned, protonBurned: p.printerBurned }),
    // Le taux ne se présente que sur une lecture entière : calculé sur un
    // échantillon amputé par la fenêtre de journaux, il serait faux.
    odds: p.complete === false ? null : fuseOdds({ won: p.won, lost: p.lost, claimedBps: PROTON.claimedSuccessBps }),
    owner: PROTON.owner,
    readAt: Date.now(),
  };
  console.log(`proton: ${p.committed} fusions (${p.won} won, ${p.lost} lost` +
    (p.pending ? `, ${p.pending} pending` : "") + `), ${p.heldIds.length} machines in the vault` +
    (awake === null ? "" : ` (${p.heldIds.length - awake} dormant)`) +
    (p.complete === false ? " — LOG WINDOW INCOMPLETE" : ""));
}

async function sweepBook() {
  const [book, printer, eth, protocol, stats, offCirculation, official] = await Promise.all([
    fetchListings({ apiKey: cfg.openseaApiKey, maxPages: cfg.maxBookPages }),
    fetchPrinter(),
    fetchEthUsd(),
    readProtocol({ provider }),
    fetchCollectionStats({ apiKey: cfg.openseaApiKey }),
    // Ce que la collection a perdu de vue. Le coffre du Proton avale des
    // machines à chaque fusion, et une machine envoyée à l'adresse morte ne
    // revient jamais — mais `totalSupply` compte encore les deux. Deux lectures
    // par balayage : c'est un chiffre de tête, il ne peut pas dépendre d'une
    // route chargée à la demande.
    readOffCirculation(provider),
    // Le pot ne se lit pas entièrement sur la chaîne : aucun contrat ne
    // l'additionne. On prend le chiffre du protocole et on le recoupe contre
    // l'USDG qu'on lit nous-mêmes.
    readOfficial().catch(() => null),
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

  // Ce que chaque machine en vente contient. Le compte appartient au jeton :
  // vendre la machine vend ses actions, et rien ne le disait nulle part.
  if (protocol?.epoch && !stockTokens.length) {
    stockTokens = await readStockTokens({ provider, epoch: protocol.epoch }).catch(() => []);
    if (stockTokens.length) console.log(`stocks: ${stockTokens.length} tickers ever bought — ${stockTokens.map((t) => t.symbol).join(", ")}`);
  }
  if (stockTokens.length) {
    stockPrices = await fetchStockPrices(stockTokens).catch(() => stockPrices);
  }

  const grid = buildGrid({
    listings: book.listings, traits, ink, pelotonSize: cfg.pelotonSize,
    shelf: anvil?.shelfListings,
  });

  // Le poids de chaque desk : il décide de la dilution sur sa propre tranche.
  const sectorWeight = new Array(16).fill(0);
  for (const [tokenId, index] of deskIndex) sectorWeight[index] += Number(weights.get(tokenId) ?? 0n);

  // Seules les machines en vente : lire les dix mille comptes à chaque
  // balayage coûterait cent mille appels pour une information que personne ne
  // regarde sur une machine qui n'est pas à vendre.
  // Le rayon de l'anvil compte parmi les machines en vente. Le compte d'une
  // machine du rayon transporte des actions comme n'importe quelle autre, et
  // elles partent avec elle : les omettre cachait à l'acheteur une partie de
  // ce qu'il paie. C'est une dizaine de comptes de plus, pas dix mille.
  const listedIds = [...new Set([
    ...book.listings.keys(),
    ...(anvil?.shelfListings?.keys() ?? []),
  ])];
  const accounts = listedIds
    .map((id) => [id, meta.get(id)?.wallet])
    .filter(([, w]) => w);
  const held = accounts.length && stockTokens.length
    ? await readHoldings({
        aggregate3: multicallOf(provider, ADDRESSES.MULTICALL3),
        accounts, tokens: stockTokens, batchSize: cfg.multicallBatchSize,
      }).catch((e) => { console.error(`holdings: ${e.message}`); return null; })
    : null;

  const composed = composeSnapshot({
    grid, printer, eth, protocol, stats,
    book: { listed: book.listings.size, pages: book.pages, skipped: book.skipped },
    inkMeta, meta, legend, ink, weights, anvil, deskIndex, vote, potUsd, sectorWeight, tickers,
    holdings: held?.holdings, stockPrices, ownerOf: owners.byToken, now: Date.now(),
    offCirculation,
    official,
  });
  store.succeed(composed);

  // Ce qui mérite de sonner. Les seuils ont été calibrés sur le carnet réel :
  // ce qui est vrai de trois cents annonces n'est pas une affaire. Sans
  // historique on ne notifie rien plutôt que de tout rejouer à chaque
  // redémarrage — une alerte qui se répète cesse d'être lue.
  if (cfg.discordWebhook && history) {
    for (const deal of findDeals(composed)) {
      try {
        if (!history.claimAlert(dealKey(deal), deal.tokenId, deal.kind, composed.at, COOLDOWN_MS)) continue;
        // La fiche d'abord ; la ligne si Discord la refuse — un message
        // dégradé vaut mieux qu'un silence.
        let ok = await postToDiscord(cfg.discordWebhook, dealEmbed(deal, ADDRESSES.MACHINES));
        if (!ok) ok = await postToDiscord(cfg.discordWebhook, dealMessage(deal, ADDRESSES.MACHINES));
        console.log(`alert: ${deal.kind} on #${deal.tokenId} — ${ok ? "sent" : "webhook refused it"}`);
      } catch (e) {
        console.error(`alert: ${e.message}`);
      }
    }
  }

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

/**
 * Les soldes d'une adresse : son $PRINTER et les actions qu'elle a déjà
 * retirées des comptes de ses machines. Lus à la demande — une adresse par
 * requête, jamais dix mille à chaque balayage.
 */
async function readWalletBalances(address) {
  // Le $PRINTER en tête, les actions ensuite : un seul multicall pour les
  // dix-sept. Lus un par un, ils coûtaient dix-sept allers-retours par requête
  // HTTP sur une route que personne n'authentifie ni ne limite.
  const tokens = [{ address: ADDRESSES.TOKEN, decimals: 18 }, ...stockTokens];
  const amounts = await readBalances({
    aggregate3: multicallOf(provider, ADDRESSES.MULTICALL3),
    address, tokens,
  }).catch(() => []);

  const stock = [];
  stockTokens.forEach((t, i) => {
    const amount = amounts[i + 1] ?? 0;
    if (!amount) return;
    const price = stockPrices.get(t.symbol) ?? null;
    stock.push({ symbol: t.symbol, amount, usd: price === null ? null : amount * price });
  });
  return { printer: amounts[0] ?? 0, stock };
}

/**
 * Combien de lectures de portefeuille peuvent tenir la ligne en même temps.
 *
 * Chacune ouvre un multicall et garde sa connexion le temps qu'il revienne.
 * Sans plafond, il suffit d'en lancer mille pour saturer le RPC — et le RPC
 * est ce qui alimente le reste du site, pas seulement cette route. Refuser
 * tout de suite vaut mieux qu'accepter une file que personne ne videra : le
 * visiteur relance, l'attaquant n'obtient rien.
 */
const WALLET_MAX_INFLIGHT = 8;
let walletInflight = 0;

const server = createServer(async (req, res) => {
  // L'adresse se compare par son chemin, pas par sa chaîne entière.
  //
  // Comparée entière, `/?utm_source=twitter` ne valait pas `/` : tout lien
  // partagé avec un paramètre de suivi — et il s'en ajoute sur la moitié des
  // plateformes — tombait sur « not found ». Le site avait l'air mort à qui
  // n'avait rien fait de mal.
  const url = new URL(req.url, "http://x");
  const path = url.pathname;

  // Ce service ne fait que lire. Sans ce test, un POST sur n'importe quelle
  // route rendait 200 avec le corps entier : un scanner, un cache ou un
  // intermédiaire pouvait en conclure qu'une écriture avait été acceptée.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain", allow: "GET, HEAD", ...securityHeaders() });
    res.end("method not allowed");
    return;
  }

  if (path === "/api/snapshot") {
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
  // PRINTER.FUN, sur sa propre route et non dans le snapshot.
  //
  // Le tableau pèse soixante-douze kilo-octets et ne bouge qu'aux dix minutes,
  // quand le snapshot repart toutes les quinze secondes : embarqué, il aurait
  // voyagé trente-neuf fois sur quarante pour rien.
  // Ce qui quitte la circulation : le coffre du Proton et le $PRINTER brûlé.
  // Sa propre route, comme le pad : il ne bouge qu'aux dix minutes.
  if (path === "/api/scarcity") {
    const body = JSON.stringify(scarcity ?? null);
    const etag = etagOf(body);
    const headers = { "content-type": "application/json", etag, ...cacheHeaders("api"), ...securityHeaders() };
    if (scarcity && req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    res.end(body);
    return;
  }
  if (path === "/api/pad") {
    const body = JSON.stringify(pad ?? null);
    const etag = etagOf(body);
    const headers = {
      "content-type": "application/json", etag,
      ...cacheHeaders("api"), ...securityHeaders(),
    };
    if (pad && req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    res.end(body);
    return;
  }
  /**
   * Le portefeuille d'un visiteur.
   *
   * L'index des propriétaires, les poids, les desks et le dépouillement sont
   * en mémoire. Les avoirs des comptes de machines et les soldes du porteur,
   * eux, se lisent sur la chaîne à chaque requête — et c'est ce qui rend cette
   * route différente de toutes les autres.
   *
   * Le commentaire qui tenait ici jurait que la requête ne touchait pas la
   * chaîne « donc ne pouvait pas servir à la marteler ». C'était vrai le jour
   * où il a été écrit ; `readHoldings` et `readWalletBalances` sont arrivés
   * après, et personne n'est revenu le relire. Un invariant affirmé en
   * commentaire est plus dangereux qu'un silence : un relecteur s'y fie.
   *
   * Deux garde-fous, donc, et ils sont dans le code plutôt que dans une
   * phrase : un seul multicall par requête, et un plafond de requêtes
   * simultanées.
   */
  if (path === "/api/wallet") {
    const address = url.searchParams.get("address");
    const headers = { "content-type": "application/json", ...cacheHeaders("api"), ...securityHeaders() };
    // Ce qui entre ici interroge un index et ressort dans du balisage : une
    // adresse, quarante hexadécimaux, rien d'autre.
    if (!isAddress(address)) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: "not an address" }));
      return;
    }
    // Valider l'adresse ne protège de rien : il en existe 2^160 de valides, et
    // qui veut marteler en tire une nouvelle à chaque coup. C'est le nombre de
    // lectures simultanées qu'il faut borner, pas leur forme.
    if (walletInflight >= WALLET_MAX_INFLIGHT) {
      res.writeHead(503, { ...headers, "retry-after": "2" });
      res.end(JSON.stringify({ error: "busy reading the chain — try again in a moment" }));
      return;
    }
    walletInflight++;
    try {
    const snap = store.get().data;
    // Les avoirs des machines du portefeuille : lus une fois, servis à la
    // fois aux vignettes et au calcul de valeur.
    const ownedIds = tokensOf(owners.byOwner, address);
    const ownedAccounts = ownedIds.map((id) => [id, meta.get(id)?.wallet]).filter(([, w]) => w);
    const ownedHeld = ownedAccounts.length && stockTokens.length
      ? await readHoldings({
          aggregate3: multicallOf(provider, ADDRESSES.MULTICALL3),
          accounts: ownedAccounts, tokens: stockTokens, batchSize: cfg.multicallBatchSize,
        }).catch(() => ({ holdings: new Map() }))
      : { holdings: new Map() };
    const priceOfStock = (sym) => stockPrices.get(sym) ?? null;
    const holdsOf = (id) => {
      const v = valueHoldings(ownedHeld.holdings.get(id), priceOfStock);
      return v.lines.length ? { lines: v.lines, usd: v.usd } : null;
    };
    const sectorWeight = new Array(16).fill(0);
    for (const [tokenId, index] of deskIndex) sectorWeight[index] += Number(weights.get(tokenId) ?? 0n);
    const fleetWeight = snap?.pot?.fleetWeight ?? null;
    const body = analyseWallet({
      address: address.trim().toLowerCase(),
      tokenIds: ownedIds,
      imageOf: (id) => meta.get(id)?.image ?? null,
      holdsOf,
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
    // Ce que le portefeuille vaut : les machines, ce qu'elles contiennent, les
    // actions déjà retirées et le $PRINTER. Tout se lit à la demande — une
    // adresse par requête, jamais dix mille à chaque balayage — et un échec
    // n'enlève rien au reste de la réponse.
    let worth = null;
    try {
      const own = await readWalletBalances(address);
      worth = valueWallet({
        machines: body.machines.map((m) => ({
          tokenId: m.tokenId,
          weight: m.weight,
          classValue: traits.get(m.tokenId)?.weightClass ?? null,
          holds: m.holds,
        })),
        rows: snap?.rows,
        ethUsd: snap?.eth?.usd ?? null,
        printer: { amount: own.printer, usd: snap?.printer?.usd ?? null },
        ownStock: own.stock,
      });
    } catch (e) {
      console.error(`wallet: could not value ${address.slice(0, 10)} — ${e.message}`);
    }

    res.writeHead(200, headers);
    res.end(JSON.stringify({ ...body, worth, sectors: SECTORS, closesAt: snap?.vote?.closesAt ?? null }));
    return;
    } finally {
      // Dans un `finally` et pas après le `res.end` : un lancer au milieu de la
      // lecture laisserait sinon le compteur en l'air, et huit erreurs
      // suffiraient à fermer la route pour tout le monde, définitivement.
      walletInflight--;
    }
  }
  if (path === appPath) {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", ...cacheHeaders("asset"), ...securityHeaders() });
    res.end(app);
    return;
  }
  if (path === "/favicon.svg") {
    res.writeHead(200, { "content-type": "image/svg+xml", ...cacheHeaders("page"), ...securityHeaders() });
    res.end(favicon);
    return;
  }
  if (path === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", ...cacheHeaders("asset-unversioned"), ...securityHeaders() });
    res.end(app);
    return;
  }
  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...cacheHeaders("page"), ...securityHeaders() });
    res.end(page);
    return;
  }
  // La seule sortie du service qui échappait à la règle : pas de CSP, pas de
  // nosniff, pas de refus d'encadrement. Le corps est du texte brut, donc le
  // risque était mince — mais une exception qu'on n'explique pas est une
  // exception que le prochain élargira.
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8", ...securityHeaders() });
  res.end("not found");
});

const started = async () => {
  // On écoute avant de lire quoi que ce soit.
  //
  // Le balayage de l'encre prend vingt-cinq secondes sur dix mille machines, et
  // le serveur attendait qu'il finisse. Pendant ce temps rien n'écoutait : le
  // tunnel rendait un refus de connexion, c'est-à-dire une page d'erreur du
  // navigateur, alors que le service allait très bien et travaillait.
  //
  // La route du snapshot rend déjà 503 tant qu'elle n'a rien, et la page sait
  // le dire — « warming up » vaut infiniment mieux qu'un écran d'erreur. Le
  // trou de déploiement passe de cinquante-six secondes de site mort à
  // cinquante-six secondes de site qui s'annonce en train de démarrer.
  server.listen(cfg.port, () => console.log(`dashboard on :${cfg.port}, serving ${appPath} — warming up`));

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

  // Le poids et le multiplicateur publiés sont établis sans passer par notre
  // dérivation couvre-chef → classe : les recouper la met à l'épreuve sur
  // les dix mille machines, à chaque démarrage.
  const wc = crossCheckWeights({
    weights, meta,
    classOf: (id) => traits.get(id)?.weightClass ?? null,
  });
  if (!wc.checked) {
    console.log("weights: metadata publishes none — nothing to cross-check");
  } else {
    // Un écart ne veut pas dire une erreur : les métadonnées sont figées dans
    // notre cache, la chaîne avance à chaque brûlure. C'est ce qui compte qui
    // est dit — combien de multiplicateurs notre table de raretés reproduit.
    const drift = wc.checked - wc.agree;
    console.log(`weights: ${wc.multAgree}/${wc.multChecked} multipliers reproduce our rarity table` +
      (drift ? `, ${drift} machines burned since the metadata was cached` : ", nothing has burned since"));
  }


  loop("book", sweepBook, cfg.bookPollIntervalMs);
  loop("ink", sweepInk, cfg.inkPollIntervalMs, { runNow: false });
  loop("owners", sweepOwners, cfg.inkPollIntervalMs);
  loop("pad", sweepPad, cfg.padPollIntervalMs);
  loop("proton", sweepScarcity, cfg.protonPollIntervalMs);

  console.log("ready: first sweep done, serving live data");
};

started().catch((e) => { console.error(e); process.exit(1); });

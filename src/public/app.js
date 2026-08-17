// Rendu du dashboard. Séparé du HTML pour être testable hors navigateur :
// tout ce qui fabrique du balisage est une fonction pure qui rend une chaîne,
// et le seul câblage au DOM est en bas de fichier, derrière un garde.

export const fmtEth   = (v) => v === null || v === undefined ? "—" : v.toFixed(4);
export const fmtRatio = (v) => v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";
export const fmtUsd   = (v, d = 2) => v === null || v === undefined ? "—" : "$" + v.toFixed(d);
export const fmtInt   = (v) => v === null || v === undefined ? "—" : v.toLocaleString("en-US");

/** Le prix en dollars à côté du prix en ETH : tout le monde sait ce que vaut un
 *  dollar, personne ne convertit 0.1050 ETH de tête. Sans taux lu, on n'invente
 *  pas de conversion — on laisse l'ETH seul plutôt que d'afficher un faux. */
export const usdOf = (eth, ethUsd) =>
  eth === null || eth === undefined || !ethUsd ? null : eth * ethUsd;
export const fmtUsdShort = (v) =>
  v === null || v === undefined ? "" : v >= 10000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

const MACHINES = "0xb509e195bcb3e4461e235ff152c68d66915f67b5";
export const itemUrl = (id) => `https://opensea.io/assets/robinhood/${MACHINES}/${id}`;
/** Une machine du rayon s'achète sur l'anvil, et nulle part ailleurs : le lien
 *  mène donc là où la transaction se fait, pas sur une fiche descriptive. */
export const ANVIL_URL = "https://rh.btcmachine.gg/";
export const SWAP_URL = "https://rh.btcmachine.gg/swap";
export const anvilUrl = () => ANVIL_URL;

/** Combien de machines une case montre avant de proposer le reste. */
export const DEFAULT_LIMIT = 8;

/** Combien un clic en révèle de plus. Un dépliage d'un seul coup mettait 375
 *  vignettes d'un bloc sur les x1 dormantes : la page devenait impraticable et
 *  le navigateur chargeait autant d'images. Par tranches, on garde l'accès à
 *  l'intégralité sans le mur. */
export const REVEAL_STEP = 40;

export const cellKey = (classValue, side) => `${classValue}:${side}`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** "None" est une vraie valeur de couvre-chef, et c'est la classe x6. Écrite
 *  telle quelle sur la page, elle se lirait comme une donnée manquante. */
const headwearLabel = (hw) => hw === "None" ? "no headwear at all" : hw;

/** Toutes les valeurs du bandeau sont en ambre. J'avais tenté « ambre = un
 *  prix », avec le comptage de machines et l'époque laissés neutres : à l'usage
 *  ces deux-là ressortaient comme des oublis plutôt que comme une règle. */
function statBlock(label, value, extra) {
  return `<div class="stat">` +
    `<span class="label">${label}</span>` +
    `<span class="v">${value}</span>` +
    `<span class="x">${extra ?? ""}</span>` +
  `</div>`;
}

/** Les grands nombres se lisent mieux abrégés : $1,772,000 demande un effort
 *  que $1.8M ne demande pas, et la précision au dollar près n'apporte rien. */
export function fmtBig(v) {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}k`;
  return fmtUsd(v);
}

/** Des jetons, pas des dollars : mêmes abréviations, sans signe monétaire. */
export function fmtCompact(v) {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return fmtInt(Math.round(v));
}

/**
 * Le plafond et la classe sont deux multiplicateurs sans rapport : la classe est
 * la rareté scellée au mint, que rien ne plafonne, tandis que le plafond limite
 * ce que l'encre fait gagner en plus — `√(ink/4250)`. Les afficher tous deux en
 * « x » sans dire lequel est lequel faisait lire « ceiling 2x » comme une
 * contradiction avec la ligne x10 juste en dessous.
 */
function ceilingLine(pr) {
  if (!pr?.ceiling) return "ceiling unreadable";
  const ceiling = `ink ceiling x${Number(pr.ceiling) / 100}`;
  const gate = pr.nextGate?.needed && pr.nextGate?.unlocks
    ? ` · x${Number(pr.nextGate.unlocks) / 100} at ${fmtCompact(Number(BigInt(pr.nextGate.needed) / 10n ** 18n))} more burned`
    : "";
  return ceiling + gate;
}

/**
 * The Anvil : le teneur de marché du protocole. Il publie en permanence un prix
 * d'achat sur n'importe quelle machine — c'est le plancher réel de la
 * collection, et il est libellé dans une autre monnaie que le marché OpenSea.
 * Une offre suspendue doit se lire comme suspendue, jamais comme un plancher bas.
 */
function anvilBlock(a) {
  if (!a) return statBlock("The Anvil", "—", "unreadable right now");
  const spot = `${fmtInt(Math.round(a.spotPrinter))} $PRINTER`;
  const extra = [
    a.spotUsd ? fmtUsdShort(a.spotUsd) : null,
    a.shelf === null || a.shelf === undefined ? null : `${fmtInt(a.shelf)} on the shelf`,
    a.bidPaused ? "bid paused" : null,
  ].filter(Boolean).join(" · ");
  return statBlock("The Anvil", spot, extra);
}

/**
 * Une caisse : une machine du rayon tirée au sort, à prix unique. C'est le
 * seul des trois prix de l'anvil qui soit un jeu — les deux autres achètent une
 * certitude — et c'est la seule ligne que la page en garde.
 */
export function crateLine(a) {
  if (!a || a.cratePrinter === null || a.cratePrinter === undefined) return "";

  if (a.paused) {
    return `<span class="crate"><span class="crate-what">The Anvil is paused</span>` +
      `<span class="crate-note">no crate to open right now</span></span>`;
  }

  return `<a class="crate" href="${ANVIL_URL}" target="_blank" rel="noopener">` +
    `<span class="crate-what">Try your luck</span>` +
    `<span class="crate-price">${fmtInt(Math.round(a.cratePrinter))}</span>` +
    `<span class="crate-unit">$PRINTER</span>` +
    `<span class="crate-usd">${a.crateUsd ? fmtUsdShort(a.crateUsd) : "—"}</span>` +
    `<span class="crate-note">one Machine off the shelf, drawn at random &#8599;</span>` +
  `</a>`;
}

export function contextHtml(d) {
  const p = d.printer ?? {};
  const e = d.eth ?? {};
  const ink = d.ink ?? {};
  const pr = d.protocol ?? {};
  const c = d.collection ?? {};

  const chg = p.change24h === null || p.change24h === undefined
    ? ""
    : `<span class="${p.change24h >= 0 ? "up" : "down"}">${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(1)}% 24h</span>`;

  const ethExtra = e.coingecko
    ? `pool · CoinGecko ${fmtUsd(e.coingecko)} · ${e.spreadPct.toFixed(2)}% apart`
    : "pool · no second opinion";

  return [
    statBlock("$PRINTER", fmtUsd(p.usd, 5),
      [chg, `${fmtBig(p.marketCap)} mkt cap`, p.liquidityUsd ? `${fmtBig(p.liquidityUsd)} liquidity` : null]
        .filter(Boolean).join(" · ") +
      ` · <a class="buy" href="${SWAP_URL}" target="_blank" rel="noopener">buy $PRINTER &#8599;</a>`),
    statBlock("ETH", fmtUsd(e.local, 2), ethExtra),
    statBlock("Cost of ink", fmtUsd(ink.activationUsd), `${fmtInt(ink.activationPrinter)} $PRINTER · ${fmtEth(ink.activationEth)} ETH`),
    // Le floor vient de notre carnet, pas du chiffre publié : c'est le même
    // nombre que la case la moins chère du tableau, il ne peut pas la contredire.
    statBlock("Collection floor", `${fmtEth(c.floorEth)} ETH`,
      `${c.floorUsd === null || c.floorUsd === undefined ? "—" : fmtUsd(c.floorUsd, 0)} · ` +
      `${fmtBig(c.marketCapUsd)} at floor × ${fmtInt(c.machines)}`),
    statBlock("Volume traded", `${c.volumeEth === null || c.volumeEth === undefined ? "—" : c.volumeEth.toFixed(1)} ETH`,
      `${fmtBig(c.volumeUsd)} · ${fmtInt(c.sales)} sales · ` +
      `${c.volume24hEth === null || c.volume24hEth === undefined ? "—" : c.volume24hEth.toFixed(1)} ETH 24h`),
    statBlock("Inked machines", fmtInt(d.totals?.inked),
      `${fmtInt(d.totals?.dormant)} dormant · ${fmtInt(d.totals?.listed)} listed`),
    anvilBlock(d.anvil),
    statBlock("Epoch", pr.epoch ?? "—", ceilingLine(pr)),
  ].join("");
}

/**
 * Une machine en vente : sa photo, son prix, son numéro. Sans photo elle garde
 * son prix et son lien — on a perdu une image, pas une offre.
 *
 * Un seul constructeur pour les deux marchés. Il y en avait deux, et ils ont
 * dérivé : le badge de re-encrage n'existait que du côté OpenSea, si bien
 * qu'une x10 re-inkée au plafond passait pour une x10 ordinaire sur le rayon.
 */
function chip(e, { isFloor = false, ethUsd = null, anvil = false } = {}) {
  const hw = e.machine?.headwear ? ` · ${headwearLabel(e.machine.headwear)}` : "";
  const img = e.machine?.image
    ? `<img src="${esc(e.machine.image)}" alt="Machine #${e.tokenId}" loading="lazy" width="60" height="60">`
    : `<span class="noimg" aria-hidden="true"></span>`;

  const price = anvil ? fmtInt(Math.round(e.askPrinter)) : fmtEth(e.priceEth);
  const dollars = anvil ? fmtUsdShort(e.askUsd) : fmtUsdShort(usdOf(e.priceEth, ethUsd));

  // Une machine re-inkée pèse plus que ne le dit sa ligne — vrai des deux côtés.
  const reinked = e.inkMult > 1.0001 && e.weight;
  const badge = reinked ? `<span class="reink">${e.weight / 100}x</span>` : "";
  const inkStory = reinked
    ? ` · re-inked ×${e.inkMult.toFixed(2)} — ${fmtInt(e.inkPrinter)} $PRINTER burned · weight ${e.weight / 100}x`
    : "";

  // L'anvil ne peut pas vendre sous sa propre offre : la marque n'a de sens que
  // sur le carnet OpenSea.
  const under = !anvil && e.underBid ? `<span class="under">${gapLabel(e)}</span>` : "";
  const bidStory = !anvil && e.anvilBidEth
    ? ` · anvil pays ${fmtEth(e.anvilBidEth)} ETH (${fmtInt(e.anvilBidPrinter)} $PRINTER, net of the sell fee)`
    : "";
  const anvilStory = anvil
    ? ` · ${fmtInt(Math.round(e.askPrinter))} $PRINTER to pick this one` +
      (e.askEth ? ` · ≈${fmtEth(e.askEth)} ETH` : "")
    : "";

  return `<a class="chip${isFloor ? " floor" : ""}${anvil ? " anvil" : ""}${!anvil && e.underBid ? " is-under" : ""}"` +
    ` href="${anvil ? ANVIL_URL : itemUrl(e.tokenId)}" target="_blank" rel="noopener"` +
    ` title="${esc(`#${e.tokenId}${hw}${inkStory}${bidStory}${anvilStory}`)}">` +
    `<span class="thumb">${img}${badge}${under}</span>` +
    `<span class="price">${price}</span>` +
    (dollars ? `<span class="usd">${dollars}</span>` : "") +
    `<span class="tok">#${e.tokenId}</span>` +
  `</a>`;
}

/** Un écart réel mais inférieur au point de pourcentage s'arrondissait à
 *  « +0% », ce qui se lit comme « aucun gain » — l'inverse de ce qu'il dit. */
function gapLabel(e) {
  const gap = Math.round((100 * (e.anvilBidEth - e.priceEth)) / e.priceEth);
  return gap < 1 ? "&lt;1%" : `+${gap}%`;
}

export const TRAIT_TYPES = Object.freeze(["Headwear", "Body", "Eyes"]);
const FIELD = Object.freeze({ Headwear: "headwear", Body: "body", Eyes: "eyes" });

export const EMPTY_FILTER = Object.freeze({ Headwear: null, Body: null, Eyes: null });

export const filterIsActive = (filter) => TRAIT_TYPES.some((t) => filter?.[t]);

/** Une machine dont les métadonnées manquent n'a pas de traits connus. La faire
 *  passer pour correspondante afficherait dans un filtre une machine dont on
 *  ignore précisément si elle correspond. */
export function matchesFilter(machine, filter) {
  for (const type of TRAIT_TYPES) {
    const wanted = filter?.[type];
    if (!wanted) continue;
    if (!machine || machine[FIELD[type]] !== wanted) return false;
  }
  return true;
}

/**
 * Le rayon de l'anvil dans cette case : un second marché, libellé en $PRINTER.
 * Il a sa propre bande et son propre en-tête plutôt que d'être fondu dans le
 * carnet OpenSea — les fondre laisserait croire qu'une machine de l'anvil
 * s'achète comme un listing, avec la même monnaie et la même transaction.
 */
function shelfStrip(anvilEntries) {
  if (!anvilEntries?.length) return "";

  const eths = anvilEntries.map((e) => e.askEth).filter((v) => v !== null && v !== undefined);
  const range = eths.length
    ? (Math.min(...eths).toFixed(4) === Math.max(...eths).toFixed(4)
        ? `≈${fmtEth(eths[0])} ETH each`
        : `≈${fmtEth(Math.min(...eths))}–${fmtEth(Math.max(...eths))} ETH`)
    : "";

  const first = anvilEntries[0];
  // Le même mot que la moitié OpenSea : sans lui, le montant du rayon se lit
  // comme un chiffre sans nom à côté d'un floor qui, lui, se présente.
  // Ce prix inclut la prime de 10% pour désigner sa machine : l'appeler « floor
  // price » le ferait passer pour un tarif. Le prix de file achète une machine
  // aussi, juste pas celle-là, et il est annoncé à côté plutôt que tu.
  const priceLine =
    `<span class="shelf-price"><span class="label">to pick one</span>` +
    `<span class="price">${fmtInt(Math.round(first.askPrinter))}</span>` +
    ` <span class="unit">$PRINTER</span>` +
    (first.askUsd ? ` <span class="usd-big">${fmtUsdShort(first.askUsd)}</span>` : "") + `</span>`;

  const chips = anvilEntries.map((e) => chip(e, { anvil: true })).join("");

  return `<span class="shelf">` +
    `<span class="market">On the Anvil</span>` +
    priceLine +
    `<span class="depth">${fmtInt(anvilEntries.length)} on the shelf` +
      (first.queuePrinter
        ? ` · <b>${fmtInt(Math.round(first.queuePrinter))} $PRINTER</b> for whichever is next`
        : "") +
      `${range ? ` · ${range}` : ""}</span>` +
    `<span class="strip">${chips}</span>` +
  `</span>`;
}

/**
 * Une moitié de ligne : tout le carnet de cette case, du moins cher au plus
 * cher. Huit machines par défaut, le reste derrière un bouton — la case dit
 * toujours combien elle cache, pour qu'un carnet coupé ne passe jamais pour
 * un carnet complet.
 */
export function halfCell(half, side, { shown = null, step = REVEAL_STEP, limit = DEFAULT_LIMIT, key = "", filter = EMPTY_FILTER, ethUsd = null } = {}) {
  const g = `g-${side}`;
  // Sur mobile l'en-tête du tableau disparaît : la case doit alors annoncer
  // elle-même de quel côté elle parle.
  const state = side === "ink" ? "Inked" : "Dormant";
  const active = filterIsActive(filter);
  const all = half.entries ?? [];
  const kept = active ? all.filter((e) => matchesFilter(e.machine, filter)) : all;

  // Deux faits distincts, énoncés séparément. « 5 of 249 listed » se lisait
  // « 5 affichées sur 249 disponibles » et faisait chercher un bouton de
  // dépliage qui n'avait pas lieu d'être : les 249 sont les machines qui
  // existent, et les 5 en vente étaient déjà toutes là.
  const depth = active
    ? `${fmtInt(kept.length)} of ${fmtInt(all.length)} on sale match`
    : `<b>${fmtInt(half.listed)} on sale</b> · ${fmtInt(half.supply)} in this class`;

  if (!kept.length) {
    // « rien ne correspond ici » et « rien n'est en vente ici » ne sont pas la
    // même information, et les confondre ferait passer un filtre pour un marché vide.
    const why = active
      ? `<span class="absent">no machine matches here</span> · ${fmtInt(all.length)} on sale`
      : `<span class="absent">no listing</span> · ${fmtInt(half.supply)} in this class`;
    const tip = active
      ? "Nothing on sale in this class and state carries the traits you picked."
      : "Nothing is on sale in this class in this state.";
    return `<td class="${g} edge half" data-state="${state}" title="${esc(tip)}">` +
      `<span class="market">On OpenSea</span>` +
      `<span class="depth">${why}</span>` + shelfStrip(half.anvilEntries) + `</td>`;
  }

  const half_ = { ...half, entries: kept };
  return renderHalf(half_, g, { shown: shown ?? limit, step, limit, key, depth, state, ethUsd, floorLabel: active ? "cheapest match" : "floor price" });
}

function renderHalf(half, g, { shown: count, step, limit, key, depth, state, ethUsd, floorLabel }) {

  const tip = half.pelotonEth === null
    ? `${half.listed} listings — too few for a peloton, so no median is shown`
    : `peloton ${fmtEth(half.pelotonEth)} ETH · ${fmtRatio(half.listedRatio)} of this class is listed`;

  const visible = Math.max(limit, Math.min(count, half.entries.length));
  const shown = half.entries.slice(0, visible);
  const hidden = half.entries.length - shown.length;

  // Une machine re-inkée repliée dans le « + N more » est justement celle qu'on
  // voulait voir : la case dit ce qu'elle cache plutôt que de le cacher deux fois.
  const hiddenReinked = half.entries.slice(shown.length).filter((e) => e.inkMult > 1.0001 && e.weight).length;
  const note = hiddenReinked ? `, ${fmtInt(hiddenReinked)} re-inked` : "";

  // Le bouton dit exactement ce qu'un clic va faire, et combien restera après :
  // « show 40 more · 367 left » plutôt qu'un « + 367 more » qui les déverse tous.
  const next = Math.min(step, hidden);
  const label = hidden > step
    ? `show ${fmtInt(next)} more${note} · ${fmtInt(hidden)} left ▾`
    : `show the last ${fmtInt(hidden)}${note} ▾`;

  const more = hidden > 0
    ? `<button class="more" type="button" data-key="${esc(key)}" data-next="${visible + next}">${label}</button>`
    : (visible > limit
        ? `<button class="more" type="button" data-key="${esc(key)}" data-next="${limit}">▴ show fewer</button>`
        : "");

  // « under bid » ne disait rien à personne : la case l'explique une fois, en
  // toutes lettres et avec le chiffre, plutôt que de compter sur un badge de
  // deux mots pour porter une idée entière.
  const underBidEntries = half.entries.filter((e) => e.underBid);
  const underNote = underBidEntries.length
    ? `<span class="under-note">${fmtInt(underBidEntries.length)} of these sell below the Anvil's ` +
      `standing bid of ${fmtEth(underBidEntries[0].anvilBidEth)} ETH` +
      (ethUsd ? ` (${fmtUsdShort(usdOf(underBidEntries[0].anvilBidEth, ethUsd))})` : "") +
      ` — the green mark is how much more it would pay.</span>`
    : "";

  // Le floor en tête, en grand et nommé : c'est le chiffre qu'on vient chercher.
  // Sous un filtre ce n'est plus le floor de la classe mais le moins cher de la
  // sélection, et l'étiquette le dit plutôt que de laisser croire au premier.
  const floor = half.entries[0];
  const floorUsd = fmtUsdShort(usdOf(floor.priceEth, ethUsd));
  const head = `<span class="cell-floor">` +
    `<span class="label">${floorLabel}</span>` +
    `<span class="price">${fmtEth(floor.priceEth)}</span> <span class="unit">ETH</span>` +
    (floorUsd ? ` <span class="usd-big">${floorUsd}</span>` : "") + `</span>`;

  return `<td class="${g} edge half" data-state="${state}" title="${esc(tip)}">` +
    `<span class="market">On OpenSea</span>` +
    head +
    `<span class="depth">${depth}</span>` +
    underNote +
    `<span class="strip">${shown.map((e, i) => chip(e, { isFloor: i === 0, ethUsd })).join("")}</span>` +
    more +
    shelfStrip(half.anvilEntries) +
  `</td>`;
}

/** Le trait qui accorde le boost, dans la colonne du boost. Au-delà de quatre
 *  valeurs — le x1 en rassemble quinze — la liste devient du bruit que personne
 *  ne lit : on annonce le compte et on garde la liste dans l'infobulle. */
function boostTraits(legend, classValue) {
  const row = legend?.byClass?.find((c) => c.classValue === classValue);
  const names = row?.headwear ?? [];
  if (!names.length) return "";
  const full = names.map(headwearLabel).join(", ");
  const shown = names.length <= 4 ? full : `${names.length} headwears`;
  return `<span class="grants" title="${esc(full)}">${esc(shown)}</span>`;
}

export function rowsHtml(d, { expanded = new Map(), limit = DEFAULT_LIMIT, step = REVEAL_STEP, filter = EMPTY_FILTER } = {}) {
  const ethUsd = d.eth?.usd ?? null;
  return d.rows.map((r) => {
    const census = r.chainCount === r.docCount
      ? `<span class="census">${fmtInt(r.chainCount)} machines</span>`
      : `<span class="census mismatch" title="The chain returned ${r.chainCount}; the documentation says ${r.docCount}.">${fmtInt(r.chainCount)} ≠ ${fmtInt(r.docCount)}</span>`;

    const inkKey = cellKey(r.classValue, "ink");
    const dorKey = cellKey(r.classValue, "dormant");

    return `<tr>` +
      `<td class="cls-cell"><span class="cls">${r.classLabel}</span>${boostTraits(d.legend, r.classValue)}${census}</td>` +
      halfCell(r.inked,   "ink",     { shown: expanded.get(inkKey) ?? limit, step, limit, key: inkKey, filter, ethUsd }) +
      halfCell(r.dormant, "dormant", { shown: expanded.get(dorKey) ?? limit, step, limit, key: dorKey, filter, ethUsd }) +
    `</tr>`;
  }).join("");
}

/**
 * Les trois menus de filtre. Chaque valeur annonce ce qui est en vente et ce qui
 * existe : savoir avant de cliquer qu'un trait n'a aucune machine sur le marché
 * évite d'aller chercher un tableau vide.
 */
export function filterBarHtml(traitFilters, filter) {
  if (!traitFilters) return "";

  return TRAIT_TYPES.map((type) => {
    const values = traitFilters[type] ?? [];
    const options = values.map((v) => {
      const ticker = v.ticker ? ` — ${v.ticker}` : "";
      const chosen = filter?.[type] === v.value ? " selected" : "";
      return `<option value="${esc(v.value)}"${chosen}>${esc(v.value)}${ticker} (${fmtInt(v.listed)} on sale of ${fmtInt(v.total)})</option>`;
    }).join("");
    return `<label class="fl"><span class="label">${type}</span>` +
      `<select data-trait="${type}"><option value="">any</option>${options}</select></label>`;
  }).join("");
}

/** Ce que le filtre laisse passer, sur l'ensemble du carnet. Silencieux tant
 *  qu'aucun filtre n'est posé : un compteur permanent serait du bruit. */
export function filterSummary(d, filter) {
  if (!filterIsActive(filter)) return null;

  let matched = 0;
  let total = 0;
  for (const r of d.rows) {
    for (const cell of [r.inked, r.dormant]) {
      for (const e of cell.entries ?? []) {
        total++;
        if (matchesFilter(e.machine, filter)) matched++;
      }
    }
  }
  const chosen = esc(TRAIT_TYPES.map((t) => filter[t]).filter(Boolean).join(" + "));
  return `${chosen} — ${fmtInt(matched)} of ${fmtInt(total)} listed machines match.`;
}

/** Quel couvre-chef trahit quelle classe. Dérivé des données au démarrage, pas
 *  écrit en dur : si un couvre-chef devenait ambigu, il est annoncé plutôt que
 *  rangé de force dans une classe. */
export function legendHtml(legend) {
  if (!legend) return "";

  const rows = legend.byClass.map((c) => {
    const names = c.headwear.length
      ? c.headwear.map((h) => `<span class="hw">${esc(headwearLabel(h))}</span>`).join(" ")
      : `<span class="absent">nothing observed</span>`;
    return `<div class="lg-row"><span class="lg-class">${esc(c.classLabel)}</span>` +
      `<span class="lg-hw">${names}</span>` +
      `<span class="lg-n">${fmtInt(c.count)}</span></div>`;
  }).join("");

  const warn = legend.ambiguous?.length
    ? `<p class="lg-warn">` + legend.ambiguous.map((a) =>
        `<b>${esc(a.headwear)}</b> appears in ${esc(a.classes.join(" and "))} — it is filed under neither.`
      ).join(" ") + `</p>`
    : "";

  return `<div class="lg">${rows}</div>${warn}`;
}

/**
 * L'âge du snapshot, mesuré entre deux horloges du serveur : `at`, posé au
 * moment du calcul, et l'heure de la réponse. L'horloge du visiteur n'entre pas
 * dans le calcul — la sienne peut être fausse de plusieurs heures et le bandeau
 * annoncerait alors une péremption qui n'existe pas.
 */
export function freshness({ at, staleAfterMs }, serverNow) {
  if (at === null || at === undefined) return { ageMs: null, stale: true };
  const ageMs = Math.max(0, serverNow - at);
  return { ageMs, stale: ageMs > (staleAfterMs ?? Infinity) };
}

/** Le message de bandeau, ou null quand tout va bien. */
export function bannerMessage(v) {
  // Une cause connue passe devant le récit du démarrage : dire « still reading
  // the chain » quand la vraie cause est un 401 envoie chercher au mauvais endroit.
  if (!v.data) {
    return v.lastError
      ? `No data yet — the last sweep failed: ${v.lastError}`
      : "No data yet — the first sweep is still running.";
  }
  if (v.lastError || v.stale) {
    const age = Math.round(v.ageMs / 1000);
    const shown = age < 90 ? `${age}s` : `${Math.round(age / 60)}m`;
    return `Data from ${shown} ago — last error: ${v.lastError ?? "none, the sweep is just slow"}`;
  }
  return null;
}

// ---- câblage DOM ----

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const rowsEl = $("rows");

  // Les cases dépliées et le filtre vivent ici plutôt que dans le DOM : la table
  // est reconstruite toutes les quinze secondes, et ni une case ouverte ni un
  // filtre posé ne doivent survivre à ça par accident.
  const expanded = new Map();
  const filter = { ...EMPTY_FILTER };
  const filtersEl = $("filters");
  const summaryEl = $("filter-summary");
  let lastData = null;
  let painted = "";
  let barBuilt = false;

  const paint = () => {
    if (!lastData) return;
    const html = rowsHtml(lastData, { expanded, filter });
    if (html !== painted) {
      rowsEl.innerHTML = html;
      painted = html;
    }
    const summary = filterSummary(lastData, filter);
    summaryEl.innerHTML = summary
      ? `${summary} <button class="clear" type="button">clear</button>`
      : "";
  };

  /** La barre est construite une fois. Les traits sont scellés, donc la liste
   *  des valeurs ne bouge jamais ; seuls les compteurs bougent, et on les met à
   *  jour sur place pour ne pas effacer la sélection en cours. */
  const paintFilters = (traitFilters) => {
    if (!traitFilters) return;
    if (!barBuilt) {
      filtersEl.innerHTML = filterBarHtml(traitFilters, filter);
      barBuilt = true;
      return;
    }
    for (const select of filtersEl.querySelectorAll("select")) {
      const rows = new Map((traitFilters[select.dataset.trait] ?? []).map((v) => [v.value, v]));
      for (const option of select.options) {
        const v = rows.get(option.value);
        if (v) option.textContent = `${v.value}${v.ticker ? ` — ${v.ticker}` : ""} (${v.listed} on sale of ${v.total})`;
      }
    }
  };

  filtersEl.addEventListener("change", (e) => {
    const select = e.target.closest("select[data-trait]");
    if (!select) return;
    filter[select.dataset.trait] = select.value || null;
    paint();
  });

  summaryEl.addEventListener("click", (e) => {
    if (!e.target.closest(".clear")) return;
    for (const type of TRAIT_TYPES) filter[type] = null;
    for (const select of filtersEl.querySelectorAll("select")) select.value = "";
    paint();
  });

  rowsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".more");
    if (!btn) return;
    const next = Number(btn.dataset.next);
    if (Number.isFinite(next)) expanded.set(btn.dataset.key, next);
    paint();
  });

  const showBanner = (msg) => {
    const el = $("banner");
    if (!msg) { el.classList.remove("on"); el.textContent = ""; return; }
    el.textContent = msg;
    el.classList.add("on");
  };

  const refresh = async () => {
    let v;
    try {
      const res = await fetch("/api/snapshot");
      const body = await res.json();
      // L'en-tête Date vient du serveur, comme `at` : les comparer est sûr.
      const serverNow = Date.parse(res.headers.get("date")) || Date.now();
      v = { ...body, ...freshness(body, serverNow) };
    } catch {
      showBanner("Cannot reach the service. The numbers below are the last ones it served.");
      return;
    }

    showBanner(bannerMessage(v));
    if (!v.data) return;

    lastData = v.data;
    $("context").innerHTML = contextHtml(v.data);
    paintFilters(v.data.traitFilters);
    $("queue").innerHTML = crateLine(v.data.anvil);
    paint();
    $("legend").innerHTML = legendHtml(v.data.legend);
  };

  refresh();
  setInterval(refresh, 15000);
}

// Rendu du dashboard. Séparé du HTML pour être testable hors navigateur :
// tout ce qui fabrique du balisage est une fonction pure qui rend une chaîne,
// et le seul câblage au DOM est en bas de fichier, derrière un garde.

export const fmtEth   = (v) => v === null || v === undefined ? "—" : v.toFixed(4);
export const fmtRatio = (v) => v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";
export const fmtUsd   = (v, d = 2) => v === null || v === undefined ? "—" : "$" + v.toFixed(d);
export const fmtInt   = (v) => v === null || v === undefined ? "—" : v.toLocaleString("en-US");

const MACHINES = "0xb509e195bcb3e4461e235ff152c68d66915f67b5";
export const itemUrl = (id) => `https://opensea.io/assets/robinhood/${MACHINES}/${id}`;

/** Combien de machines une case montre avant de proposer le reste. */
export const DEFAULT_LIMIT = 8;

export const cellKey = (classValue, side) => `${classValue}:${side}`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** "None" est une vraie valeur de couvre-chef, et c'est la classe x6. Écrite
 *  telle quelle sur la page, elle se lirait comme une donnée manquante. */
const headwearLabel = (hw) => hw === "None" ? "no headwear at all" : hw;

function statBlock(label, value, extra, isInk) {
  return `<div class="stat${isInk ? " is-ink" : ""}">` +
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
        .filter(Boolean).join(" · ")),
    statBlock("ETH", fmtUsd(e.local, 2), ethExtra),
    statBlock("Cost of ink", fmtUsd(ink.activationUsd), `${fmtInt(ink.activationPrinter)} $PRINTER · ${fmtEth(ink.activationEth)} ETH`, true),
    // Le floor vient de notre carnet, pas du chiffre publié : c'est le même
    // nombre que la case la moins chère du tableau, il ne peut pas la contredire.
    statBlock("Collection floor", `${fmtEth(c.floorEth)} ETH`,
      `${c.floorUsd === null || c.floorUsd === undefined ? "—" : fmtUsd(c.floorUsd, 0)} · ` +
      `${fmtBig(c.marketCapUsd)} at floor × ${fmtInt(c.machines)}`),
    statBlock("Volume traded", `${c.volumeEth === null || c.volumeEth === undefined ? "—" : c.volumeEth.toFixed(1)} ETH`,
      `${fmtBig(c.volumeUsd)} · ${fmtInt(c.sales)} sales · ` +
      `${c.volume24hEth === null || c.volume24hEth === undefined ? "—" : c.volume24hEth.toFixed(1)} ETH 24h`),
    statBlock("Machines", `${fmtInt(d.totals?.inked)} inked`, `${fmtInt(d.totals?.dormant)} dormant · ${fmtInt(d.totals?.listed)} listed`),
    statBlock("Epoch", pr.epoch ?? "—", pr.ceiling ? `ceiling ${Number(pr.ceiling) / 100}x` : "ceiling unreadable"),
  ].join("");
}

/** Une machine en vente : sa photo, son prix, son numéro. Sans photo elle garde
 *  son prix et son lien — on a perdu une image, pas une offre. */
function chip(e, isFloor) {
  const hw = e.machine?.headwear ? ` · ${headwearLabel(e.machine.headwear)}` : "";
  const img = e.machine?.image
    ? `<img src="${esc(e.machine.image)}" alt="Machine #${e.tokenId}" loading="lazy" width="40" height="40">`
    : `<span class="noimg" aria-hidden="true"></span>`;
  return `<a class="chip${isFloor ? " floor" : ""}" href="${itemUrl(e.tokenId)}" target="_blank" rel="noopener"` +
    ` title="${esc(`#${e.tokenId}${hw}`)}">` +
    img +
    `<span class="price">${fmtEth(e.priceEth)}</span>` +
    `<span class="tok">#${e.tokenId}</span>` +
  `</a>`;
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
 * Une moitié de ligne : tout le carnet de cette case, du moins cher au plus
 * cher. Huit machines par défaut, le reste derrière un bouton — la case dit
 * toujours combien elle cache, pour qu'un carnet coupé ne passe jamais pour
 * un carnet complet.
 */
export function halfCell(half, side, { expanded = false, limit = DEFAULT_LIMIT, key = "", filter = EMPTY_FILTER } = {}) {
  const g = `g-${side}`;
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
    return `<td class="${g} edge half" title="${esc(tip)}"><span class="depth">${why}</span></td>`;
  }

  const half_ = { ...half, entries: kept };
  return renderHalf(half_, g, { expanded, limit, key, depth, floorLabel: active ? "cheapest match" : "floor price" });
}

function renderHalf(half, g, { expanded, limit, key, depth, floorLabel }) {

  const tip = half.pelotonEth === null
    ? `${half.listed} listings — too few for a peloton, so no median is shown`
    : `peloton ${fmtEth(half.pelotonEth)} ETH · ${fmtRatio(half.listedRatio)} of this class is listed`;

  const shown = expanded ? half.entries : half.entries.slice(0, limit);
  const hidden = half.entries.length - shown.length;

  const more = expanded
    ? `<button class="more" type="button" data-key="${esc(key)}">▴ show fewer</button>`
    : (hidden > 0
        ? `<button class="more" type="button" data-key="${esc(key)}">+ ${fmtInt(hidden)} more ▾</button>`
        : "");

  // Le floor en tête, en grand et nommé : c'est le chiffre qu'on vient chercher.
  // Sous un filtre ce n'est plus le floor de la classe mais le moins cher de la
  // sélection, et l'étiquette le dit plutôt que de laisser croire au premier.
  const floor = half.entries[0];
  const head = `<span class="cell-floor">` +
    `<span class="label">${floorLabel}</span>` +
    `<span class="price">${fmtEth(floor.priceEth)}</span> <span class="unit">ETH</span></span>`;

  return `<td class="${g} edge half" title="${esc(tip)}">` +
    head +
    `<span class="depth">${depth}</span>` +
    `<span class="strip">${shown.map((e, i) => chip(e, i === 0)).join("")}</span>` +
    more +
  `</td>`;
}

export function rowsHtml(d, { expanded = new Set(), limit = DEFAULT_LIMIT, filter = EMPTY_FILTER } = {}) {
  return d.rows.map((r) => {
    const census = r.chainCount === r.docCount
      ? `<span class="census">${fmtInt(r.chainCount)} machines</span>`
      : `<span class="census mismatch" title="The chain returned ${r.chainCount}; the documentation says ${r.docCount}.">${fmtInt(r.chainCount)} ≠ ${fmtInt(r.docCount)}</span>`;

    const inkKey = cellKey(r.classValue, "ink");
    const dorKey = cellKey(r.classValue, "dormant");

    return `<tr>` +
      `<td class="cls-cell"><span class="cls">${r.classLabel}</span>${census}</td>` +
      halfCell(r.inked,   "ink",     { expanded: expanded.has(inkKey), limit, key: inkKey, filter }) +
      halfCell(r.dormant, "dormant", { expanded: expanded.has(dorKey), limit, key: dorKey, filter }) +
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
  const chosen = TRAIT_TYPES.map((t) => filter[t]).filter(Boolean).join(" + ");
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

export function bookLine(d) {
  const sk = d.book?.skipped ?? {};
  return `Book read to exhaustion: <b>${fmtInt(d.book?.listed)}</b> distinct Machines listed across <b>${fmtInt(d.book?.pages)}</b> pages` +
    (sk.foreignCurrency || sk.unreadable
      ? `, ${fmtInt(sk.foreignCurrency)} priced in another currency and ${fmtInt(sk.unreadable)} unreadable.`
      : `, none skipped.`);
}

export function excludedLine(d) {
  const ex = d.excluded ?? {};
  if (ex.unknownRarity || ex.unknownInk || ex.listingsOffGrid) {
    return `Excluded from every count: <b>${fmtInt(ex.unknownRarity)}</b> with an unreadable rarity, ` +
      `<b>${fmtInt(ex.unknownInk)}</b> whose ink was never read, ` +
      `<b>${fmtInt(ex.listingsOffGrid)}</b> listings that could not be placed. An unread value is never guessed.`;
  }
  return `Every one of the 10,000 Machines was read: no rarity or ink value had to be excluded.`;
}

export function publishedLine(d) {
  const c = d.collection ?? {};
  return `OpenSea publishes a collection floor of <b>${c.publishedFloor === null || c.publishedFloor === undefined ? "—" : c.publishedFloor.toFixed(4)} ${c.publishedFloorSymbol ?? ""}</b>. ` +
    `It is shown for comparison and <b>enters no computation on this page</b> — on this chain it has been measured at ten times the real book.`;
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
  const expanded = new Set();
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
    const key = btn.dataset.key;
    if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
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
      v = await res.json();
    } catch {
      showBanner("Cannot reach the service. The numbers below are the last ones it served.");
      return;
    }

    showBanner(bannerMessage(v));
    if (!v.data) return;

    lastData = v.data;
    $("context").innerHTML = contextHtml(v.data);
    paintFilters(v.data.traitFilters);
    paint();
    $("legend").innerHTML = legendHtml(v.data.legend);
    $("book-line").innerHTML = bookLine(v.data);
    $("excluded-line").innerHTML = excludedLine(v.data);
    $("published-line").innerHTML = publishedLine(v.data);
  };

  refresh();
  setInterval(refresh, 15000);
}

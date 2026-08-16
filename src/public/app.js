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

export function contextHtml(d) {
  const p = d.printer ?? {};
  const e = d.eth ?? {};
  const ink = d.ink ?? {};
  const pr = d.protocol ?? {};

  const chg = p.change24h === null || p.change24h === undefined
    ? ""
    : `<span class="${p.change24h >= 0 ? "up" : "down"}">${p.change24h >= 0 ? "+" : ""}${p.change24h.toFixed(1)}% 24h</span>`;

  const ethExtra = e.coingecko
    ? `pool · CoinGecko ${fmtUsd(e.coingecko)} · ${e.spreadPct.toFixed(2)}% apart`
    : "pool · no second opinion";

  return [
    statBlock("$PRINTER", fmtUsd(p.usd, 5), chg + (p.liquidityUsd ? ` · ${fmtUsd(p.liquidityUsd, 0)} liquidity` : "")),
    statBlock("ETH", fmtUsd(e.local, 2), ethExtra),
    statBlock("Cost of ink", fmtUsd(ink.activationUsd), `${fmtInt(ink.activationPrinter)} $PRINTER · ${fmtEth(ink.activationEth)} ETH`, true),
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

/**
 * Une moitié de ligne : tout le carnet de cette case, du moins cher au plus
 * cher. Huit machines par défaut, le reste derrière un bouton — la case dit
 * toujours combien elle cache, pour qu'un carnet coupé ne passe jamais pour
 * un carnet complet.
 */
export function halfCell(half, side, { expanded = false, limit = DEFAULT_LIMIT, key = "" } = {}) {
  const g = `g-${side}`;
  const depth = `${fmtInt(half.listed)} of ${fmtInt(half.supply)} listed`;

  if (!half.entries?.length) {
    return `<td class="${g} edge half" title="Nothing is on sale in this class in this state.">` +
      `<span class="depth"><span class="absent">no listing</span> · ${depth}</span></td>`;
  }

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

  return `<td class="${g} edge half" title="${esc(tip)}">` +
    `<span class="depth">${depth}</span>` +
    `<span class="strip">${shown.map((e, i) => chip(e, i === 0)).join("")}</span>` +
    more +
  `</td>`;
}

export function rowsHtml(d, { expanded = new Set(), limit = DEFAULT_LIMIT } = {}) {
  return d.rows.map((r) => {
    const census = r.chainCount === r.docCount
      ? `<span class="census">${fmtInt(r.chainCount)} machines</span>`
      : `<span class="census mismatch" title="The chain returned ${r.chainCount}; the documentation says ${r.docCount}.">${fmtInt(r.chainCount)} ≠ ${fmtInt(r.docCount)}</span>`;

    const inkKey = cellKey(r.classValue, "ink");
    const dorKey = cellKey(r.classValue, "dormant");

    return `<tr>` +
      `<td class="cls-cell"><span class="cls">${r.classLabel}</span>${census}</td>` +
      halfCell(r.inked,   "ink",     { expanded: expanded.has(inkKey), limit, key: inkKey }) +
      halfCell(r.dormant, "dormant", { expanded: expanded.has(dorKey), limit, key: dorKey }) +
    `</tr>`;
  }).join("");
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
  const pf = d.publishedFloor ?? {};
  return `OpenSea publishes a collection floor of <b>${pf.floor === null || pf.floor === undefined ? "—" : pf.floor.toFixed(4)} ${pf.symbol ?? ""}</b>. ` +
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

  // Les cases dépliées vivent ici plutôt que dans le DOM : la table est
  // reconstruite toutes les quinze secondes, et une case ouverte doit le rester.
  const expanded = new Set();
  let lastData = null;
  let painted = "";

  const paint = () => {
    if (!lastData) return;
    const html = rowsHtml(lastData, { expanded });
    if (html === painted) return;
    rowsEl.innerHTML = html;
    painted = html;
  };

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
    paint();
    $("legend").innerHTML = legendHtml(v.data.legend);
    $("book-line").innerHTML = bookLine(v.data);
    $("excluded-line").innerHTML = excludedLine(v.data);
    $("published-line").innerHTML = publishedLine(v.data);
  };

  refresh();
  setInterval(refresh, 15000);
}

// Rendu du dashboard. Séparé du HTML pour être testable hors navigateur :
// tout ce qui fabrique du balisage est une fonction pure qui rend une chaîne,
// et le seul câblage au DOM est en bas de fichier, derrière un garde.

export const fmtEth    = (v) => v === null || v === undefined ? "—" : v.toFixed(4);
export const fmtSpread = (v) => v === null || v === undefined ? "—" : (v >= 0 ? "+" : "") + v.toFixed(4);
export const fmtRatio  = (v) => v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";
export const fmtUsd    = (v, d = 2) => v === null || v === undefined ? "—" : "$" + v.toFixed(d);
export const fmtInt    = (v) => v === null || v === undefined ? "—" : v.toLocaleString("en-US");

const MACHINES = "0xb509e195bcb3e4461e235ff152c68d66915f67b5";
export const itemUrl = (id) => `https://opensea.io/assets/robinhood/${MACHINES}/${id}`;

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

/** Une moitié de ligne, dans une seule cellule : la photo de la machine qui fixe
 *  le floor, son prix, son couvre-chef, et la profondeur en toutes lettres.
 *  Le peloton et le ratio exact partent dans l'infobulle — toujours lisibles,
 *  mais ils ne pèsent plus sur l'œil. */
export function halfCell(half, side) {
  const g = `g-${side}`;
  const depth = `${fmtInt(half.listed)} of ${fmtInt(half.supply)} listed`;

  if (half.listed === 0) {
    return `<td class="${g} edge half" title="Nothing is on sale in this class in this state.">` +
      `<span class="half-body"><span class="absent">no listing</span>` +
      `<span class="depth">${depth}</span></span></td>`;
  }

  const tip = half.pelotonEth === null
    ? `${half.listed} listings — too few for a peloton, so no median is shown`
    : `peloton ${fmtEth(half.pelotonEth)} ETH · ${fmtRatio(half.listedRatio)} of this class is listed`;

  const thumb = half.machine?.image
    ? `<a class="thumb" href="${itemUrl(half.floorTokenId)}" target="_blank" rel="noopener">` +
      `<img src="${esc(half.machine.image)}" alt="Machine #${half.floorTokenId}" loading="lazy" width="46" height="46"></a>`
    : "";

  const hw = half.machine?.headwear ? ` · ${esc(headwearLabel(half.machine.headwear))}` : "";

  return `<td class="${g} edge half" title="${esc(tip)}">` +
    thumb +
    `<span class="half-body">` +
      `<span class="price">${fmtEth(half.floorEth)}</span> <span class="unit">ETH</span>` +
      `<span class="meta"><a href="${itemUrl(half.floorTokenId)}" target="_blank" rel="noopener">#${half.floorTokenId}</a>${hw}</span>` +
      `<span class="depth">${depth}${half.pelotonEth === null ? ` · <span class="absent">no peloton</span>` : ""}</span>` +
    `</span></td>`;
}

/** Le verdict en toutes lettres avant le verdict en chiffres. Un écart de
 *  -0.5000 ne dit rien tant qu'on ne sait pas ce que coûte l'encre. */
export function activationVerdict(spreadEth, inkEth) {
  if (spreadEth === null || spreadEth === undefined) {
    return { tone: "none", headline: "Only one side of this class has a floor.", detail: "There is nothing to subtract." };
  }
  if (inkEth === null || inkEth === undefined) {
    return { tone: "unknown", headline: `The gap is ${fmtSpread(spreadEth)} ETH.`, detail: "The cost of ink could not be read, so there is nothing to measure it against." };
  }
  const against = `${fmtSpread(spreadEth)} ETH against ${fmtEth(inkEth)} ETH of burned $PRINTER`;
  if (spreadEth < 0) {
    return { tone: "loss", headline: "An activated machine sells for less than a dormant one.", detail: against };
  }
  if (spreadEth < inkEth) {
    return { tone: "short", headline: "The market pays less than the ink costs.", detail: against };
  }
  return { tone: "paid", headline: `The market pays ${(spreadEth / inkEth).toFixed(1)}× the ink.`, detail: against };
}

/** L'échelle de la jauge tient le plus grand écart et le coût de l'encre, pour
 *  que le repère soit toujours dans le cadre. */
export function gaugeScale(rows, inkEth) {
  const magnitudes = rows.map((r) => Math.abs(r.spreadEth ?? 0));
  if (inkEth) magnitudes.push(Math.abs(inkEth));
  return Math.max(0.01, ...magnitudes) * 1.15;
}

export function gaugeCell(row, inkEth, scale) {
  const v = activationVerdict(row.spreadEth, inkEth);
  const head = `<span class="verdict v-${v.tone}">${esc(v.headline)}</span><span class="verdict-detail">${esc(v.detail)}</span>`;

  if (v.tone === "none" || v.tone === "unknown") {
    return `<td class="edge act">${head}</td>`;
  }

  const s = row.spreadEth;
  const clamp = (x) => Math.max(0, Math.min(100, x));
  const pct = (x) => clamp(50 + (x / scale) * 50);
  const zero = 50;
  const end = pct(s);
  const left = Math.min(zero, end);
  const width = Math.abs(end - zero);
  const barClass = s < 0 ? "neg" : (v.tone === "short" ? "short" : "pos");

  return `<td class="edge act">` + head +
    `<span class="gauge">` +
      `<span class="axis"></span><span class="zero" style="left:${zero}%"></span>` +
      `<span class="bar ${barClass}" style="left:${left}%;width:${width}%"></span>` +
      `<span class="tick" style="left:${pct(inkEth)}%" title="what ink costs"></span>` +
    `</span></td>`;
}

export function rowsHtml(d) {
  const inkEth = d.ink?.activationEth ?? null;
  const scale = gaugeScale(d.rows, inkEth);
  return d.rows.map((r) => {
    const census = r.chainCount === r.docCount
      ? `<span class="census">${fmtInt(r.chainCount)} machines</span>`
      : `<span class="census mismatch" title="The chain returned ${r.chainCount}; the documentation says ${r.docCount}.">${fmtInt(r.chainCount)} ≠ ${fmtInt(r.docCount)}</span>`;
    return `<tr>` +
      `<td class="cls-cell"><span class="cls">${r.classLabel}</span>${census}</td>` +
      halfCell(r.inked, "ink") +
      halfCell(r.dormant, "dormant") +
      gaugeCell(r, inkEth, scale) +
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

  const showBanner = (msg) => {
    const el = $("banner");
    if (!msg) { el.classList.remove("on"); el.textContent = ""; return; }
    el.textContent = msg;
    el.classList.add("on");
  };

  let previousRows = "";

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

    $("context").innerHTML = contextHtml(v.data);

    // L'encre qui frappe le papier : quand une ligne bouge, elle clignote une
    // fois. Sur un instrument en direct, ça dit ce qui a changé sans le guetter.
    const html = rowsHtml(v.data);
    if (html !== previousRows) {
      $("rows").innerHTML = html;
      if (previousRows) {
        for (const tr of $("rows").children) {
          tr.classList.add("struck");
          tr.addEventListener("animationend", () => tr.classList.remove("struck"), { once: true });
        }
      }
      previousRows = html;
    }

    $("legend").innerHTML = legendHtml(v.data.legend);
    $("book-line").innerHTML = bookLine(v.data);
    $("excluded-line").innerHTML = excludedLine(v.data);
    $("published-line").innerHTML = publishedLine(v.data);
  };

  refresh();
  setInterval(refresh, 15000);
}

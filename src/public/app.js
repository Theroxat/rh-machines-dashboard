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

/** Une moitié de ligne. Zéro listing ne rend jamais un prix : il rend son absence. */
export function halfCells(half, side) {
  const g = `g-${side}`;
  if (half.listed === 0) {
    return `<td class="${g} edge absent">no listing</td>` +
           `<td class="${g} absent">—</td>` +
           `<td class="${g}">0</td>` +
           `<td class="${g}">${fmtInt(half.supply)}</td>` +
           `<td class="${g} absent">${fmtRatio(half.listedRatio)}</td>`;
  }
  const floor = `<span class="price">${fmtEth(half.floorEth)}</span>` +
    `<span class="tok"><a href="${itemUrl(half.floorTokenId)}" target="_blank" rel="noopener">#${half.floorTokenId}</a></span>`;
  const peloton = half.pelotonEth === null
    ? `<span class="absent" title="Only ${half.listed} listings. A median over fewer than 5 would not be a median.">no peloton</span>`
    : `<span class="price">${fmtEth(half.pelotonEth)}</span>`;
  return `<td class="${g} edge">${floor}</td>` +
         `<td class="${g}">${peloton}</td>` +
         `<td class="${g}">${fmtInt(half.listed)}</td>` +
         `<td class="${g}">${fmtInt(half.supply)}</td>` +
         `<td class="${g}">${fmtRatio(half.listedRatio)}</td>`;
}

/** L'échelle de la jauge tient le plus grand écart et le coût de l'encre, pour
 *  que le repère soit toujours dans le cadre. */
export function gaugeScale(rows, inkEth) {
  const magnitudes = rows.map((r) => Math.abs(r.spreadEth ?? 0));
  if (inkEth) magnitudes.push(Math.abs(inkEth));
  return Math.max(0.01, ...magnitudes) * 1.15;
}

export function gaugeCell(row, inkEth, scale) {
  const s = row.spreadEth;
  if (s === null || s === undefined) {
    return `<td class="edge gauge-cell absent" title="One half of this class has no floor, so there is nothing to subtract.">—</td>`;
  }
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const pct = (v) => clamp(50 + (v / scale) * 50);
  const zero = 50;
  const end = pct(s);
  const left = Math.min(zero, end);
  const width = Math.abs(end - zero);

  const below = inkEth !== null && inkEth !== undefined && s < inkEth;
  const barClass = s < 0 ? "neg" : (below ? "short" : "pos");
  const tick = inkEth === null || inkEth === undefined ? "" : `<span class="tick" style="left:${pct(inkEth)}%"></span>`;

  const title = below
    ? `Activation adds ${fmtEth(inkEth)} ETH of burned $PRINTER, but the market pays ${fmtSpread(s)} ETH for it.`
    : `The market pays ${fmtSpread(s)} ETH for activation, which costs ${fmtEth(inkEth)} ETH.`;

  return `<td class="edge gauge-cell" title="${esc(title)}">` +
    `<span class="spread-v ${s < 0 ? "neg" : "pos"}">${fmtSpread(s)}</span>` +
    `<span class="gauge">` +
      `<span class="axis"></span><span class="zero" style="left:${zero}%"></span>` +
      `<span class="bar ${barClass}" style="left:${left}%;width:${width}%"></span>` +
      tick +
    `</span>` +
  `</td>`;
}

export function rowsHtml(d) {
  const inkEth = d.ink?.activationEth ?? null;
  const scale = gaugeScale(d.rows, inkEth);
  return d.rows.map((r) => {
    const census = r.chainCount === r.docCount
      ? `<span class="census">${fmtInt(r.chainCount)}</span>`
      : `<span class="census mismatch" title="The chain returned ${r.chainCount}; the documentation says ${r.docCount}.">${fmtInt(r.chainCount)} ≠ ${fmtInt(r.docCount)}</span>`;
    return `<tr>` +
      `<td><span class="cls">${r.classLabel}</span> ${census}</td>` +
      halfCells(r.inked, "ink") +
      halfCells(r.dormant, "dormant") +
      gaugeCell(r, inkEth, scale) +
    `</tr>`;
  }).join("");
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

/** Le message de bandeau, ou null quand tout va bien. Séparé du DOM pour que la
 *  règle « périmé ou en erreur => on le dit » soit vérifiable. */
export function bannerMessage(v) {
  // Une erreur connue passe devant le récit du démarrage : dire « still reading
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

    $("book-line").innerHTML = bookLine(v.data);
    $("excluded-line").innerHTML = excludedLine(v.data);
    $("published-line").innerHTML = publishedLine(v.data);
  };

  refresh();
  setInterval(refresh, 15000);
}

// La boutique.
//
// Tout ce qui fabrique du balisage est une fonction pure qui rend une chaîne :
// ça se teste hors navigateur, et le seul câblage au DOM est en bas de fichier,
// derrière un garde.
//
// La règle de couleur, et il n'y en a qu'une : LE VERT N'EXISTE QUE SUR UNE
// MACHINE QUI IMPRIME. Une dormante est entièrement grise. C'est la seule
// légende de la page, et elle n'a pas besoin d'être écrite.

export const fmtEth   = (v) => v === null || v === undefined ? "—" : v.toFixed(4);
export const fmtRatio = (v) => v === null || v === undefined ? "—" : (v * 100).toFixed(1) + "%";
/** Une part minuscule arrondie à la décimale devient un mensonge : 0,051% et
 *  0,14% s'écrivaient tous deux « 0.1% », soit un facteur trois effacé. */
export const fmtShare = (v) =>
  v === null || v === undefined ? "—"
    : v >= 0.01 ? (v * 100).toFixed(1) + "%"
    : (v * 100).toFixed(3) + "%";
export const fmtUsd   = (v, d = 2) => v === null || v === undefined ? "—" : "$" + v.toFixed(d);
export const fmtInt   = (v) => v === null || v === undefined ? "—" : v.toLocaleString("en-US");

/** Le prix en dollars à côté du prix en ETH : tout le monde sait ce que vaut un
 *  dollar, personne ne convertit 0.1050 ETH de tête. Sans taux lu, on n'invente
 *  pas de conversion — on laisse l'ETH seul plutôt que d'afficher un faux. */
export const usdOf = (eth, ethUsd) =>
  eth === null || eth === undefined || !ethUsd ? null : eth * ethUsd;
/**
 * Un poids, écrit court.
 *
 * Sur l'ancien contrat tout le monde plafonnait au même endroit et les poids
 * tombaient ronds. Ils ne le sont plus : une machine qui a brûlé 16 750 au lieu
 * de 17 000 pèse 3,96x, et « x2→3.96x » dans un badge de soixante-dix-huit
 * pixels se lit « 96x ». On tronque à la décimale — jamais on n'arrondit vers
 * le haut, une machine ne doit pas s'annoncer au poids d'une classe qu'elle
 * n'a pas atteinte. Le chiffre exact reste dans l'infobulle et le panneau.
 */
/** Deux décimales, mais seulement si elles disent quelque chose : « 4× » pour
 *  une machine au plafond, « 3.94× » pour celle qui s'en approche. */
export const fmtExact = (n) => String(Number(Number(n).toFixed(2)));

/** Une quantité de jeton. Les actions arrivent par fractions minuscules —
 *  0,03705 NVDA — et deux décimales les écraseraient toutes à « 0.04 ». On
 *  garde quatre chiffres significatifs, ce qui distingue une machine chargée
 *  d'une machine à peine servie. */
export const fmtAmount = (n) => String(Number(Number(n).toPrecision(4)));

/** Un montant rond, avec ses milliers. « $1344 » se lit moins bien que
 *  « $1,344 », et c'est le chiffre de tête d'un portefeuille. */
export const fmtUsdRound = (v) =>
  v === null || v === undefined ? "—" : `$${fmtInt(Math.round(v))}`;

/** Un gain de quatre dixièmes de centime s'écrivait « $0.00 », ce qui fait
 *  passer un conseil pour inutile. Sous le centime, on le dit en toutes lettres
 *  plutôt que de l'arrondir à rien. */
export const fmtTiny = (v) =>
  v === null || v === undefined ? "—"
    : Math.abs(v) < 0.01 ? "less than a cent"
    : fmtUsd(v);

export const fmtWeightX = (weight) => {
  if (!weight) return "0x";
  const x = weight / 100;
  if (Number.isInteger(x)) return `${x}x`;
  const cut = Math.floor(x * 10) / 10;
  return `${Number.isInteger(cut) ? cut.toFixed(1) : cut}x`;
};

export const fmtUsdShort = (v) =>
  v === null || v === undefined ? "" : v >= 10000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

/** Le contrat servi par le snapshot, pas une adresse recopiée ici. La
 *  collection a migré une fois ; les liens doivent suivre sans qu'on retouche
 *  la page. La valeur d'origine ne sert que de repli. */
let MACHINES = "0xb509e195bcb3e4461e235ff152c68d66915f67b5";
export const setContract = (addr) => { if (addr) MACHINES = String(addr).toLowerCase(); };
export const itemUrl = (id) => `https://opensea.io/assets/robinhood/${MACHINES}/${id}`;

/** Tout ce qui vient du réseau entre dans du balisage, et rien n'est écrit
 *  sans passer par ici. */
export const esc = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ══ ACHETER ═══════════════════════════════════════════════════════════════ */

/**
 * L'état du protocole, en une ligne.
 *
 * Dix encadrés disaient le prix du $PRINTER, celui de l'ETH, le coût de
 * l'encre, le floor, le volume, le compte de machines allumées, l'offre de
 * l'anvil, le pot, le bulletin et l'epoch. Trois de ces dix servaient à
 * décider quelque chose ; les sept autres étaient vrais et sans emploi.
 */
export function pulseLine(d) {
  if (!d) return "";
  const bits = [];
  if (d.totals?.inked) {
    bits.push(`<span><b class="on">${fmtInt(d.totals.inked)}</b> machines are printing</span>`);
  }
  if (d.pot?.usd) {
    bits.push(`<span><b>${fmtUsdShort(d.pot.usd)}</b> waiting to be shared out</span>`);
  }
  if (d.book?.listed) {
    bits.push(`<span><b>${fmtInt(d.book.listed)}</b> for sale right now</span>`);
  }
  return bits.join("");
}

/**
 * Ce qu'on peut acheter, en cartes.
 *
 * L'ordre est celui du retour : ce que la machine rend rapporté à ce qu'elle
 * coûte. Une dormante ne rend rien tant qu'on ne l'a pas allumée, donc son coût
 * porte l'allumage — sans quoi elle passerait devant à prix égal en ne
 * rapportant rien.
 */
export const SORTS = Object.freeze([
  { key: "back", label: "Best return" },
  { key: "cheap", label: "Cheapest" },
]);

export function pickMachines(d, { klass = null, limit = 24, sort = "back" } = {}) {
  const eth = d?.eth?.usd;
  const light = d?.ink?.activationTotalUsd ?? 0;
  const out = [];
  for (const r of d?.rows ?? []) {
    if (klass && r.classLabel !== klass) continue;
    for (const [lit, cell] of [[true, r.inked], [false, r.dormant]]) {
      for (const e of cell?.entries ?? []) {
        const priceUsd = eth ? e.priceEth * eth : null;
        const cost = priceUsd === null ? null : priceUsd + (lit ? 0 : light);
        const back = (e.epochUsd ?? 0) + (e.holds?.usd ?? 0);
        out.push({
          ...e, lit, classLabel: r.classLabel, priceUsd, cost, back,
          ratio: cost ? back / cost : 0,
        });
      }
    }
  }
  // Deux façons d'entrer dans un carnet, et elles ne montrent pas les mêmes
  // machines. Le retour met les allumées devant, forcément : une dormante rend
  // zéro. Sans le tri par prix, aucune dormante n'apparaîtrait jamais — et
  // c'est justement l'entrée la moins chère.
  const by = sort === "cheap"
    ? (a, b) => (a.priceEth ?? Infinity) - (b.priceEth ?? Infinity)
    : (a, b) => b.ratio - a.ratio;
  return out.sort(by).slice(0, limit);
}

/** Une machine, une carte. Un seul geste possible : aller l'acheter. */
export function cardHtml(m, { light = 0 } = {}) {
  const reinked = m.inkMult > 1.0001 && m.weight;
  const art = m.machine?.image
    ? `<img class="card-art" src="${esc(m.machine.image)}" alt="" loading="lazy">`
    : `<span class="card-noart"></span>`;

  // Le vert ne dit qu'une chose : cette machine imprime. Une dormante n'en
  // porte aucune trace, et c'est l'information elle-même.
  const earns = m.lit
    ? `<span class="card-earn">${fmtUsd(m.epochUsd ?? 0)}<small>each drop</small></span>`
    : `<span class="card-earn off">Not printing<small>${
        light ? `${fmtUsdRound(light)} of $PRINTER to switch it on` : "needs ink first"
      }</small></span>`;

  return `<a class="card" href="${itemUrl(m.tokenId)}" target="_blank" rel="noopener">` +
    art +
    `<span class="card-body">` +
      `<span class="card-top">` +
        `<span class="card-id">#${m.tokenId}</span>` +
        `<span class="card-cls${reinked ? " re" : ""}">${esc(m.classLabel)}${
          reinked ? ` · re-inked` : ""}</span>` +
      `</span>` +
      `<span class="card-price">${m.priceUsd === null ? fmtEth(m.priceEth) : fmtUsdRound(m.priceUsd)}` +
        `<small>${fmtEth(m.priceEth)} ETH</small></span>` +
      earns +
      (m.holds?.usd ? `<span class="card-inside">carrying ${fmtUsd(m.holds.usd)} of stock</span>` : "") +
    `</span></a>`;
}

/** Les classes, en pastilles qu'on touche. Cinq menus déroulants tenaient ici. */
export function chipsHtml(d, active, sort = "back") {
  const cls = `<button type="button" data-k="" aria-pressed="${active ? "false" : "true"}">Everything</button>` +
    (d?.rows ?? [])
      .filter((r) => (r.inked?.listed ?? 0) + (r.dormant?.listed ?? 0) > 0)
      .map((r) => `<button type="button" data-k="${esc(r.classLabel)}" ` +
        `aria-pressed="${active === r.classLabel ? "true" : "false"}">${esc(r.classLabel)}</button>`)
      .join("");
  const sorts = SORTS.map((o) =>
    `<button type="button" data-s="${o.key}" aria-pressed="${sort === o.key ? "true" : "false"}">${
      esc(o.label)}</button>`).join("");
  return `<div class="chips">${cls}</div><div class="chips chips-sort">${sorts}</div>`;
}

/* ══ CE QUE JE POSSÈDE ═════════════════════════════════════════════════════ */

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Le portefeuille d'un visiteur.
 *
 * Le total d'abord, parce que c'est ce qu'on vient chercher, puis les machines
 * dans les mêmes cartes que la boutique — une machine se lit pareil qu'on la
 * possède ou qu'on la convoite.
 *
 * Un floor est un prix demandé, pas un prix obtenu. Le total a l'air d'un solde
 * bancaire et n'en est pas un : la page le dit sous le chiffre plutôt que de le
 * sous-entendre.
 */
export function mineHtml(w, { light = 0 } = {}) {
  if (!w) return "";
  if (w.pending) return `<p class="note" style="margin-top:24px">Reading the chain…</p>`;
  if (w.error) return `<p class="note" style="margin-top:24px">${esc(w.error)}</p>`;
  if (!w.machines?.length) {
    return `<p class="note" style="margin-top:24px">That address holds no Machine.</p>`;
  }

  const wo = w.worth;
  const total = wo?.total
    ? `<h2 class="sec" style="margin-top:34px">${fmtUsdRound(wo.total)}</h2>` +
      `<p class="sub">` +
      [
        wo.machinesUsd ? `${fmtInt(w.machines.length)} machines at ${fmtUsdRound(wo.machinesUsd)}` : null,
        wo.insideUsd ? `${fmtUsd(wo.insideUsd)} of stock inside them` : null,
        wo.printerUsd ? `${fmtUsd(wo.printerUsd)} of $PRINTER` : null,
      ].filter(Boolean).join(" · ") + `</p>` +
      `<p class="note" style="margin-top:8px">Machines are counted at the cheapest asking ` +
      `price for their class and state. That is what others are asking, not what you would ` +
      `be paid — nobody is bidding it.</p>`
    : "";

  const earning = w.machines.filter((m) => m.weight).length;
  const line = `<p class="pulse" style="margin-top:22px">` +
    (earning ? `<span><b class="on">${fmtInt(earning)}</b> of them printing</span>` : "") +
    (w.cutUsd ? `<span><b>${fmtUsd(w.cutUsd)}</b> waiting for you in the pot</span>` : "") +
    (w.advice?.best ? `<span>vote <b>${esc(w.advice.best.ticker)}</b></span>` : "") + `</p>`;

  const cards = w.machines.map((m) => cardHtml({
    tokenId: m.tokenId, machine: { image: m.image }, classLabel: m.desk ?? "",
    lit: Boolean(m.weight), epochUsd: m.epochUsd, holds: m.holds,
    priceEth: null, priceUsd: wo?.lines?.find((l) => l.tokenId === m.tokenId)?.machineUsd ?? null,
    inkMult: null, weight: m.weight,
  }, { light })).join("");

  return total + line + `<div class="grid">${cards}</div>`;
}

/* ══ COMPRENDRE ════════════════════════════════════════════════════════════ */

/**
 * Comment ça marche, en cinq temps.
 *
 * L'ancienne page tenait en dix blocs de prose serrée sur trois colonnes, avec
 * une table de correspondance des couvre-chefs et un tableau des sources. Elle
 * était juste et personne ne la lisait.
 *
 * Ici : cinq étapes, dans l'ordre où elles arrivent à une machine, une idée par
 * étape. Ce qui reste — le vote, ce qui brûle, le memepad — se lit plus bas
 * pour qui veut.
 */
export function learnHtml(d) {
  const activation = d?.ink?.activationTotalUsd;
  const steps = [
    ["You buy a Machine",
     `Ten thousand exist. Two things about each are sealed forever: its <b>class</b> — x1 up ` +
     `to x10 — and its <b>desk</b>, one of sixteen, which decides which stock it earns double on.`],
    ["You switch it on",
     `A Machine with no ink earns nothing and votes on nothing. Burning <b>5,000 $PRINTER</b>` +
     (activation ? ` — about ${fmtUsdRound(activation)} today` : "") +
     ` switches it on. That $PRINTER is destroyed and never comes back.`],
    ["It starts earning at the next drop",
     `A Machine lit during an epoch takes no part in the pot that is already waiting. ` +
     `It counts from the following one.`],
    ["The protocol collects fees and buys real stock",
     `Every sale, every trade, every fusion pays into one pot. When the vote closes, the pot ` +
     `buys tokenised shares — NVDA, GME, SPCX — and they land <b>inside each Machine's own ` +
     `wallet</b>, split by weight.`],
    ["Selling the Machine sells what is inside it",
     `The stock belongs to the token, not to you. Sell the Machine and its contents go with ` +
     `it, unless you withdraw first — which is why every card here shows what it is carrying.`],
  ];

  return `<h2 class="sec" style="margin-top:30px">How it works</h2>` +
    `<div class="steps">` + steps.map(([t, b], i) =>
      `<div class="step"><span class="step-n">${i + 1}</span>` +
      `<div><h3>${esc(t)}</h3><p>${b}</p></div></div>`).join("") + `</div>`;
}

/* ══ CE QUE LA PAGE DIT QUAND ELLE NE SAIT PAS ═════════════════════════════ */

/**
 * Une donnée absente et une donnée nulle ne sont pas la même chose, et les
 * confondre est la façon dont un tableau de bord ment sans bruit.
 */
export function bannerMessage(v) {
  if (!v?.data) return "Warming up — the first read of the chain is still running.";
  const age = Date.now() - v.at;
  if (age > (v.staleAfterMs ?? 180000)) {
    const mins = Math.round(age / 60000);
    return `These figures are ${mins} minute${mins === 1 ? "" : "s"} old — the last sweep did not come back.`;
  }
  return "";
}

/* ══ CÂBLAGE ═══════════════════════════════════════════════════════════════ */

if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const TABS = ["buy", "mine", "learn"];
  // Les anciennes adresses menaient à six onglets. Un lien partagé la semaine
  // dernière ne doit pas tomber sur une page blanche.
  const MOVED = {
    market: "buy", wallet: "mine", vote: "learn",
    pad: "learn", scarcity: "learn", how: "learn", protocol: "learn",
  };

  let data = null;
  let klass = null;
  let sort = "back";
  let mine = null;

  const show = (name) => {
    const want = TABS.includes(name) ? name : (MOVED[name] ?? TABS[0]);
    for (const t of TABS) {
      const pane = $(`pane-${t}`);
      if (pane) pane.hidden = t !== want;
      const link = $("nav")?.querySelector(`[data-tab="${t}"]`);
      if (link) link.setAttribute("aria-selected", String(t === want));
    }
    return want;
  };

  const paintBuy = () => {
    if (!data) return;
    const light = data.ink?.activationTotalUsd ?? 0;
    const picked = pickMachines(data, { klass, sort });
    $("chips").innerHTML = chipsHtml(data, klass, sort);
    $("cards").innerHTML = picked.length
      ? picked.map((m) => cardHtml(m, { light })).join("")
      : `<p class="note">Nothing listed in that class right now.</p>`;
    const total = (data.rows ?? []).reduce((a, r) =>
      a + (r.inked?.listed ?? 0) + (r.dormant?.listed ?? 0), 0);
    $("more-note").textContent = picked.length && total > picked.length
      ? (sort === "cheap"
          ? `The ${picked.length} cheapest of ${total} for sale.`
          : `The ${picked.length} that give the most back per dollar, of ${total} for sale.`)
      : "";
  };

  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.s) sort = b.dataset.s;
    else if ("k" in b.dataset) klass = b.dataset.k || null;
    else return;
    paintBuy();
  });

  // Le portefeuille. Aucune signature, aucune connexion : la page lit, un point.
  const lookup = async (value) => {
    if (!ADDRESS_RE.test(value)) {
      mine = { error: "That is not an address — it should start with 0x and have 40 characters after it." };
      $("mine-out").innerHTML = mineHtml(mine);
      return;
    }
    mine = { pending: true };
    $("mine-out").innerHTML = mineHtml(mine);
    try {
      const res = await fetch(`/api/wallet?address=${encodeURIComponent(value)}`);
      mine = await res.json();
    } catch {
      mine = { error: "Could not reach the service. Try again in a moment." };
    }
    $("mine-out").innerHTML = mineHtml(mine, { light: data?.ink?.activationTotalUsd ?? 0 });
  };

  $("ask").addEventListener("submit", (e) => {
    e.preventDefault();
    lookup($("addr").value.trim());
  });

  let tab = show((location.hash || "").slice(1));
  addEventListener("hashchange", () => { tab = show((location.hash || "").slice(1)); });

  const refresh = async () => {
    let v;
    try {
      v = await (await fetch("/api/snapshot")).json();
    } catch {
      $("banner").textContent = "Cannot reach the service. The figures below are the last it served.";
      $("banner").classList.add("on");
      return;
    }
    const msg = bannerMessage(v);
    $("banner").textContent = msg;
    $("banner").classList.toggle("on", Boolean(msg));
    if (!v.data) return;

    setContract(v.data.collection?.contract);
    data = v.data;
    $("pulse").innerHTML = pulseLine(data);
    paintBuy();
    if (!$("learn-out").innerHTML) $("learn-out").innerHTML = learnHtml(data);
  };

  refresh();
  setInterval(refresh, 15000);
}

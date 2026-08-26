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
 * L'ouverture : une phrase, pas un tableau de bord.
 *
 * Dix encadrés se dressaient ici — prix du $PRINTER, de l'ETH, coût de l'encre,
 * floor, volume, machines allumées, offre de l'anvil, pot, bulletin, epoch.
 * Trois servaient à décider quelque chose.
 */
export function heroHtml(d, active = null) {
  if (!d?.pot?.usd) {
    return `<div class="hero"><h2>Reading the chain…</h2>` +
      `<p>The first sweep is still running. Nothing below is wrong — there is just nothing yet.</p></div>`;
  }

  const total = d.collection?.machines ?? 10000;
  const b = d.burn;
  // La combustion est le titre. Sans l'offre lue, on ne l'invente pas : on
  // annonce ce qu'on sait — le nombre de machines — et rien de plus.
  // Le point après « Machines » n'est pas un détail de ponctuation. Écrit
  // « 10,000 Machines, and 22.5% of the $PRINTER already burned », le dernier
  // mot se rattache aussi au premier membre et la phrase annonce dix mille
  // machines brûlées. Il n'en existe aucune : `totalSupply` n'a jamais bougé.
  const head = b
    ? `<h2>${fmtInt(total)} Machines. <mark>${fmtRatio(b.share)}</mark> of the ` +
      `$PRINTER already burned.</h2>`
    : `<h2>${fmtInt(total)} Machines, and a $PRINTER supply that only ever falls.</h2>`;

  const said = b
    ? `<p>Every Machine ever minted still exists — none has ever been destroyed. ` +
      `The $PRINTER is the part that burns: ${fmtInt(Math.round(b.burned))} of the ` +
      `${fmtInt(b.minted)} ever minted are gone for good` +
      (b.ink ? `, ${fmtInt(Math.round(b.ink))} of it as ink to switch Machines on` : "") +
      `, and there is no way to mint more.</p>`
    : `<p>Every Machine ever minted still exists. Burning $PRINTER is how one is switched on, ` +
      `and none of that $PRINTER ever comes back.</p>`;

  return `<div class="hero">` + head + said + floorsHtml(d, active) + `</div>`;
}

/**
 * Le prix plancher de chaque classe, et le filtre du carnet.
 *
 * C'est ce que le site promettait depuis le début — le prix d'entrée par
 * classe — et ça tenait jusqu'ici sous six cents vignettes. Les blocs sont
 * aussi le filtre : on lit le prix et on clique dessus. Un tableau de prix
 * qu'on regarde puis une rangée de pastilles qu'on touche disaient la même
 * chose deux fois, à deux endroits.
 *
 * Le plancher allumé est le grand chiffre : c'est celui qui rapporte. Le
 * dormant est dessous, plus petit et sans couleur — il ne rapporte rien tant
 * que personne n'a brûlé pour lui.
 */
export function floorsHtml(d, active = null) {
  const eth = d?.eth?.usd;
  const rows = (d?.rows ?? []).filter((r) => (r.inked?.listed ?? 0) + (r.dormant?.listed ?? 0) > 0);
  if (!rows.length) return "";
  const money = (e) => (e && eth ? fmtUsdRound(e * eth) : e ? `${fmtEth(e)} ETH` : "—");

  return `<div class="floors"><span class="floors-lab">Floor by class — tap one to filter</span>` +
    `<div class="floors-row">` +
    `<button type="button" class="fl fl-all" data-k="" aria-pressed="${active ? "false" : "true"}">` +
      `<b>All</b><u>${fmtInt(rows.reduce((a, r) => a + (r.inked?.listed ?? 0) + (r.dormant?.listed ?? 0), 0))} listed</u>` +
    `</button>` +
    rows.map((r) =>
      `<button type="button" class="fl" data-k="${esc(r.classLabel)}" ` +
      `aria-pressed="${active === r.classLabel ? "true" : "false"}">` +
      `<span class="fl-cls">${esc(r.classLabel)}</span>` +
      `<b>${money(r.inked?.floorEth)}</b>` +
      `<u>${r.dormant?.floorEth ? `${money(r.dormant.floorEth)} dormant` : "none dormant"}</u>` +
      `</button>`).join("") +
    `</div></div>`;
}

/** Quatre chiffres, et chacun porte sa couleur parce qu'il porte un rôle. */
export function statsHtml(d) {
  if (!d) return "";
  const x1 = (d.rows ?? []).find((r) => r.classValue === 100);
  const cheapest = x1?.inked?.floorEth && d.eth?.usd ? x1.inked.floorEth * d.eth.usd : null;
  const cell = (cls, value, label) =>
    `<div class="st ${cls}"><b>${value}</b><u>${label}</u></div>`;
  return [
    cell("st-live", fmtInt(d.totals?.inked ?? 0), "printing now"),
    cell("st-pot", fmtUsdShort(d.pot?.usd ?? 0), "in the pot"),
    cell("st-cost", d.ink?.activationTotalUsd ? fmtUsdRound(d.ink.activationTotalUsd) : "—", "to switch one on"),
    cell("st-book", cheapest === null ? "—" : fmtUsdRound(cheapest), "cheapest way in"),
  ].join("");
}

/** L'ordre des deux boutons est celui de la page : le prix d'abord, parce
 *  que c'est la première question de quelqu'un qui regarde un carnet. */
export const SORTS = Object.freeze([
  { key: "cheap", label: "Cheapest" },
  { key: "back", label: "Best return" },
]);

/**
 * Ce qu'on peut acheter.
 *
 * L'ordre est celui du retour : ce que la machine rend rapporté à ce qu'elle
 * coûte. Une dormante ne rend rien tant qu'on ne l'a pas allumée, donc son coût
 * porte l'allumage — sans quoi elle passerait devant à prix égal en ne
 * rapportant rien.
 */
export function pickMachines(d, { klass = null, limit = 24, sort = SORTS[0].key } = {}) {
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
        out.push({ ...e, lit, classLabel: r.classLabel, priceUsd, cost, back, ratio: cost ? back / cost : 0 });
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

/** Une machine, une carte, un seul geste : aller l'acheter. */
export function cardHtml(m, { light = 0 } = {}) {
  const reinked = m.inkMult > 1.0001 && m.weight;
  const art = m.machine?.image
    ? `<img class="card-art" src="${esc(m.machine.image)}" alt="" loading="lazy">`
    : `<span class="card-noart"></span>`;
  // Lime : cette machine imprime. Une dormante n'en porte aucune trace, et
  // c'est l'information elle-même.
  const earns = m.lit
    ? `<span class="card-earn">${fmtUsd(m.epochUsd ?? 0)} a drop</span>`
    : `<span class="card-earn off">${light ? `${fmtUsdRound(light)} to switch on` : "no ink"}</span>`;
  const price = m.priceUsd === null || m.priceUsd === undefined
    ? fmtEth(m.priceEth)
    : fmtUsdRound(m.priceUsd);

  return `<a class="card" data-id="${m.tokenId}" href="${itemUrl(m.tokenId)}" ` +
    `target="_blank" rel="noopener">` +
    art +
    `<span class="card-body">` +
      `<span class="card-id">#${m.tokenId} &middot; ${esc(m.classLabel ?? "")}` +
        `${reinked ? ` <span class="re">re-inked</span>` : ""}</span>` +
      `<span class="card-price">${price}` +
        (m.priceEth ? `<small>${fmtEth(m.priceEth)} ETH</small>` : "") + `</span>` +
      earns +
      (m.holds?.usd ? `<span class="card-inside">carrying ${fmtUsd(m.holds.usd)} of stock</span>` : "") +
    `</span></a>`;
}

/** Les classes en pastilles, et le tri sur sa propre ligne. */
/** Le tri, et lui seul : la classe se choisit sur les blocs de plancher. */
export function chipsHtml(d, active, sort = SORTS[0].key) {
  return `<div class="chips chips-sort">` + SORTS.map((o) =>
    `<button type="button" data-s="${o.key}" aria-pressed="${sort === o.key ? "true" : "false"}">${
      esc(o.label)}</button>`).join("") + `</div>`;
}

/**
 * Le détail d'une machine.
 *
 * Une carte porte ce qu'il faut pour choisir ; le panneau porte ce qu'il faut
 * pour vérifier. Tout ce que la chaîne dit d'une machine se lit ici — son
 * poids exact, l'encre qu'elle a brûlée, les actions qu'elle transporte, ce
 * que l'anvil en donnerait — et rien n'oblige à ouvrir OpenSea pour le savoir.
 */
export function detailHtml(m, d) {
  if (!m) return "";
  const eth = d?.eth?.usd;
  const usd = (e) => (e && eth ? fmtUsdRound(e * eth) : null);
  const reinked = m.inkMult > 1.0001 && m.weight;

  const row = (k, v, cls = "") =>
    v === null || v === undefined || v === "" ? ""
      : `<div class="d-row ${cls}"><span>${esc(k)}</span><b>${v}</b></div>`;

  // Ce qu'elle transporte. Le compte appartient au jeton : ces actions partent
  // avec la machine si elle se vend, et c'est le genre de chose qu'on découvre
  // trop tard.
  const holds = !m.holds?.lines?.length ? "" :
    `<div class="d-block"><h4>Carrying ${fmtUsd(m.holds.usd)} of stock</h4>` +
    `<p class="d-note">It sits in the Machine's own account and goes with it if it sells, ` +
    `unless the owner withdraws first.</p>` +
    m.holds.lines.filter((l) => l.usd > 0.005)
      .sort((a, b) => b.usd - a.usd)
      .map((l) => row(l.symbol, `${fmtAmount(l.amount)} &middot; ${fmtUsd(l.usd)}`))
      .join("") + `</div>`;

  const art = m.machine?.image
    ? `<img class="d-art" src="${esc(m.machine.image)}" alt="Machine #${m.tokenId}">`
    : `<span class="d-art d-noart"></span>`;

  const traits = ["headwear", "body", "eyes"]
    .map((t) => m.machine?.[t] ? row(t, esc(m.machine[t])) : "")
    .join("");

  return `<div class="d-panel" role="dialog" aria-modal="true" aria-label="Machine #${m.tokenId}">` +
    `<button class="d-close" type="button" aria-label="Close">&times;</button>` +
    `<div class="d-top">${art}` +
      `<div class="d-head">` +
        `<span class="d-id">#${m.tokenId}</span>` +
        `<h3>${esc(m.classLabel ?? "")}${reinked ? ` <span class="d-re">re-inked</span>` : ""}</h3>` +
        (m.lit
          ? `<span class="card-earn">${fmtUsd(m.epochUsd ?? 0)} a drop</span>`
          : `<span class="card-earn off">Not printing</span>`) +
        `<div class="d-price">${usd(m.priceEth) ?? fmtEth(m.priceEth)}` +
          (m.priceEth ? `<small>${fmtEth(m.priceEth)} ETH on OpenSea</small>` : "") + `</div>` +
        `<a class="d-buy" href="${itemUrl(m.tokenId)}" target="_blank" rel="noopener">Open on OpenSea &rarr;</a>` +
      `</div>` +
    `</div>` +
    `<div class="d-block"><h4>What the chain says</h4>` +
      row("weight", m.weight ? `${fmtExact(m.weight / 100)}&times;` : "none — never inked") +
      row("ink burned", m.inkPrinter ? `${fmtInt(Math.round(m.inkPrinter))} $PRINTER` : null) +
      (reinked ? row("burned past activation",
        `${fmtExact(m.inkPrinter / 4250)}&times; the base ink`, "d-hot") : "") +
      row("desk", m.machine?.desk ? esc(m.machine.desk) : null) +
      traits +
    `</div>` +
    holds +
    // L'anvil est un acheteur permanent : ce qu'il donne est le seul prix
    // qu'on obtienne à coup sûr, et il se paie en $PRINTER, pas en ETH.
    (m.anvilBidEth
      ? `<div class="d-block"><h4>The Anvil would pay ${usd(m.anvilBidEth) ?? fmtEth(m.anvilBidEth)}</h4>` +
        `<p class="d-note">${fmtInt(Math.round(m.anvilBidPrinter))} $PRINTER, net of the sell fee — ` +
        `the same standing bid for any Machine, whatever its class.</p></div>`
      : "") +
    `</div>`;
}

/* ══ CE QUE JE POSSÈDE ═════════════════════════════════════════════════════ */

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Le portefeuille d'un visiteur.
 *
 * Le total d'abord, puis les machines dans les mêmes cartes que la boutique :
 * une machine se lit pareil qu'on la possède ou qu'on la convoite.
 *
 * Un floor est un prix demandé, pas un prix obtenu. Le total a l'air d'un solde
 * bancaire et n'en est pas un — la page le dit sous le chiffre plutôt que de le
 * sous-entendre.
 */
export function mineHtml(w, { light = 0 } = {}) {
  if (!w) return "";
  if (w.pending) return `<p class="note" style="margin-top:22px">Reading the chain…</p>`;
  if (w.error) return `<p class="note" style="margin-top:22px">${esc(w.error)}</p>`;
  if (!w.machines?.length) {
    return `<p class="note" style="margin-top:22px">That address holds no Machine.</p>`;
  }

  const wo = w.worth;
  const earning = w.machines.filter((m) => m.weight).length;
  const stats = `<div class="stats" style="margin-top:24px">` +
    (wo?.total ? `<div class="st st-pot"><b>${fmtUsdRound(wo.total)}</b><u>all of it, together</u></div>` : "") +
    `<div class="st st-live"><b>${fmtInt(earning)}</b><u>of yours printing</u></div>` +
    (w.cutUsd !== null && w.cutUsd !== undefined
      ? `<div class="st st-cost"><b>${fmtUsd(w.cutUsd)}</b><u>waiting for you</u></div>` : "") +
    (w.advice?.best
      ? `<div class="st st-book"><b>${esc(w.advice.best.ticker)}</b><u>what to vote</u></div>` : "") +
    `</div>`;

  const parts = !wo?.total ? "" :
    `<p class="note" style="margin:-12px 0 20px">` +
    [
      wo.machinesUsd ? `${fmtInt(w.machines.length)} machines at ${fmtUsdRound(wo.machinesUsd)}` : null,
      wo.insideUsd ? `${fmtUsd(wo.insideUsd)} of stock inside them` : null,
      wo.printerUsd ? `${fmtUsd(wo.printerUsd)} of $PRINTER` : null,
    ].filter(Boolean).join(" &middot; ") +
    `. Machines are counted at the cheapest asking price for their class and state — ` +
    `what others are asking, not what you would be paid.</p>`;

  const cards = w.machines.map((m) => cardHtml({
    tokenId: m.tokenId,
    machine: { image: m.image },
    classLabel: m.desk ?? "",
    lit: Boolean(m.weight),
    epochUsd: m.epochUsd,
    holds: m.holds,
    priceEth: null,
    priceUsd: wo?.lines?.find((l) => l.tokenId === m.tokenId)?.machineUsd ?? null,
  }, { light })).join("");

  return stats + parts + `<div class="grid">${cards}</div>`;
}

/* ══ COMPRENDRE ════════════════════════════════════════════════════════════ */

/**
 * Comment ça marche, en cinq temps.
 *
 * L'ancienne page tenait en dix blocs de prose serrée sur trois colonnes. Elle
 * était juste et personne ne la lisait. Ici : cinq étapes, dans l'ordre où
 * elles arrivent à une machine, une idée par étape. Le numéro porte une vraie
 * information — c'est une séquence, pas une décoration.
 */
export function stepsHtml(d) {
  const activation = d?.ink?.activationTotalUsd;
  const steps = [
    ["You buy a Machine",
     `Ten thousand exist. Two things about each are sealed forever: its <b>class</b> — x1 up to ` +
     `x10 — and its <b>desk</b>, one of sixteen, which decides which stock it earns double on.`],
    ["You switch it on",
     `A Machine with no ink earns nothing and votes on nothing. Burning <b>5,000 $PRINTER</b>` +
     (activation ? ` — about ${fmtUsdRound(activation)} today` : "") +
     ` switches it on. That $PRINTER is destroyed and never comes back.`],
    ["It starts earning at the next drop",
     `A Machine lit during an epoch takes no part in the pot already waiting. It counts from the ` +
     `following one — so buying and lighting today does not put you in this round.`],
    ["The protocol collects fees and buys real stock",
     `Every sale, every trade, every fusion pays into one pot. When the vote closes it buys ` +
     `tokenised shares — NVDA, GME, SPCX — and they land <b>inside each Machine's own wallet</b>, ` +
     `split by weight.`],
    ["Selling the Machine sells what is inside it",
     `The stock belongs to the token, not to you. Sell the Machine and its contents go with it, ` +
     `unless you withdraw first — which is why every card here shows what it is carrying.`],
  ];
  return `<div class="steps">` + steps.map(([t, b], i) =>
    `<div class="step"><span class="step-n">${i + 1}</span>` +
    `<div><h4>${esc(t)}</h4><p>${b}</p></div></div>`).join("") + `</div>`;
}

/** Le dépouillement, desk par desk. C'est lui qui décide de la taille des parts. */
export function voteHtml(vote, epoch) {
  if (!vote) return `<p class="note">The ballot could not be read.</p>`;
  if (!vote.opened) {
    return `<p class="note">No ballot has opened for epoch ${esc(String(epoch ?? "—"))} yet. ` +
      `Until one does, nothing is bought and the pot rolls forward.</p>`;
  }
  const voted = (vote.desks ?? []).filter((x) => x.votedWeight > 0);
  if (!voted.length) return `<p class="note">The ballot is open and not one Machine has voted.</p>`;
  const top = voted[0].votedWeight || 1;
  return voted.slice(0, 8).map((dk) =>
    `<div class="vt"><div class="vt-hd"><span>${esc(dk.ticker ?? dk.sector ?? `desk ${dk.index}`)}</span>` +
    `<u>${fmtRatio(dk.share ?? 0)}</u></div>` +
    `<div class="vt-bar"><i style="width:${Math.round((dk.votedWeight / top) * 100)}%"></i></div></div>`).join("");
}

/**
 * Ce qui quitte la circulation.
 *
 * Deux disparitions, et elles ne sont pas de même nature. Le $PRINTER brûle :
 * détruit, irrécupérable. Les machines, elles, partent au coffre du Proton et y
 * restent — `totalSupply` du NFT ne bouge pas, et le coffre a un propriétaire
 * qui peut les ressortir. La page ne doit jamais laisser lire l'un pour
 * l'autre : une machine brûlée réduit l'offre pour toujours, une machine au
 * coffre peut revenir demain.
 */
export function scarcityHtml(sc) {
  if (!sc) return `<p class="note">Not read yet — walking the chain's logs takes a hundred requests.</p>`;
  const v = sc.vault, b = sc.burn, o = sc.odds, p = sc.proton;
  const st = (cls, val, label) => `<div class="st ${cls}"><b>${val}</b><u>${label}</u></div>`;

  const vault = !v ? "" :
    `<div class="stats">` +
    st("st-book", fmtInt(v.held), "machines in the vault") +
    (v.dormant === null ? "" : st("st-book", fmtInt(v.dormant), "of them dormant")) +
    st("st-cost", b?.supply ? fmtInt(Math.round(b.supply)) : "—", "$PRINTER left") +
    st("st-cost", b?.burnedShare ? fmtRatio(b.burnedShare) : "—", "of the supply burned") +
    `</div>` +
    `<div class="prose"><p>Fusing a Machine into another sends the sacrifice to a vault. ` +
    `It is <b>not burned</b> — the collection is still ten thousand strong — but it leaves ` +
    `your wallet for good, before the dice even roll. The vault is owned by a single key, not ` +
    `a multi-signature wallet, and it can send any Machine it holds to any address. ` +
    `${p?.released ? `${fmtInt(p.released)} have come back out.` : "Nothing has ever come back out so far."} ` +
    `Locked is not burned, and this page will not call it that.</p>` +
    (b?.ink === null || b?.ink === undefined ? "" :
      `<p>Of the <b>${fmtInt(b.minted)}</b> $PRINTER ever minted, ${fmtInt(Math.round(b.ink))} ` +
      `burned as ink switching Machines on, and ${fmtInt(Math.round(b.other))} burned elsewhere` +
      `${b.proton ? ` — ${fmtInt(Math.round(b.proton))} of it by the Proton` : ""}.</p>`) +
    (!o ? "" :
      `<p>The Proton claims <b>${fmtRatio(1 - o.claimedFailRate)}</b> success. So far ` +
      `<b>${fmtRatio(o.failRate)}</b> of ${fmtInt(o.done)} rolls have failed, against ` +
      `${o.expected.toFixed(0)} expected.` +
      (o.oneIn ? ` That is not proof of anything: on an honest roll a run this bad turns up about ` +
        `once in ${fmtInt(o.oneIn)}. Worth watching, not yet worth believing.` : ` That is at or below what was promised.`) +
      `</p>`) + `</div>`;
  return vault;
}

/**
 * PRINTER.FUN, le memepad du même écosystème.
 *
 * Lu sur les deux factories, pas sur le tableau du site officiel : celui-ci
 * annonce zéro volume horaire dans le même document que vingt-cinq échanges
 * horodatés.
 */
export function padHtml(pad) {
  if (!pad) return `<p class="note">Not read yet.</p>`;
  const st = (cls, val, label) => `<div class="st ${cls}"><b>${val}</b><u>${label}</u></div>`;
  const grads = (pad.coins ?? []).filter((c) => c.graduated);
  return `<div class="stats">` +
    st("st-book", fmtInt(pad.launched), "coins launched") +
    st("st-live", fmtInt(pad.graduated), "graduated") +
    st("st-book", fmtInt(pad.untouched), "never bought") +
    st("st-cost", pad.lockedUsd === null ? "—" : fmtUsdShort(pad.lockedUsd), "in the curves") +
    `</div>` +
    `<div class="prose"><p>Launch a memecoin paired against a tokenised Robinhood stock and trade ` +
    `it on a bonding curve priced in that stock. <b>1% of every trade</b> buys back and burns ` +
    `$PRINTER. Fill the curve and the coin graduates into a real pool.` +
    (pad.vol24hUsd ? ` The ${fmtInt(pad.graduated)} that graduated traded ` +
      `<b>${fmtUsdShort(pad.vol24hUsd)}</b> between them in the last 24 hours.` : "") +
    ` Read from the two factories, not from the pad's own board.</p></div>` +
    (!grads.length ? "" : `<div class="grid" style="margin-top:16px">` + grads.map((c) =>
      `<a class="card" href="https://www.printer.fun/coin/${esc(c.token)}" target="_blank" rel="noopener">` +
      `<span class="card-body"><span class="card-id">${esc(c.symbol)} &middot; ${esc(c.baseSymbol)}</span>` +
      `<span class="card-price">${c.pool ? fmtUsdShort(c.pool.poolUsd) : "—"}<small>in its pool</small></span>` +
      `<span class="card-earn">${c.pool ? fmtUsdShort(c.pool.vol24hUsd) : "—"} in 24h</span>` +
      `</span></a>`).join("") + `</div>`);
}

/**
 * D'où vient chaque chiffre.
 *
 * Le tableau de bord reproche au terminal officiel de ne pas cadrer ses
 * sources ; il ne peut pas s'en dispenser. Le point le plus facile à taire est
 * le plus important : les prix demandés, sujet même du site, ne viennent pas de
 * la chaîne.
 */
export function sourcesHtml(sources, kinds) {
  if (!sources || !kinds) return "";
  const block = (kind) => {
    const rows = sources.filter((s) => s.kind === kind);
    if (!rows.length) return "";
    return `<div class="step" style="display:block">` +
      `<h4>${esc(kinds[kind].label)}</h4>` +
      `<p style="margin-bottom:9px">${esc(kinds[kind].blurb)}</p>` +
      `<p style="margin:0;font-size:14px">${rows.map((r) =>
        `<b>${esc(r.what)}</b> — ${esc(r.from)}`).join("<br>")}</p></div>`;
  };
  return `<div class="steps">${block("chain")}${block("api")}${block("derived")}</div>` +
    `<p class="note" style="margin-top:14px;max-width:68ch">A price in dollars cannot come from ` +
    `the chain — it knows a pool's reserves, never a rate. Neither can an order book: OpenSea ` +
    `orders are signed off-chain and only touch the chain when someone buys. Those are limits, ` +
    `not shortcuts.</p>`;
}

/**
 * Ce que la page dit quand elle ne sait pas. Une donnée absente et une donnée
 * nulle ne sont pas la même chose, et les confondre est la façon dont un
 * tableau de bord ment sans bruit.
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
  // Le carnet ouvre sur le prix : « combien ça coûte » vient avant « combien
  // ça rend », et c'est aussi le seul tri qui montre les dormantes.
  let sort = SORTS[0].key;
  let mine = null;
  let learnPainted = false;

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
    $("hero").innerHTML = heroHtml(data, klass);
    $("chips").innerHTML = chipsHtml(data, klass, sort);
    $("cards").innerHTML = picked.length
      ? picked.map((m) => cardHtml(m, { light })).join("")
      : `<p class="note">Nothing listed in that class right now.</p>`;
    $("buy-title").textContent = sort === "cheap" ? "Cheapest first" : "Most back per dollar";
    $("buy-sub").textContent = sort === "cheap"
      ? "What costs least to get in. Dormant ones are cheaper because they earn nothing yet."
      : "What each Machine returns — its share of the pot, plus the stock already sitting in it — against what it costs.";
    const total = (data.rows ?? []).reduce((a, r) =>
      a + (r.inked?.listed ?? 0) + (r.dormant?.listed ?? 0), 0);
    $("more-note").textContent = picked.length && total > picked.length
      ? `Showing ${picked.length} of ${total} for sale.` : "";
  };

  /**
   * Le détail d'une machine.
   *
   * La carte reste un lien vers OpenSea : un clic du milieu, un clic modifié ou
   * « ouvrir dans un nouvel onglet » doivent continuer d'y mener. Le panneau ne
   * vole que le clic simple, et il rend au clavier ce qu'il prend à la souris —
   * Échap ferme, et le focus revient là où on l'avait laissé.
   */
  const veil = $("detail");
  let lastFocus = null;

  const closeDetail = () => {
    veil.hidden = true;
    veil.innerHTML = "";
    lastFocus?.focus?.();
    lastFocus = null;
  };

  const openDetail = (tokenId, from) => {
    if (!data) return;
    let found = null;
    for (const r of data.rows ?? []) {
      for (const [lit, cell] of [[true, r.inked], [false, r.dormant]]) {
        const e = (cell?.entries ?? []).find((x) => x.tokenId === tokenId);
        if (e) found = { ...e, lit, classLabel: r.classLabel };
      }
    }
    if (!found) return;
    lastFocus = from ?? null;
    veil.innerHTML = detailHtml(found, data);
    veil.hidden = false;
    veil.querySelector(".d-close")?.focus();
  };

  veil.addEventListener("click", (e) => {
    // Le voile ferme ; le panneau ne ferme que par sa croix.
    if (e.target === veil || e.target.closest(".d-close")) closeDetail();
  });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !veil.hidden) closeDetail();
  });

  $("cards").addEventListener("click", (e) => {
    const card = e.target.closest("a.card");
    if (!card || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const id = Number(card.dataset.id);
    if (!Number.isFinite(id)) return;
    e.preventDefault();
    openDetail(id, card);
  });

  // Le plancher d'une classe est aussi son filtre : on lit le prix, on clique.
  $("hero").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    klass = b.dataset.k || null;
    paintBuy();
  });

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
      mine = await (await fetch(`/api/wallet?address=${encodeURIComponent(value)}`)).json();
    } catch {
      mine = { error: "Could not reach the service. Try again in a moment." };
    }
    $("mine-out").innerHTML = mineHtml(mine, { light: data?.ink?.activationTotalUsd ?? 0 });
  };

  $("ask").addEventListener("submit", (e) => {
    e.preventDefault();
    lookup($("addr").value.trim());
  });

  // Le pad et la rareté vivent sur leurs propres routes et leur propre cadence :
  // cent requêtes de journaux n'ont pas à repartir toutes les quinze secondes.
  let extrasAt = 0;
  const loadExtras = async (force = false) => {
    if (!force && Date.now() - extrasAt < 300000) return;
    extrasAt = Date.now();
    for (const [id, path, render] of [
      ["pad", "/api/pad", padHtml],
      ["scarcity", "/api/scarcity", scarcityHtml],
    ]) {
      try {
        const res = await fetch(path);
        $(id).innerHTML = render(res.ok ? await res.json() : null);
      } catch {
        extrasAt = 0;
      }
    }
  };

  let tab = show((location.hash || "").slice(1));
  if (tab === "learn") loadExtras(true);
  addEventListener("hashchange", () => {
    tab = show((location.hash || "").slice(1));
    if (tab === "learn") loadExtras();
  });

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
    $("stats").innerHTML = statsHtml(data);
    paintBuy();
    $("vote").innerHTML = voteHtml(data.vote, data.protocol?.epoch);
    $("vote-sub").textContent =
      "Every Machine votes with its weight, and the pot is cut between the desks in proportion " +
      "to what they drew. A Machine counts twice on the slice bought for its own desk.";
    // Ce qui ne bouge pas se dessine une fois.
    if (!learnPainted) {
      $("learn-steps").innerHTML = stepsHtml(data);
      if (data.sources) $("sources").innerHTML = sourcesHtml(data.sources.list, data.sources.kinds);
      learnPainted = true;
    }
  };

  refresh();
  setInterval(refresh, 15000);
}

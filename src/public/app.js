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

/** Le rayon de l'anvil ne se vend pas sur OpenSea : il s'achète au terminal du
 *  protocole, et il se paie en $PRINTER. Ce sont deux transactions différentes,
 *  donc deux liens différents. */
export const ANVIL_URL = "https://www.rhmachines.com/#anvil";

/** Tout ce qui vient du réseau entre dans du balisage, et rien n'est écrit
 *  sans passer par ici. */
/**
 * Rien de ce qui vient de la chaîne, d'OpenSea ou du pad n'entre dans du
 * balisage sans passer par ici.
 *
 * L'apostrophe simple est échappée alors qu'aucun attribut du projet n'en
 * utilise. C'est exactement pour ça : le jour où quelqu'un écrit `class='…'`,
 * cette fonction doit déjà tenir. Un échappement qui dépend d'une convention
 * de guillemets n'en est pas un.
 */
export const esc = (s) => String(s).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ══ ACHETER ═══════════════════════════════════════════════════════════════ */

/**
 * L'ouverture : une phrase, pas un tableau de bord.
 *
 * Dix encadrés se dressaient ici — prix du $PRINTER, de l'ETH, coût de l'encre,
 * floor, volume, machines allumées, offre de l'anvil, pot, bulletin, epoch.
 * Trois servaient à décider quelque chose.
 */
export function heroHtml(d, active = null) {
  /* Ce qui dit qu'on n'a rien, c'est l'absence de grille — jamais un pot vide.
   *
   * Le 2026-09-03 le protocole a vidé le pot pour acheter : le solde USDG du
   * swapper est tombé à zéro, ce qui est son état normal juste après un achat.
   * La condition portait sur `pot.usd`, donc ce zéro légitime s'est lu comme
   * « premier balayage en cours » — et comme `floorsHtml` est rendu dans la
   * branche normale, le titre, la vitrine et toute la grille des planchers ont
   * disparu avec. Le service allait bien, l'instantané était complet et juste :
   * 955 annonces, sept lignes de planchers, 24,2 % brûlé. La page annonçait
   * qu'elle n'avait rien. */
  if (!d?.rows) {
    return `<div class="hero"><h2>Reading the chain…</h2>` +
      `<p>The first sweep is still running. Nothing below is wrong — there is just nothing yet.</p></div>`;
  }

  const f = d.fleet;
  const b = d.burn;
  // Le nombre qui compte n'est pas celui qui a été frappé, c'est celui qu'on
  // peut encore acheter. Le coffre du Proton en avale une à chaque fusion.
  const total = f?.circulating ?? d.collection?.machines ?? 10000;
  // La combustion est le titre. Sans l'offre lue, on ne l'invente pas : on
  // annonce ce qu'on sait — le nombre de machines — et rien de plus.
  // Le point après « Machines » n'est pas un détail de ponctuation. Écrit
  // « 10,000 Machines, and 22.5% of the $PRINTER already burned », le dernier
  // mot se rattache aussi au premier membre et la phrase annonce dix mille
  // machines brûlées. `totalSupply` n'a jamais bougé ; ce qui a disparu est
  // compté à part, juste en dessous, et jamais fondu dans ce titre.
  const noun = f ? "Machines still out there" : "Machines";
  const fleet = `<mark class="stamp">${fmtInt(total)}</mark>`;
  const head = b
    ? `<h2>${fleet} ${noun}. <mark>${fmtRatio(b.share)}</mark> of the ` +
      `$PRINTER already burned.</h2>`
    : `<h2>${fleet} ${noun}, and a $PRINTER supply that only ever falls.</h2>`;

  // Trois disparitions, et aucune n'est de même nature. L'adresse morte ne
  // rend rien. Le Meltdown du 2026-09-23 y a envoyé les 3 477 machines du
  // coffre, et marqué brûlées 4 381 autres qui restent pourtant dans des
  // portefeuilles, avec leur poids sur la chaîne — c'est l'équipe qui dit
  // qu'elles ne pèseront plus. Le coffre, lui, peut ressortir ce qu'il garde.
  // La phrase compte les trois séparément plutôt que de les fondre en une perte.
  const marked = d.collection?.burned ?? 0;
  const bits = !f ? [] : [
    f.dead ? `${fmtInt(f.dead)} went to a dead address, where nothing comes back` : null,
    marked ? `${fmtInt(marked)} more were marked burned in the Meltdown and still sit in ` +
      `wallets — the team says they will never carry weight again` : null,
    d.collection?.dark ? `${fmtInt(d.collection.dark)} were forged into Dark Machines` : null,
    d.collection?.blue ? `${fmtInt(d.collection.blue)} went Blue in the Blue mint` : null,
    f.vault ? (f.vault === 1
      ? `1 sits in the Proton's vault, which can send it back out`
      : `${fmtInt(f.vault)} sit in the Proton's vault, which can send them back out`) : null,
  ].filter(Boolean);
  const gone = !f ? "" :
    bits.length
      ? ` ${fmtInt(f.minted)} were minted: ${bits.join("; ")}.`
      : ` All ${fmtInt(f.minted)} ever minted are still in circulation.`;

  const said = b
    ? `<p>The $PRINTER is the part that burns: ${fmtInt(Math.round(b.burned))} of the ` +
      `${fmtInt(b.minted)} ever minted are gone for good` +
      (b.ink ? `, ${fmtInt(Math.round(b.ink))} of it as ink to switch Machines on` : "") +
      `, and there is no way to mint more.` +
      // Le terminal officiel affiche 55,7 % : le même burn, rapporté à ce qui
      // reste plutôt qu'à ce qui a été frappé. Le 2026-09-26, des porteurs ont
      // cru l'un des deux chiffres faux. Les deux sont justes ; la page dit
      // lequel est lequel au lieu de laisser choisir entre deux vérités.
      (b.supply ? ` Measured against the ${fmtInt(Math.round(b.supply))} that remain rather than ` +
        `everything minted, that burn is <b>${fmtRatio(b.burned / b.supply)}</b> — the figure the ` +
        `official site shows.` : "") +
      `${gone}</p>`
    : `<p>Burning $PRINTER is how a Machine is switched on, and none of it ever ` +
      `comes back.${gone}</p>`;

  // Le meilleur retour du carnet, en vitrine. Cette moitié de la boîte était
  // vide sur un écran large — et la question qu'elle laissait sans réponse est
  // justement celle qu'on vient poser.
  // Jamais une brûlée : le 2026-09-23, sur le banc, la vitrine a mis en avant
  // une machine du Meltdown à « $0.00 a drop » parce que les actions qu'elle
  // transporte, rapportées à son prix bradé, faisaient 9,8 %. Une vitrine de
  // retour qui ne rapporte rien ment par sa place.
  const best = pickMachines(d, { sort: "back", limit: Infinity }).find((m) => !m.burned && !m.dark && !m.blue);

  // Le pot entre dans la rangée plutôt que de la suivre. Posé dessous, il
  // attendait que la colonne la plus haute ait fini — la vitrine — et laissait
  // un trou au milieu de l'ouverture. Il reste après la vitrine dans le
  // document : sur un téléphone, la réponse doit venir avant le décor.
  return `<div class="hero">` +
    `<div class="hero-cols"><div class="hero-said">` + head + said + `</div>` +
    (best ? bestPick(best, d) : "") + potNote(d) + `</div>` +
    floorsHtml(d, active) + `</div>`;
}

/**
 * La machine qui rend le plus par dollar dépensé.
 *
 * Le classement plus bas répond à « laquelle » ; celle-ci répond à « et si je
 * ne veux qu'une réponse ». Le taux est écrit en toutes lettres — c'est ce que
 * « best return » veut dire, et ça ne se devine pas d'un prix et d'un montant.
 */
export function bestPick(m, d) {
  if (!m?.cost || !m.back) return "";
  const rate = m.back / m.cost;
  return `<a class="pick" href="${itemUrl(m.tokenId)}" target="_blank" rel="noopener">` +
    `<span class="pick-lab">Best return on the book</span>` +
    (m.machine?.image
      ? `<img class="pick-art" src="${esc(m.machine.image)}" alt="" loading="lazy">`
      : `<span class="pick-art pick-noart"></span>`) +
    `<span class="pick-id">#${m.tokenId} &middot; ${esc(m.classLabel ?? "")}</span>` +
    `<span class="pick-price">${m.priceUsd === null ? fmtEth(m.priceEth) : fmtUsdRound(m.priceUsd)}` +
      `<small>${fmtEth(m.priceEth)} ETH</small></span>` +
    `<span class="pick-back">${fmtUsd(m.epochUsd ?? 0)} a drop` +
      `<small>${fmtRatio(rate)} of what it costs, every drop</small></span></a>`;
}

/**
 * Ce que le pot contient, et ce qu'on en touchera quand.
 *
 * Le protocole le coupe en deux, et la distinction vaut de l'argent : `locked`
 * est la part que le vote en cours est en train de diviser, `building` est ce
 * qui s'accumule pour le tirage suivant. Une machine allumée aujourd'hui ne
 * touche pas la première — elle ne compte qu'à partir de l'epoch d'après, donc
 * c'est la seconde qui la concerne.
 */
export function potNote(d) {
  const o = d?.official;
  if (!o?.potUsd) return "";
  const split = o.lockedUsd && o.buildingUsd
    ? ` <b>${fmtUsdShort(o.lockedUsd)}</b> of it is locked for this drop and the vote is ` +
      `dividing it now; <b>${fmtUsdShort(o.buildingUsd)}</b> is building toward the next one — ` +
      `which is the half a Machine lit today will share in.`
    : "";
  const paid = o.distributedUsd
    ? ` <b>${fmtUsdShort(o.distributedUsd)}</b> has already been paid out in earlier drops.`
    : "";
  // On relaie un chiffre qu'on ne dérive pas : quand il cesse de tenir contre
  // ce qu'on lit soi-même, on le dit plutôt que de le répéter.
  const warn = o.check?.disagrees
    ? ` <b>These two do not agree right now</b> — we read ${fmtUsdShort(o.check.swapperUsdg)} of ` +
      `converted USDG, which cannot exceed the pot it belongs to.`
    : "";
  return `<p class="pot-note">The pot holds <b>${fmtUsdShort(o.potUsd)}</b>.${split}${paid}${warn}</p>`;
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
  // Les brûlées du Meltdown se vendent aussi, et un bloc qui n'aurait qu'elles
  // doit apparaître : c'est le seul prix de la classe qu'on peut payer.
  const listedIn = (r) => (r.inked?.listed ?? 0) + (r.dormant?.listed ?? 0) + (r.burned?.listed ?? 0);
  const rows = (d?.rows ?? []).filter((r) => listedIn(r) > 0);
  const dk = d?.darkBook;
  const bk = d?.blueBook;
  if (!rows.length && !dk?.supply && !bk?.supply) return "";
  const money = (e) => (e && eth ? fmtUsdRound(e * eth) : e ? `${fmtEth(e)} ETH` : "—");

  return `<div class="floors"><span class="floors-lab">Cheapest by class — tap one to filter</span>` +
    `<div class="floors-row">` +
    `<button type="button" class="fl fl-all" data-k="" aria-pressed="${active ? "false" : "true"}">` +
      `<b>All</b><u>${fmtInt(rows.reduce((a, r) => a + listedIn(r), 0) + (dk?.listed ?? 0) + (bk?.listed ?? 0))} listed</u>` +
    `</button>` +
    rows.map((r) =>
      `<button type="button" class="fl" data-k="${esc(r.classLabel)}" ` +
      `aria-pressed="${active === r.classLabel ? "true" : "false"}">` +
      `<span class="fl-cls">${esc(r.classLabel)}</span>` +
      `<b>${money(r.inked?.floorEth)}</b>` +
      `<u>${r.inked?.floorEth ? "printing" : "none printing"}</u>` +
      // Les autres états en dessous, étiquette d'abord, prix ensuite. Écrit
      // « $46 burned », le 2026-09-23, la ligne se lisait « 46 $ brûlés » —
      // un montant détruit, pas un prix d'achat. Et « none dormant » répété
      // sept fois, quand il n'en reste que deux, ne disait plus rien : un état
      // sans annonce n'a pas de ligne, il n'a pas de prix inventé non plus.
      (r.dormant?.floorEth
        ? `<span class="fl-alt"><i>dormant</i>${money(r.dormant.floorEth)}</span>` : "") +
      (r.burned?.floorEth
        ? `<span class="fl-alt fl-burned"><i>burned</i>${money(r.burned.floorEth)}</span>` : "") +
      `</button>`).join("") +
    // Les Dark Machines en dernier bloc : un marché à part, une vingtaine de
    // machines, pas une classe de plus. Montré dès qu'il en existe une, même
    // sans annonce : le jour de l'ouverture aucune n'était en vente, et une
    // catégorie absente de la rangée n'existe pas pour qui la lit.
    (dk?.supply
      ? `<button type="button" class="fl fl-dark" data-k="${DARK_LABEL}" ` +
        `aria-pressed="${active === DARK_LABEL ? "true" : "false"}">` +
        `<span class="fl-cls">Dark</span><b>${dk.listed ? money(dk.floorEth) : "—"}</b>` +
        `<u>${dk.listed ? `${fmtInt(dk.listed)} of ${fmtInt(dk.supply)}` : `none of ${fmtInt(dk.supply)}`} for sale</u></button>`
      : "") +
    // Les Blue à côté des Dark : même logique, leur couleur à elles.
    (bk?.supply
      ? `<button type="button" class="fl fl-blue" data-k="${BLUE_LABEL}" ` +
        `aria-pressed="${active === BLUE_LABEL ? "true" : "false"}">` +
        `<span class="fl-cls">Blue</span><b>${bk.listed ? money(bk.floorEth) : "—"}</b>` +
        `<u>${bk.listed ? `${fmtInt(bk.listed)} of ${fmtInt(bk.supply)}` : `none of ${fmtInt(bk.supply)}`} for sale</u></button>`
      : "") +
    `</div></div>`;
}

/**
 * Six chiffres, et chacun porte la couleur de ce qu'il classe.
 *
 * Ils étaient quatre. Le prix du $PRINTER manquait, alors que c'est lui qui
 * décide de ce que coûte un allumage — la case « to switch one on » bougeait
 * de trente pour cent en deux jours sans que rien n'explique pourquoi. Et la
 * capitalisation manquait aussi, alors que le jeton est le carburant de tout.
 */
/**
 * Une dormante est-elle à vendre quelque part — OpenSea ou rayon de l'Anvil ?
 *
 * Le Meltdown du 2026-09-23 a brûlé toutes les machines sous 2x : il en restait
 * deux dormantes, deux x10 du même porteur, et aucune en vente. Le filtre
 * « Dormant » ouvrait un carnet vide et « to switch one on » chiffrait un
 * achat impossible. Les deux s'effacent tant que rien ne se vend dormant, et
 * reviennent d'eux-mêmes : le de-ink (~$7) rendort une machine quand on veut.
 */
export function dormantOnSale(d) {
  return (d?.rows ?? []).some((r) => (r.dormant?.listed ?? 0) > 0 || (r.dormant?.anvilEntries?.length ?? 0) > 0);
}

export function statsHtml(d) {
  if (!d) return "";
  const x1 = (d.rows ?? []).find((r) => r.classValue === 100);
  const cheapest = x1?.inked?.floorEth && d.eth?.usd ? x1.inked.floorEth * d.eth.usd : null;
  const p = d.printer ?? {};
  const cap = p.marketCap ?? p.fdv ?? null;

  const cell = (cls, value, label, sub = "") =>
    `<div class="st ${cls}"><b>${value}</b><u>${label}</u>` +
    (sub ? `<i>${sub}</i>` : "") + `</div>`;

  // Le prix du jeton a été retiré : ce qui compte à quelqu'un qui achète, c'est
  // ce que l'allumage lui coûte — et cette case-là est juste à côté, déjà
  // convertie. Le cours brut ne servait qu'à expliquer ses variations.
  //
  // L'ordre suit celui des questions : combien tournent, combien attend,
  // combien coûte d'entrer, combien d'allumer — et la taille du marché du
  // jeton en dernier, parce que c'est un contexte, pas une décision.
  return [
    cell("st-live", fmtInt(d.totals?.inked ?? 0), "printing now"),
    cell("st-pot", fmtUsdShort(d.official?.potUsd ?? d.pot?.usd ?? 0), "in the pot"),
    // Le jaune dit ce qu'on paie : le prix d'entrée en est un. La case restait
    // grise tant que « to switch one on » tenait ce rôle ; elle est partie avec
    // les dormantes, et deux cases grises en fin de ligne se lisaient éteintes.
    cell("st-cost", cheapest === null ? "—" : fmtUsdRound(cheapest), "cheapest way in"),
    dormantOnSale(d)
      ? cell("st-cost", d.ink?.activationTotalUsd ? fmtUsdRound(d.ink.activationTotalUsd) : "—", "to switch one on")
      : "",
    cell("st-fuel", cap === null ? "—" : fmtBig(cap), "$PRINTER market"),
  ].join("");
}

/** Un montant à l'échelle du million, écrit court. « $2,915,894 » dans une
 *  case de cent pixels se lit moins vite que « $2.9M ». */
export function fmtBig(v) {
  if (v === null || v === undefined) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return fmtUsdShort(v);
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
export const STATES = Object.freeze([
  { key: "lit", label: "Printing" },
  { key: "dormant", label: "Dormant" },
  // Le Meltdown du 2026-09-23 : marquées brûlées, toujours en vente. Un troisième
  // état, pas une variante des deux autres — on ne l'allume pas, et l'équipe
  // annonce qu'elle ne portera plus de poids.
  { key: "burned", label: "Burned" },
  // Le Rituel noir du 2026-09-23 : quatre brûlées pour en forger une. Une case
  // pour toute la collection, pas une par classe — elles sont une vingtaine.
  { key: "dark", label: "Dark" },
  // Le mint Blue du 2026-09-28 : trois brûlées pour une machine remise par le
  // contrat Blue. Une case pour la collection, comme les Dark.
  { key: "blue", label: "Blue" },
]);

/** Les cases d'une ligne, dans l'ordre de la page, avec leur état. */
const cellsOf = (r) => [["lit", r.inked], ["dormant", r.dormant], ["burned", r.burned], ["dark", r.dark], ["blue", r.blue]];

/** Les lignes du carnet, plus celle des Dark Machines, qui n'a pas de classe :
 *  elle se filtre comme une classe, sous le nom « Dark ». */
export const DARK_LABEL = "Dark";
export const BLUE_LABEL = "Blue";
const boardRows = (d) => [
  ...(d?.rows ?? []),
  ...(d?.darkBook ? [{ classValue: null, classLabel: DARK_LABEL, dark: d.darkBook }] : []),
  ...(d?.blueBook ? [{ classValue: null, classLabel: BLUE_LABEL, blue: d.blueBook }] : []),
];

export function pickMachines(d, { klass = null, state = null, limit = 24, sort = SORTS[0].key } = {}) {
  const eth = d?.eth?.usd;
  const light = d?.ink?.activationTotalUsd ?? 0;
  const out = [];
  // Une machine ne peut pas être à vendre à deux endroits à la fois. L'anvil
  // possède ce qu'il met en rayon, donc une annonce OpenSea sur la même
  // machine est une annonce que son ancien propriétaire n'a pas retirée — elle
  // ne peut plus être exécutée. La montrer ferait apparaître la même machine
  // deux fois, à deux prix, dont un imaginaire.
  const onShelf = new Set();
  for (const r of boardRows(d)) {
    for (const [, cell] of cellsOf(r)) {
      for (const e of cell?.anvilEntries ?? []) onShelf.add(e.tokenId);
    }
  }
  // Choisir « Dark », c'est choisir un état : le filtre « Printing » par défaut
  // n'y laissait rien, et le bloc Dark ouvrait sur un carnet vide.
  if (klass === DARK_LABEL || klass === BLUE_LABEL) state = null;
  for (const r of boardRows(d)) {
    if (klass && r.classLabel !== klass) continue;
    for (const [key, cell] of cellsOf(r)) {
      if (state && key !== state) continue;
      if (!cell) continue;
      const lit = key === "lit";
      const burned = key === "burned";
      const dark = key === "dark";
      const blue = key === "blue";
      // Une brûlée ne s'allume pas : son coût ne porte pas l'allumage.
      const toLight = key === "dormant" ? light : 0;
      for (const e of cell?.entries ?? []) {
        if (onShelf.has(e.tokenId)) continue;
        const priceUsd = eth ? e.priceEth * eth : null;
        const cost = priceUsd === null ? null : priceUsd + toLight;
        const back = (e.epochUsd ?? 0) + (e.holds?.usd ?? 0);
        out.push({ ...e, lit, burned, dark, blue, classLabel: r.classLabel, priceUsd, cost, back,
          ratio: cost ? back / cost : 0, from: "opensea" });
      }
      // Le rayon de l'anvil. Ces machines sont achetables et n'apparaissaient
      // nulle part : elles ne sont pas sur OpenSea, elles se paient en $PRINTER
      // au terminal du protocole. Les taire revenait à cacher une partie du
      // marché à quelqu'un venu comparer les prix.
      for (const e of cell?.anvilEntries ?? []) {
        const priceUsd = e.askUsd ?? null;
        const cost = priceUsd === null ? null : priceUsd + toLight;
        const back = burned || dark || blue ? (e.holds?.usd ?? 0) : (e.epochUsd ?? 0) + (e.holds?.usd ?? 0);
        out.push({ ...e, lit, burned, dark, blue, classLabel: r.classLabel,
          priceEth: e.askEth ?? null, priceUsd, cost, back,
          ratio: cost ? back / cost : 0, from: "anvil" });
      }
    }
  }
  // Deux façons d'entrer dans un carnet, et elles ne montrent pas les mêmes
  // machines. Le retour met les allumées devant, forcément : une dormante rend
  // zéro. Sans le tri par prix, aucune dormante n'apparaîtrait jamais — et
  // c'est justement l'entrée la moins chère.
  // Le tri par prix compare des dollars, pas des ETH : le rayon de l'anvil est
  // libellé en $PRINTER, et deux monnaies ne se classent pas l'une contre
  // l'autre sans passer par une troisième.
  const by = sort === "cheap"
    ? (a, b) => (a.priceUsd ?? Infinity) - (b.priceUsd ?? Infinity)
    : (a, b) => b.ratio - a.ratio;
  return out.sort(by).slice(0, limit);
}

/** Une machine, une carte, un seul geste : aller l'acheter. */
export function cardHtml(m, { light = 0 } = {}) {
  const reinked = m.inkMult > 1.0001 && m.weight;
  // L'état se lit sur l'image, avant même le prix. Il était en bas de carte,
  // sous deux lignes de chiffres : on scrutait quatre vignettes avant de savoir
  // laquelle travaille.
  const art =
    `<span class="card-frame">` +
    (m.machine?.image
      ? `<img class="card-art" src="${esc(m.machine.image)}" alt="" loading="lazy">`
      : `<span class="card-noart"></span>`) +
    (m.dark
      ? `<span class="card-state dark">Dark</span>`
      : m.blue
      ? `<span class="card-state blue">Blue</span>`
      : m.burned
      ? `<span class="card-state burned">Burned</span>`
      : `<span class="card-state${m.lit ? "" : " off"}">${m.lit ? "Printing" : "Dormant"}</span>`) +
    (m.from === "anvil" ? `<span class="card-from">Anvil</span>` : "") +
    `</span>`;
  // Lime : cette machine imprime. Une dormante n'en porte aucune trace, et
  // c'est l'information elle-même.
  const earns = m.dark
    ? `<span class="card-earn off">no weight — paid outside the pot</span>`
    : m.blue
    ? `<span class="card-earn off">Blue — art revealed at mint</span>`
    : m.burned
    ? `<span class="card-earn off">burned in the Meltdown</span>`
    : m.lit
    ? `<span class="card-earn">${fmtUsd(m.epochUsd ?? 0)} a drop</span>`
    : `<span class="card-earn off">${light ? `${fmtUsdRound(light)} to switch on` : "no ink"}</span>`;
  const price = m.priceUsd === null || m.priceUsd === undefined
    ? fmtEth(m.priceEth)
    : fmtUsdRound(m.priceUsd);
  // Deux marchés, deux monnaies, deux liens. Une machine du rayon se paie en
  // $PRINTER au terminal du protocole : envoyer quelqu'un sur OpenSea pour
  // l'acheter serait l'envoyer sur une page où elle n'est pas en vente.
  const anvil = m.from === "anvil";
  const sub = anvil
    ? `${fmtInt(Math.round(m.askPrinter ?? 0))} $PRINTER`
    : m.priceEth ? `${fmtEth(m.priceEth)} ETH` : "";

  return `<a class="card" data-id="${m.tokenId}" href="${anvil ? ANVIL_URL : itemUrl(m.tokenId)}" ` +
    `target="_blank" rel="noopener">` +
    art +
    `<span class="card-body">` +
      `<span class="card-id">#${m.tokenId} &middot; ${esc(m.classLabel ?? "")}` +
        `${reinked ? ` <span class="re">re-inked</span>` : ""}</span>` +
      `<span class="card-price">${price}` +
        (sub ? `<small>${sub}</small>` : "") + `</span>` +
      earns +
      // Une poussière d'action s'affichait « carrying $0.00 » : sous un centime, on se tait.
      (m.holds?.usd >= 0.005 ? `<span class="card-inside">carrying ${fmtUsd(m.holds.usd)} of stock</span>` : "") +
    `</span></a>`;
}

/** Les classes en pastilles, et le tri sur sa propre ligne. */
/**
 * Le tri et l'état. La classe, elle, se choisit sur les blocs de plancher.
 *
 * Un bouton par état : aucun enfoncé montre tout, un enfoncé ne montre que
 * celui-là, et le renfoncer revient à tout. Un bouton « All » de plus ferait
 * une rangée de six pour une question qui en compte trois.
 */
export function chipsHtml(d, active, sort = SORTS[0].key, state = null) {
  const sorts = SORTS.map((o) =>
    `<button type="button" data-s="${o.key}" aria-pressed="${sort === o.key ? "true" : "false"}">${
      esc(o.label)}</button>`).join("");
  const states = STATES.filter((o) => o.key !== "dormant" || dormantOnSale(d)).map((o) =>
    `<button type="button" data-st="${o.key}" aria-pressed="${state === o.key ? "true" : "false"}">${
      esc(o.label)}</button>`).join("");
  return `<div class="chips-row">` +
    `<div class="chips chips-sort">${sorts}</div>` +
    `<div class="chips chips-state">${states}</div></div>`;
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
  // Deux marchés, deux monnaies, deux liens. Une machine du rayon se paie en
  // $PRINTER au terminal du protocole ; le panneau d'une machine du rayon qui
  // afficherait un prix en ETH et un bouton OpenSea enverrait l'acheteur sur
  // une page où elle n'est pas en vente.
  const shelf = m.from === "anvil";
  const price = shelf
    ? (m.askUsd !== null && m.askUsd !== undefined ? fmtUsdRound(m.askUsd) : fmtEth(m.askEth))
    : (usd(m.priceEth) ?? fmtEth(m.priceEth));
  const sub = shelf
    ? `${fmtInt(Math.round(m.askPrinter ?? 0))} $PRINTER at the Anvil`
    : m.priceEth ? `${fmtEth(m.priceEth)} ETH on OpenSea` : "";

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
        (m.blue && !m.dark
          ? `<span class="card-earn off">Blue Machine — no drop from the pot</span>`
          : m.dark
          ? `<span class="card-earn off">${m.machine?.ritualId
              ? `Forged in Dark Ritual #${m.machine.ritualId}`
              : "Marked Dark — no ritual on chain"}</span>`
          : m.burned
          ? `<span class="card-earn off">Burned in the Meltdown</span>`
          : m.lit
          ? `<span class="card-earn">${fmtUsd(m.epochUsd ?? 0)} a drop</span>`
          : `<span class="card-earn off">Not printing</span>`) +
        `<div class="d-price">${price}` +
          (sub ? `<small>${sub}</small>` : "") + `</div>` +
        `<a class="d-buy" href="${shelf ? ANVIL_URL : itemUrl(m.tokenId)}" target="_blank" rel="noopener">` +
          `${shelf ? "Open the Anvil" : "Open on OpenSea"} &rarr;</a>` +
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
    // Sur une machine du rayon, l'anvil est le vendeur : annoncer ce qu'il en
    // donnerait au même endroit que son prix de vente n'aurait aucun sens.
    (m.anvilBidEth && !shelf
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
export function walletHtml(w, { light = 0 } = {}) {
  if (!w) return "";
  if (w.pending) return `<p class="note" style="margin-top:22px">Reading the chain…</p>`;
  if (w.error) return `<p class="note" style="margin-top:22px">${esc(w.error)}</p>`;
  if (!w.machines?.length) {
    return `<p class="note" style="margin-top:22px">That address holds no Machine.</p>`;
  }

  const wo = w.worth;
  const earning = w.machines.filter((m) => m.weight && !m.burned && !m.dark && !m.blue).length;
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
    lit: Boolean(m.weight) && !m.burned && !m.dark && !m.blue,
    burned: Boolean(m.burned),
    dark: Boolean(m.dark),
    blue: Boolean(m.blue),
    epochUsd: m.epochUsd,
    holds: m.holds,
    priceEth: null,
    priceUsd: wo?.lines?.find((l) => l.tokenId === m.tokenId)?.machineUsd ?? null,
  }, { light })).join("");

  return stats + parts + unpaidHtml(w.unpaid) + `<div class="grid">${cards}</div>`;
}

/**
 * Les parts de drop jamais versées.
 *
 * Le 2026-09-03, le contrat de drop a enregistré une part pour chaque machine
 * et en a oublié 193 au versement. Le porteur ne peut pas la réclamer — seul
 * le keeper du protocole pousse — et le contrat n'avait plus de quoi payer.
 * Le dire à celui que ça concerne, sans en faire un drame : une ligne.
 */
export function unpaidHtml(u) {
  if (!u?.lines?.length) return "";
  const what = (l) => l.amount === null
    ? `#${l.tokenId}: a share`
    : `#${l.tokenId}: ${String(Number(l.amount.toFixed(4)))} ${esc(l.symbol)}` +
      (l.usd !== null && l.usd !== undefined ? ` (~${fmtUsd(l.usd)})` : "");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = u.date ? new Date(u.date + "T00:00:00Z") : null;
  const when = day ? `the ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} drop` : `drop round ${u.round}`;
  return `<p class="unpaid">Still owed from ${when}, never sent: ${u.lines.map(what).join(", ")}. ` +
    `Only the protocol's keeper can send it` +
    (u.funded === false ? ` — and the drop contract holds none of it right now.` : ".") + `</p>`;
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
/**
 * Les paliers du plafond de poids, tels que la doc officielle les publie : le
 * multiplicateur maximal monte avec l'encre brûlée par toute la flotte. Vérifié
 * le 2026-09-24 : `multiplierCeiling` = 200 (2×) à 57,5 M d'encre, alors que
 * le total brûlé toutes sources confondues dépassait déjà 70 M — c'est bien
 * l'encre qui compte, pas le total. `null` : plus de plafond.
 */
export const CEILING_GATES = Object.freeze([
  [25_000_000, 2], [60_000_000, 3], [100_000_000, 4], [150_000_000, null],
]);

/** Le prochain palier au-dessus de l'encre déjà brûlée, ou null s'il n'y en a plus. */
export function nextGate(inkBurned) {
  if (inkBurned === null || inkBurned === undefined || !Number.isFinite(inkBurned)) return null;
  const g = CEILING_GATES.find(([at]) => at > inkBurned);
  return g ? { at: g[0], mult: g[1], left: g[0] - inkBurned } : null;
}

export function stepsHtml(d) {
  const activation = d?.ink?.activationTotalUsd;
  const printing = d?.totals?.inked;
  // Dix mille frappées, mais le Meltdown du 2026-09-23 a brûlé tout ce qui
  // était sous 2× : « Ten thousand exist » ne décrivait plus ce qu'on achète.
  const buy = ["You buy a Machine",
    `Ten thousand were minted` +
    (printing ? `; <b>${fmtInt(printing)}</b> still print today — the Meltdown burned those below 2×` : "") +
    `. Two things about each are sealed forever: its <b>class</b> — x1 up to x10 — and its ` +
    `<b>desk</b>, one of sixteen, which decides which stock it earns double on.`];
  // Sans dormante à vendre, « l'allumer » ne concerne plus aucun acheteur ; ce
  // qui reste à faire d'une machine achetée, c'est l'alourdir.
  const ceiling = Number(d?.protocol?.ceiling);
  const ink = d?.burn?.ink ?? null;
  const gate = nextGate(ink);
  const heavier = ["You make it heavier",
    `Every Machine for sale already prints — the Meltdown burned the ones that did not. Burning ` +
    `more $PRINTER into one raises its weight, up to a ceiling the whole fleet unlocks together` +
    (ceiling ? `: <b>${fmtExact(ceiling / 100)}× today</b>` : "") +
    (gate ? (gate.mult
      ? `, ${gate.mult}× once ${fmtInt(gate.at / 1e6)}M has gone in as ink — ${fmtBig(gate.left).replace("$", "")} to go`
      : `, and no ceiling at all once ${fmtInt(gate.at / 1e6)}M has gone in as ink`) : "") +
    `. That $PRINTER is destroyed and never comes back.`];
  const switchOn = ["You switch it on",
    `A Machine with no ink earns nothing and votes on nothing. Burning <b>5,000 $PRINTER</b>` +
    (activation ? ` — about ${fmtUsdRound(activation)} today` : "") +
    ` switches it on. That $PRINTER is destroyed and never comes back.`];
  const steps = [
    buy,
    dormantOnSale(d) ? switchOn : heavier,
    ["It counts from the next drop",
     `Ink burned during an epoch — to switch a Machine on or to make it heavier — takes no part in ` +
     `the pot already waiting. It counts from the following one, so a late top-up cannot grab a ` +
     `drop already earned.`],
    ["The protocol collects fees and buys real stock",
     `Every sale, every trade, every fusion pays into one pot. When the vote closes, the winning ` +
     `desk's stock is bought — NVDA, AAPL, AMD — and lands <b>inside each Machine's own wallet</b>, ` +
     `split by weight among the Machines that still earn.`],
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
/**
 * Le Rituel noir, tel que la chaîne l'enregistre.
 *
 * La même règle que pour le Proton : publier le taux annoncé et le taux
 * observé côte à côte, et nommer ce que le statut publié affirme sans que la
 * chaîne le montre — la #23, Dark sans rituel, le jour de l'ouverture.
 */
export function ritualHtml(r) {
  if (!r) return `<p class="note">Not read yet — the ritual's logs are walked from the day it opened.</p>`;
  const st = (cls, val, label) => `<div class="st ${cls}"><b>${val}</b><u>${label}</u></div>`;
  const done = r.won + r.lost;
  return `<div class="stats">` +
    st("st-book", fmtInt(r.forged), "Dark Machines forged") +
    st("st-book", fmtInt(r.fuelBurned), "burned Machines fed to it") +
    st("st-cost", fmtInt(Math.round(r.printerBurned)), "$PRINTER burned") +
    st("st-book", r.winRate === null ? "—" : fmtRatio(r.winRate), "of rituals won") +
    `</div>` +
    `<div class="prose"><p>Four Machines burned in the Meltdown go to the dead address, and a fifth — ` +
    `the vessel — is played on a hundred-spin slot. Win and the vessel becomes a <b>Dark Machine</b>; ` +
    `lose and all five are gone. The team claims <b>${fmtRatio(r.claimedWinRate)}</b> success; ` +
    `so far <b>${fmtInt(r.won)}</b> of ${fmtInt(done)} settled rituals were won` +
    (r.pending ? `, and ${fmtInt(r.pending)} ${r.pending === 1 ? "is" : "are"} still being played` : "") + `.</p>` +
    `<p>A Dark Machine carries no weight in the pot. The team says it earns <b>10×</b> on the ` +
    `revenue of printer.fun and its games instead — a promise made off-chain, which nothing on this ` +
    `page can measure yet.</p>` +
    (r.unforged?.length
      ? `<p>${r.unforged.map((id) => `#${id}`).join(", ")} ${r.unforged.length === 1 ? "is" : "are"} ` +
        `listed as Dark by the team without a ritual on chain.</p>`
      : "") +
    `</div>`;
}

/**
 * Toutes les Dark Machines, en vente ou non.
 *
 * Le carnet ne montre que ce qui se vend ; le jour de l'ouverture rien ne se
 * vendait, et la catégorie n'avait aucun visage. Une carte par machine, qui
 * mène à sa page OpenSea — sans `data-id`, donc sans panneau de détail : le
 * panneau parle d'une annonce, et la plupart n'en ont pas.
 */
export function darkGalleryHtml(d) {
  const fleet = d?.darkFleet ?? [];
  if (!fleet.length) return "";
  const eth = d?.eth?.usd;
  const onSale = fleet.filter((m) => m.priceEth !== null && m.priceEth !== undefined).length;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null);
  const cards = fleet.map((m) => {
    const sale = m.priceEth !== null && m.priceEth !== undefined;
    return `<a class="card" href="${itemUrl(m.tokenId)}" target="_blank" rel="noopener">` +
      `<span class="card-frame">` +
      (m.image
        ? `<img class="card-art" src="${esc(m.image)}" alt="" loading="lazy">`
        : `<span class="card-noart"></span>`) +
      `<span class="card-state dark">Dark</span></span>` +
      `<span class="card-body">` +
        `<span class="card-id">#${m.tokenId} &middot; ${m.ritualId ? `ritual #${m.ritualId}` : "no ritual on chain"}</span>` +
        `<span class="card-price">${sale ? (eth ? fmtUsdRound(m.priceEth * eth) : `${fmtEth(m.priceEth)} ETH`) : "Not for sale"}` +
          (sale && eth ? `<small>${fmtEth(m.priceEth)} ETH</small>` : "") + `</span>` +
        (m.owner ? `<span class="card-inside">held by ${esc(short(m.owner))}</span>` : "") +
      `</span></a>`;
  }).join("");
  return `<h3 class="sec" style="margin-top:40px">Every Dark Machine</h3>` +
    `<p class="sub">${fmtInt(fleet.length)} exist, ${onSale ? `${fmtInt(onSale)} for sale` : "none for sale right now"}. ` +
    `Each one cost four burned Machines and a won ritual.</p>` +
    `<div class="grid">${cards}</div>`;
}

/**
 * Toutes les Blue Machines, en vente ou non — la même galerie que les Dark.
 * Leur œuvre n'est révélée qu'au mint : tant qu'elle ne l'est pas, OpenSea
 * montre ce qu'il a.
 */
export function blueGalleryHtml(d) {
  const fleet = d?.blueFleet ?? [];
  if (!fleet.length) return "";
  const eth = d?.eth?.usd;
  const onSale = fleet.filter((m) => m.priceEth !== null && m.priceEth !== undefined).length;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null);
  const cards = fleet.map((m) => {
    const sale = m.priceEth !== null && m.priceEth !== undefined;
    return `<a class="card" href="${itemUrl(m.tokenId)}" target="_blank" rel="noopener">` +
      `<span class="card-frame">` +
      (m.image ? `<img class="card-art" src="${esc(m.image)}" alt="" loading="lazy">` : `<span class="card-noart"></span>`) +
      `<span class="card-state blue">Blue</span></span>` +
      `<span class="card-body">` +
        `<span class="card-id">#${m.tokenId} &middot; Blue</span>` +
        `<span class="card-price">${sale ? (eth ? fmtUsdRound(m.priceEth * eth) : `${fmtEth(m.priceEth)} ETH`) : "Not for sale"}` +
          (sale && eth ? `<small>${fmtEth(m.priceEth)} ETH</small>` : "") + `</span>` +
        (m.owner ? `<span class="card-inside">held by ${esc(short(m.owner))}</span>` : "") +
      `</span></a>`;
  }).join("");
  const mint = d?.blueMint;
  return `<h3 class="sec" style="margin-top:40px">Every Blue Machine</h3>` +
    `<p class="sub">${fmtInt(fleet.length)} exist, ${onSale ? `${fmtInt(onSale)} for sale` : "none for sale right now"}` +
    (mint ? ` — ${fmtInt(mint.minted)} of ${fmtInt(mint.supply)} minted` : "") +
    `. Each one cost three burned Machines, $PRINTER and ETH; its art is revealed at mint.</p>` +
    `<div class="grid">${cards}</div>`;
}

/** Le compteur des Blue, à côté de celui des Dark. */
export function blueCountHtml(d) {
  const n = d?.collection?.blue;
  if (!n) return "";
  const mint = d?.blueMint;
  return `<span class="dc-num">${fmtInt(n)}</span>` +
    `<span class="dc-txt"><b>Blue Machines</b><u>${mint ? `${fmtInt(mint.minted)} of ${fmtInt(mint.supply)} minted` : "from the Blue mint"}</u></span>`;
}

/**
 * Le compteur des Dark Machines, à droite des onglets.
 *
 * Visible depuis tous les onglets : c'est la seule catégorie qui grossit à vue
 * d'œil, une partie à la fois. Le point rouge ne bat que si un rituel est en
 * train de se jouer — il dit « maintenant », pas « décoration ».
 */
export function darkCountHtml(d) {
  const n = d?.collection?.dark;
  if (!n) return "";
  const r = d.ritual;
  const done = r ? r.won + r.lost : 0;
  const sub = r && done ? `${fmtInt(r.won)} of ${fmtInt(done)} rituals won` : "forged in the Dark Ritual";
  return `<span class="dc-num">${r?.pending ? `<i class="dc-live" title="${fmtInt(r.pending)} ritual${
      r.pending === 1 ? "" : "s"} being played now"></i>` : ""}${fmtInt(n)}</span>` +
    `<span class="dc-txt"><b>Dark Machines</b><u>${sub}</u></span>`;
}

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
    `It is <b>not burned</b> by the fuse — but it leaves your wallet for good, before the ` +
    `dice even roll. The vault is owned by a single key, not a multi-signature wallet, and it ` +
    `can send any Machine it holds to any address. ` +
    // L'adresse morte n'est pas un retour : le 2026-09-23 la page comptait les
    // 3 477 machines du Meltdown comme « come back out ».
    (() => {
      const dead = p?.releasedToDead ?? 0;
      const back = (p?.released ?? 0) - dead;
      return (dead ? `${fmtInt(dead)} have left it for the dead address, most of them in the ` +
          `Meltdown of 23 September — gone for good. ` : "") +
        (back > 0 ? `${fmtInt(back)} came back out to a wallet. ` : "None has ever come back out to a wallet. ");
    })() +
    `Locked is not burned, and this page will not call it that.</p>` +
    // Le protocole annonce que le coffre allume ce qu'il garde et en partage
    // les revenus. Le compte des allumées n'a pas bougé pendant que le coffre
    // grossissait de moitié : ce n'est pas « pas encore », c'est « pas du tout,
    // et l'écart se creuse ».
    (v.dormant
      ? `<p>The protocol says the vault activates what it holds and shares the stock back to ` +
        `the fleet. <b>${fmtInt(v.dormant)} of the ${fmtInt(v.held)} are dormant</b> — they earn ` +
        `nothing, for anyone.</p>`
      : "") +
    (b?.ink === null || b?.ink === undefined ? "" :
      `<p>Of the <b>${fmtInt(b.minted)}</b> $PRINTER ever minted, ${fmtInt(Math.round(b.ink))} ` +
      `burned as ink switching Machines on, and ${fmtInt(Math.round(b.other))} burned elsewhere` +
      `${b.proton ? ` — ${fmtInt(Math.round(b.proton))} of it by the Proton` : ""}.</p>`) +
    // Le carburant vaut plus cher que ce qu'il alimente. C'est une observation
    // d'analyse, pas une donnée d'achat : elle vit ici, où l'on vient
    // comprendre, et pas sur la page où l'on vient acheter.
    (sc.market?.printerCap && sc.market?.collectionCap
      ? `<p>$PRINTER is a <b>${fmtBig(sc.market.printerCap)}</b> market. The living ` +
        `Machines it fuels are worth <b>${fmtBig(sc.market.collectionCap)}</b> all together — ` +
        `so the fuel is priced at <b>${fmtExact(sc.market.printerCap / sc.market.collectionCap)}×</b> ` +
        `the fleet it burns for. Both move on their own, and the ratio with them.</p>`
      : "") +
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
  const TABS = ["buy", "wallet", "learn"];
  // Les anciennes adresses menaient à six onglets. Un lien partagé la semaine
  // dernière ne doit pas tomber sur une page blanche.
  const MOVED = {
    market: "buy", mine: "wallet", vote: "learn",
    pad: "learn", scarcity: "learn", how: "learn", protocol: "learn",
  };

  let data = null;
  let klass = null;
  // Le carnet ouvre sur le prix : « combien ça coûte » vient avant « combien
  // ça rend », et c'est aussi le seul tri qui montre les dormantes.
  let sort = SORTS[0].key;
  // Le carnet ouvre sur ce qui imprime : une machine qui ne rapporte encore
  // rien est un autre achat, et il se demande.
  let state = STATES[0].key;
  let held = null;
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
    // Le bouton Dormant a pu disparaître depuis qu'on l'a enfoncé.
    if (state === "dormant" && !dormantOnSale(data)) state = null;
    const light = data.ink?.activationTotalUsd ?? 0;
    const picked = pickMachines(data, { klass, state, sort });
    $("hero").innerHTML = heroHtml(data, klass);
    $("chips").innerHTML = chipsHtml(data, klass, sort, state);
    $("cards").innerHTML = picked.length
      ? picked.map((m) => cardHtml(m, { light })).join("")
      : klass === DARK_LABEL
        ? `<p class="note">No Dark Machine is for sale right now — every one of them is shown below.</p>`
      : klass === BLUE_LABEL
        ? `<p class="note">No Blue Machine is for sale right now — every one of them is shown below.</p>`
        : `<p class="note">Nothing listed in that class right now.</p>`;
    $("buy-title").textContent = sort === "cheap" ? "Cheapest first" : "Most back per dollar";
    // La phrase doit décrire ce que la grille montre. « Dormant ones are
    // cheaper » sous une grille filtrée sur les allumées ne parle de rien.
    const cheapSub = klass === DARK_LABEL
      ? "Forged in the Dark Ritual. No weight, and no share of the pot — the team says they earn 10× on printer.fun and games instead."
      : klass === BLUE_LABEL
      ? "Handed out by the Blue mint for three burned Machines. Their art is revealed at mint."
      : state === "lit"
      ? "What costs least among the Machines already printing."
      : state === "dormant"
        ? "What costs least to get in. These earn nothing until someone burns ink for them."
      : state === "burned"
        ? "Marked burned in the Meltdown. The team says they will never carry weight again — they are not a way in."
      : state === "dark"
        ? "Forged in the Dark Ritual. No weight, and no share of the pot — the team says they earn 10× on printer.fun and games instead."
        : dormantOnSale(data)
          ? "What costs least to get in. Dormant ones are cheaper because they earn nothing yet."
          : "Everything for sale, cheapest first — printing, burned and Dark together.";
    $("buy-sub").textContent = sort === "cheap" ? cheapSub
      : "What each Machine returns — its share of the pot, plus the stock already sitting in it — against what it costs.";
    // Le total doit compter la même chose que la liste, filtre compris :
    // « 24 sur 757 » sous une grille filtrée sur les dormantes est faux.
    const total = pickMachines(data, { klass, state, limit: Infinity }).length;
    const of = state === "lit" ? "printing and for sale"
      : state === "dormant" ? "dormant and for sale"
      : state === "burned" ? "burned and for sale"
      : state === "dark" ? "Dark and for sale"
      : state === "blue" ? "Blue and for sale"
      : "for sale";
    $("dark-gallery").innerHTML = klass === DARK_LABEL ? darkGalleryHtml(data)
      : klass === BLUE_LABEL ? blueGalleryHtml(data) : "";
    $("more-note").textContent = picked.length && total > picked.length
      ? `Showing ${picked.length} of ${total} ${of}.` : "";
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
    for (const r of boardRows(data)) {
      for (const [key, cell] of cellsOf(r)) {
        if (!cell) continue;
        const lit = key === "lit", burned = key === "burned", dark = key === "dark";
        // Le rayon d'abord, et la même raison qu'au carnet : une annonce
        // OpenSea sur une machine que l'anvil possède est une annonce que son
        // ancien propriétaire n'a pas retirée. C'est la vignette du rayon
        // qu'on a cliquée, c'est son prix qu'il faut ouvrir.
        const shelf = (cell?.anvilEntries ?? []).find((x) => x.tokenId === tokenId);
        if (shelf) { found = { ...shelf, lit, burned, dark, classLabel: r.classLabel, from: "anvil" }; continue; }
        const e = (cell?.entries ?? []).find((x) => x.tokenId === tokenId);
        if (e) found = { ...e, lit, burned, dark, classLabel: r.classLabel, from: "opensea" };
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

  // `#dark` : le carnet filtré sur les Dark Machines, et leur galerie. Une
  // adresse plutôt qu'un seul clic, pour qu'elle se partage.
  const route = (name) => {
    if (name !== "dark" && name !== "blue") return show(name);
    klass = name === "blue" ? BLUE_LABEL : DARK_LABEL;
    state = null;
    paintBuy();
    return show("buy");
  };

  // Le compteur des Dark mène à `#dark`. Déjà dessus, le hash ne change pas et
  // aucun événement ne part : on route à la main.
  for (const name of ["dark", "blue"]) {
    $(`${name}-count`).addEventListener("click", (e) => {
      e.preventDefault();
      if (location.hash === `#${name}`) route(name);
      else location.hash = name;
      $("cards")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Le plancher d'une classe est aussi son filtre : on lit le prix, on clique.
  $("hero").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-k]");
    if (!b) return;
    klass = b.dataset.k || null;
    // Les boutons d'état doivent dire ce que la grille montre.
    if (klass === DARK_LABEL || klass === BLUE_LABEL) state = null;
    paintBuy();
  });

  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.s) sort = b.dataset.s;
    // Renfoncer le bouton actif revient à tout montrer : deux boutons, trois
    // états, et pas de troisième bouton pour dire « les deux ».
    else if (b.dataset.st) state = state === b.dataset.st ? null : b.dataset.st;
    else if ("k" in b.dataset) klass = b.dataset.k || null;
    else return;
    paintBuy();
  });

  // Le portefeuille. Aucune signature, aucune connexion : la page lit, un point.
  const lookup = async (value) => {
    if (!ADDRESS_RE.test(value)) {
      held = { error: "That is not an address — it should start with 0x and have 40 characters after it." };
      $("wallet-out").innerHTML = walletHtml(held);
      return;
    }
    held = { pending: true };
    $("wallet-out").innerHTML = walletHtml(held);
    try {
      held = await (await fetch(`/api/wallet?address=${encodeURIComponent(value)}`)).json();
    } catch {
      held = { error: "Could not reach the service. Try again in a moment." };
    }
    $("wallet-out").innerHTML = walletHtml(held, { light: data?.ink?.activationTotalUsd ?? 0 });
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
        const body = res.ok ? await res.json() : null;
        // La rareté a besoin des deux capitalisations pour les comparer, et
        // elles vivent dans le snapshot. On les lui passe plutôt que de lui
        // faire redemander ce qu'on a déjà.
        $(id).innerHTML = render(
          body && id === "scarcity"
            ? { ...body, market: {
                printerCap: data?.printer?.marketCap ?? data?.printer?.fdv ?? null,
                collectionCap: data?.collection?.marketCapUsd ?? null,
              } }
            : body,
        );
      } catch {
        extrasAt = 0;
      }
    }
  };

  let tab = route((location.hash || "").slice(1));
  if (tab === "learn") loadExtras(true);
  addEventListener("hashchange", () => {
    tab = route((location.hash || "").slice(1));
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
    const dc = darkCountHtml(data);
    $("dark-count").innerHTML = dc;
    $("dark-count").hidden = !dc;
    const bc = blueCountHtml(data);
    $("blue-count").innerHTML = bc;
    $("blue-count").hidden = !bc;
    $("ritual").innerHTML = ritualHtml(data.ritual);
    $("vote-sub").textContent =
      "Every Machine votes with its weight. The desk with the most votes takes the whole pot, bought " +
      "as its stock, and its Machines count twice on that drop — the team says a winner then sits out " +
      "the next four epochs.";
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

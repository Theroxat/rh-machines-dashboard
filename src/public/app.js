// Rendu du dashboard. Séparé du HTML pour être testable hors navigateur :
// tout ce qui fabrique du balisage est une fonction pure qui rend une chaîne,
// et le seul câblage au DOM est en bas de fichier, derrière un garde.

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

export const fmtWeightX = (weight) => {
  if (!weight) return "0x";
  const x = weight / 100;
  if (Number.isInteger(x)) return `${x}x`;
  const cut = Math.floor(x * 10) / 10;
  return `${Number.isInteger(cut) ? cut.toFixed(1) : cut}x`;
};

export const fmtUsdShort = (v) =>
  v === null || v === undefined ? "" : v >= 10000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;

/**
 * Le prix d'un point de poids — la seule mesure qui compare une classe à une
 * autre. Le poids est ce qui paie : `rareté × √(ink/4250)`. Sept floors alignés
 * ne disent donc pas où l'on achète le moins cher, parce qu'ils ne portent pas
 * la même chose. Un point vaut ici ce que porte une x1 tout juste activée.
 *
 * Une dormante ne pèse rien tant que rien n'a brûlé : son prix d'entrée réel
 * est le prix demandé plus l'activation, et son poids sera celui de sa classe.
 * L'omettre ferait passer les dormantes bon marché pour les meilleures affaires
 * du tableau, ce qu'elles ne sont pas.
 */
export function perPointUsd(e, { classValue = null, side = "ink", ethUsd = null, activationUsd = null } = {}) {
  const usd = usdOf(e?.priceEth, ethUsd);
  if (usd === null) return null;

  const dormant = side === "dormant";
  const weight = dormant ? classValue : e?.weight;
  // Sans poids connu on ne classe pas : un zéro se lirait comme « gratuit »,
  // et une machine hors classement vaut mieux qu'une machine mal classée.
  if (!weight) return null;
  // Le coût d'activation est lu, jamais supposé : il vaut 4 250 d'ink que la
  // chaîne publie plus 750 de charge que la doc seule donne. Sans lui une
  // dormante n'a pas de prix d'entrée connu, et elle sort du classement.
  if (dormant && !activationUsd) return null;

  return (usd + (dormant ? activationUsd : 0)) / (weight / 100);
}

/** Deux façons de lire le même tableau : ce que coûte la machine, ou ce que
 *  coûte ce qu'elle rapporte. La seconde réordonne tout, jusqu'aux lignes. */
export const VIEW_FLOOR = "floor";
export const VIEW_VALUE = "value";
const VIEW_LABELS = Object.freeze([
  [VIEW_FLOOR, "floor price"],
  [VIEW_VALUE, "price per weight point"],
]);

export function viewBarHtml(view) {
  const options = VIEW_LABELS
    .map(([v, label]) => `<option value="${v}"${v === view ? " selected" : ""}>${label}</option>`)
    .join("");
  return `<label class="fl view"><span class="label">View</span>` +
    `<select data-view>${options}</select></label>`;
}

/** Le contrat servi par le snapshot, pas une adresse recopiée ici. La
 *  collection migre vers un nouveau contrat ; les liens doivent suivre sans
 *  qu'on retouche la page. La valeur d'origine ne sert que de repli. */
let MACHINES = "0xb509e195bcb3e4461e235ff152c68d66915f67b5";
export const setContract = (addr) => { if (addr) MACHINES = String(addr).toLowerCase(); };
export const itemUrl = (id) => `https://opensea.io/assets/robinhood/${MACHINES}/${id}`;
/** Une machine du rayon s'achète sur l'anvil, et nulle part ailleurs : le lien
 *  mène donc là où la transaction se fait, pas sur une fiche descriptive. */
export const ANVIL_URL = "https://rh.btcmachine.gg/";
export const SWAP_URL = "https://rh.btcmachine.gg/swap";
export const anvilUrl = () => ANVIL_URL;

/** Combien de machines une case montre avant de proposer le reste. */
export const DEFAULT_LIMIT = 8;

/** La bande de tête tient sur les deux colonnes : huit vignettes y laissaient
 *  les deux tiers de la ligne vides. Ce nombre ne sert que de repli — la page
 *  mesure la bande et remplit des rangées entières. */
export const BEST_LIMIT = 20;

/** Largeur d'une vignette et écart entre deux, tels que la feuille de style les
 *  fixe. S'ils y changent, ils changent ici : la bande se compterait faux et
 *  laisserait à nouveau une orpheline en bas. */
export const CHIP_PX = 78;
export const STRIP_GAP_PX = 7;

/**
 * Combien de vignettes tiennent dans la bande, en rangées pleines.
 *
 * Vingt vignettes dans une bande qui en loge dix-neuf laissaient une orpheline
 * seule sur une seconde ligne. Un compte fixe ne peut pas convenir : la bande
 * traverse les deux colonnes, donc sa largeur suit celle de l'écran. On mesure,
 * et on n'affiche que des rangées complètes.
 */
export function bestFit({ availablePx, chipPx = CHIP_PX, gapPx = STRIP_GAP_PX, rows = 2 }) {
  if (!availablePx || availablePx <= 0) return BEST_LIMIT;
  const perRow = Math.max(1, Math.floor((availablePx + gapPx) / (chipPx + gapPx)));
  return perRow * Math.max(1, rows);
}

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

/**
 * Le bulletin, qui décide de la taille des parts du pot — donc du coefficient
 * qui s'applique par desk, par-dessus le poids.
 *
 * Trois états qu'un tableau de zéros confondrait : pas encore ouvert, ouvert et
 * vide, clos. Annoncer « 0% » avant l'ouverture ferait passer une attente pour
 * un désaveu unanime.
 */
export function ballotBlock(vote, epoch, now) {
  if (!vote) return statBlock("Ballot", "—", "unreadable right now");
  if (!vote.opened) {
    return statBlock("Ballot", "not open yet",
      `epoch ${epoch ?? "—"} · no desk has a slice until it opens`);
  }

  const voted = vote.desks.filter((x) => x.votedWeight > 0);
  if (!voted.length) return statBlock("Ballot", "no vote yet", "open, and not one machine has voted");

  const top = voted[0];
  const left = vote.closesAt && now ? vote.closesAt - now : null;
  const when = left === null ? null
    : left <= 0 ? "voting closed"
    : left < 3600000 ? `closes in ${Math.round(left / 60000)}m`
    : `closes in ${Math.round(left / 3600000)}h`;

  return statBlock("Ballot",
    `${top.desk ? esc(top.desk) : `desk ${top.index}`} ${fmtRatio(top.share)}`,
    [when, `${voted.length} of 16 desks drew votes`].filter(Boolean).join(" · "));
}

/**
 * La collection a migré vers un nouveau contrat, et le dashboard le suit.
 *
 * Quelqu'un qui arrive ici doit pouvoir vérifier en deux secondes qu'il ne
 * regarde pas les prix de la collection abandonnée. L'adresse est celle que le
 * service interroge réellement — elle vient du snapshot, pas d'une constante
 * recopiée dans la page, donc cette mention ne peut pas mentir sur ce qu'elle
 * annonce.
 */
export function migrationNote(d) {
  const c = d?.collection?.contract;
  const slug = d?.collection?.slug;
  if (!c || !slug) return "";
  const short = `${c.slice(0, 6)}…${c.slice(-4)}`;
  return `<span class="tag">New contract</span>` +
    `Tracking the migrated collection — ` +
    `<a href="https://opensea.io/collection/${esc(slug)}" target="_blank" rel="noopener">${esc(slug)}</a>` +
    ` at <b>${esc(short)}</b>. The old one is no longer followed.`;
}

export function contextHtml(d, now = null) {
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
    // L'ink et l'activation ne coûtent pas la même chose : 4 250 brûlent, 750
    // s'ajoutent sans brûler. Le bandeau annonçait le premier pendant que les
    // prix au point comptaient le second, sans que rien ne relie les deux.
    statBlock("Cost of ink", fmtUsd(ink.activationUsd),
      `${fmtInt(ink.activationPrinter)} $PRINTER burned · ${fmtEth(ink.activationEth)} ETH` +
      (ink.activationTotalPrinter
        ? ` · ${fmtInt(ink.activationTotalPrinter)} to activate (${fmtUsd(ink.activationTotalUsd)})`
        : "")),
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
    // Le pot et le poids de la flotte : les deux nombres qui transforment le
    // poids d'une machine en dollars. Sans eux le rendement affiché sur chaque
    // vignette serait un chiffre sorti de nulle part.
    statBlock("Pot waiting", d.pot?.usd ? fmtBig(d.pot.usd) : "—",
      d.pot?.fleetWeight
        ? `sell fees in USDG · split across ${fmtInt(Math.round(d.pot.fleetWeight / 100))}x of live weight`
        : "sell fees in USDG, waiting on a ballot"),
    ballotBlock(d.vote, d.protocol?.epoch, now),
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
function chip(e, { isFloor = false, ethUsd = null, anvil = false, showPrice = true, perPoint = null, classLabel = null } = {}) {
  const hw = e.machine?.headwear ? ` · ${headwearLabel(e.machine.headwear)}` : "";
  const img = e.machine?.image
    ? `<img src="${esc(e.machine.image)}" alt="Machine #${e.tokenId}" loading="lazy" width="78" height="78">`
    : `<span class="noimg" aria-hidden="true"></span>`;

  // En vue « valeur » le grand chiffre est le coût du point, et le petit reste
  // ce qu'il faut sortir pour l'acheter : sans lui la vignette classerait sans
  // jamais dire son prix.
  const price = perPoint !== null ? fmtUsdShort(perPoint)
    : anvil ? fmtInt(Math.round(e.askPrinter)) : fmtEth(e.priceEth);
  const dollars = anvil ? fmtUsdShort(e.askUsd) : fmtUsdShort(usdOf(e.priceEth, ethUsd));

  // Une machine re-inkée pèse plus que ne le dit sa ligne — vrai des deux côtés.
  // Elle est cerclée : c'est la seule anomalie utile du tableau, une x3 qui
  // pèse comme une x6 se noie sinon au milieu des x3 au même prix.
  const reinked = e.inkMult > 1.0001 && e.weight;

  // Un seul badge, et il raconte l'histoire entière.
  //
  // Il y en avait deux : « x2 » en bas à gauche pour la classe, « 4x » en haut à
  // droite pour le poids. Deux notations qui ne différaient que par la place du
  // x, aucune ne disant ce qu'elle était, et l'on comprenait « x2 inkée deux
  // fois » — alors que c'est une x2 qui a brûlé quatre fois l'encre de base pour
  // peser le double. « x2→4x » se lit sans notice : née là, arrivée ici.
  const now = e.weight ? fmtWeightX(e.weight) : null;
  const badge = reinked && classLabel && now
    ? `<span class="reink">${esc(classLabel)}&#8594;${now}</span>`
    : reinked && now ? `<span class="reink">${now}</span>`
    : classLabel ? `<span class="cls-badge">${esc(classLabel)}</span>`
    : "";
  const cls = "";

  // Ce que la machine toucherait si le pot tombait maintenant. C'est le chiffre
  // qu'on vient chercher : le prix est ce qu'on paie, celui-ci est ce qu'on
  // reçoit. Une dormante affiche zéro, ce qui est vrai et non pas manquant.
  // Une dormante gagne zéro, et sa vignette le dit. C'est vrai, et c'est
  // précisément l'information : elle ne touchera rien tant que rien n'a brûlé.
  const earns = e.epochUsd === null || e.epochUsd === undefined
    ? ""
    : `<span class="earns">${fmtUsd(e.epochUsd)}</span>` +
      `<span class="per">this drop</span>`;

  // Ce que la machine contient déjà. Le compte appartient au jeton, donc cela
  // part avec elle : une x1 à $100 avec $12 d'actions dedans et la même vidée
  // ne sont pas la même affaire, et rien ne le disait — ni ici, ni sur OpenSea.
  const holds = e.holds?.usd
    ? `<span class="holds" title="${esc(e.holds.lines.map((l) => `${fmtAmount(l.amount)} ${l.symbol}`).join(" · "))}">` +
      `+${fmtUsd(e.holds.usd)} inside</span>`
    : "";
  // « ×2.00 » se lisait « inkée deux fois ». Ce qui a été fait, c'est brûler
  // quatre fois l'encre de base ; le poids n'en gagne que le double, parce
  // qu'il suit une racine carrée.
  const inkStory = reinked
    ? ` · burning ${e.inkPrinter ? fmtExact(e.inkPrinter / 4250) : "more"}× the base ink` +
      ` — ${fmtInt(e.inkPrinter)} $PRINTER burned · weight ${fmtExact(e.weight / 100)}x`
    : "";

  // L'anvil ne peut pas vendre sous sa propre offre : la marque n'a de sens que
  // sur le carnet OpenSea.
  // L'écart avec l'offre de l'anvil ne s'écrit plus sur chaque vignette. Cette
  // offre est la même pour toutes les machines — 21 074 $PRINTER, à plat — et
  // la bande est triée par prix : l'écart décroît donc tout seul du premier au
  // dernier. Un badge par vignette répétait un calcul que l'ordre suffit à
  // porter, et trois marques sur une image de soixante-dix-huit pixels rendaient
  // la bande illisible. La phrase au-dessus dit l'offre ; la soustraction est
  // au lecteur, et elle est triviale.
  const under = "";
  const bidStory = !anvil && e.anvilBidEth
    ? ` · anvil pays ${fmtEth(e.anvilBidEth)} ETH (${fmtInt(e.anvilBidPrinter)} $PRINTER, net of the sell fee)`
    : "";
  const anvilStory = anvil
    ? ` · ${fmtInt(Math.round(e.askPrinter))} $PRINTER to pick this one` +
      (e.askEth ? ` · ≈${fmtEth(e.askEth)} ETH` : "")
    : "";

  // Une machine sans poids ne gagne rien, et « earns $0.00 at weight 0x » est
  // une façon absurde de le dire. Elle annonce ce qui la réveillerait.
  // Une machine sans poids ne gagne rien, et « earns $0.00 at weight 0x » est
  // une façon absurde de le dire. Inkée aujourd'hui elle serait « Lit », donc
  // elle ne toucherait rien avant l'epoch suivante : l'infobulle le dit.
  const known = e.epochUsd !== null && e.epochUsd !== undefined;
  // « an epoch » promettait un rythme. Le pot qui attend s'est constitué depuis
  // le lancement sans avoir jamais rien versé, sur la semaine où le token
  // s'échangeait le plus. Ce chiffre est ce qui attend, pas ce qui revient.
  const earnStory = !known
    ? ""
    : !e.weight
      ? ` · earns nothing until it is inked, and nothing from this pot even then` +
        ` — a Machine inked during an epoch only starts earning at the next one`
      : ` · takes ${fmtUsd(e.epochUsd)} of the pot waiting now, at weight ${fmtExact(e.weight / 100)}x` +
        ` — up to ${fmtUsd(e.epochUsd * 2)} if the vote lands on its desk`;

  const pointStory = perPoint !== null
    ? ` · ${fmtUsd(perPoint, 0)} per weight point` +
      (e.dormantHere ? ", activation included" : "") +
      ` · asking ${fmtEth(e.priceEth)} ETH`
    : "";

  return `<a class="chip${isFloor ? " floor" : ""}${anvil ? " anvil" : ""}${!anvil && e.underBid ? " is-under" : ""}${reinked ? " is-reinked" : ""}"` +
    ` href="${anvil ? ANVIL_URL : itemUrl(e.tokenId)}" target="_blank" rel="noopener"` +
    ` title="${esc(`#${e.tokenId}${hw}${earnStory}${pointStory}${inkStory}${bidStory}${anvilStory}`)}">` +
    `<span class="thumb">${img}${badge}${cls}${under}</span>` +
    (showPrice ? `<span class="price">${price}</span>` : "") +
    (showPrice && dollars ? `<span class="usd">${dollars}</span>` : "") +
    earns +
    holds +
    `<span class="tok">#${e.tokenId}</span>` +
  `</a>`;
}


/** Le desk d'abord : c'est un secteur scellé au mint que la chaîne publie, et
 *  la machine touche le double sur la part achetée pour lui. Seule des quatre
 *  dimensions à changer ce que la machine rapporte — les trois autres sont
 *  cosmétiques. Elle s'appelait « Farms » et se nommait d'après des tickers
 *  déduits d'une couleur de corps ; les tickers sont ce que le bulletin
 *  propose, pas ce que les machines portent. */
export const TRAIT_TYPES = Object.freeze(["Desk", "Headwear", "Body", "Eyes"]);
const FIELD = Object.freeze({ Desk: "desk", Headwear: "headwear", Body: "body", Eyes: "eyes" });

export const EMPTY_FILTER = Object.freeze({ Desk: null, Headwear: null, Body: null, Eyes: null });

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
 * L'état de la moitié, écrit dans chaque case.
 *
 * Il n'était qu'en tête de tableau. Passé la première ligne on ne voyait plus
 * quelle colonne imprime et laquelle dort, et deux cases côte à côte affichant
 * l'une $14.81 et l'autre $0.00 devenaient inexplicables. Chaque case le dit
 * désormais elle-même, à côté du marché dont elle parle.
 */
function stateTag(state) {
  return state ? ` <span class="st">${state === "Inked" ? "inked" : "dormant"}</span>` : "";
}

/**
 * Le rayon de l'anvil dans cette case : un second marché, libellé en $PRINTER.
 * Il a sa propre bande et son propre en-tête plutôt que d'être fondu dans le
 * carnet OpenSea — les fondre laisserait croire qu'une machine de l'anvil
 * s'achète comme un listing, avec la même monnaie et la même transaction.
 */
function shelfStrip(anvilEntries, floorEth, state = null) {
  if (!anvilEntries?.length) return "";

  const first = anvilEntries[0];
  // « to pick one » plutôt que « floor price » : ce montant inclut la prime de
  // 10% pour désigner sa machine, et l'appeler un floor le ferait passer pour
  // un tarif d'entrée.
  const priceLine =
    `<span class="shelf-price"><span class="label">to pick one</span>` +
    `<span class="price">${fmtInt(Math.round(first.askPrinter))}</span>` +
    ` <span class="unit">$PRINTER</span>` +
    (first.askUsd ? ` <span class="usd-big">${fmtUsdShort(first.askUsd)}</span>` : "") + `</span>`;

  // Un prix identique sur chaque vignette répète ce que l'en-tête vient de
  // dire. Il ne s'affiche que s'il varie d'une machine à l'autre — ce qui
  // arrive, la courbe de l'anvil pouvant séparer deux positions de file.
  const uniform = new Set(anvilEntries.map((e) => Math.round(e.askPrinter))).size === 1;
  const chips = anvilEntries.map((e) => chip(e, { anvil: true, showPrice: !uniform })).join("");

  // La comparaison existait dans un seul sens, et ce sens dépend d'une offre
  // d'achat que le protocole peut suspendre. Celui-ci tient dans tous les cas :
  // le rayon vend-il moins cher que le moins cher du carnet ?
  const under = floorEth && first.askEth && first.askEth < floorEth
    ? `<span class="under-note">Cheaper than anything on OpenSea here — ` +
      `${fmtEth(first.askEth)} ETH against ${fmtEth(floorEth)}.</span>`
    : "";

  return `<span class="shelf">` +
    `<span class="market">On the Anvil${stateTag(state)}</span>` +
    priceLine + under +
    `<span class="strip">${chips}</span>` +
  `</span>`;
}

/**
 * Une moitié de ligne : tout le carnet de cette case, du moins cher au plus
 * cher. Huit machines par défaut, le reste derrière un bouton — la case dit
 * toujours combien elle cache, pour qu'un carnet coupé ne passe jamais pour
 * un carnet complet.
 */
export function halfCell(half, side, { shown = null, step = REVEAL_STEP, limit = DEFAULT_LIMIT, key = "", filter = EMPTY_FILTER, ethUsd = null, activationUsd = null, view = VIEW_FLOOR, classValue = null } = {}) {
  const g = `g-${side}`;
  // Sur mobile l'en-tête du tableau disparaît : la case doit alors annoncer
  // elle-même de quel côté elle parle.
  const state = side === "ink" ? "Inked" : "Dormant";
  const active = filterIsActive(filter);
  const all = half.entries ?? [];
  const kept = active ? all.filter((e) => matchesFilter(e.machine, filter)) : all;
  // Le rayon subit le même filtre : sans ça une case pouvait annoncer aucune
  // correspondance tout en affichant les machines de l'anvil sous la ligne.
  const allShelf = half.anvilEntries ?? [];
  const keptShelf = active ? allShelf.filter((e) => matchesFilter(e.machine, filter)) : allShelf;

  // En vue « valeur » le carnet se reclasse sur le prix du point, pas sur le
  // prix : une machine plus chère qui porte plus de poids passe devant. Celles
  // dont le point n'est pas calculable sortent du classement, et la case le dit
  // plutôt que de les faire disparaître en silence.
  const valued = view === VIEW_VALUE;
  const rates = { classValue, side, ethUsd, activationUsd };
  const ranked = valued
    ? kept
        .map((e) => ({ ...e, perPoint: perPointUsd(e, rates), dormantHere: side === "dormant" }))
        .filter((e) => e.perPoint !== null)
        .sort((a, b) => a.perPoint - b.perPoint || a.tokenId - b.tokenId)
    : kept;
  const unranked = kept.length - ranked.length;

  // Deux faits distincts, énoncés séparément. « 5 of 249 listed » se lisait
  // « 5 affichées sur 249 disponibles » et faisait chercher un bouton de
  // dépliage qui n'avait pas lieu d'être : les 249 sont les machines qui
  // existent, et les 5 en vente étaient déjà toutes là.
  const depth = (active
    ? `${fmtInt(ranked.length)} of ${fmtInt(all.length)} on sale match`
    : `<b>${fmtInt(half.listed)} on sale</b> · ${fmtInt(half.supply)} in this class`)
    + (unranked ? ` · ${fmtInt(unranked)} of unknown weight, left out` : "")
    // L'activation est comptée dans le chiffre : le taire ferait passer une
    // dormante bon marché pour meilleure qu'elle n'est.
    + (valued && side === "dormant"
        ? ` · <span class="incl">activation included, ${fmtUsdShort(activationUsd)}</span>`
        : "");

  if (!ranked.length) {
    // « rien ne correspond ici » et « rien n'est en vente ici » ne sont pas la
    // même information, et les confondre ferait passer un filtre pour un marché vide.
    const why = active
      ? `<span class="absent">no machine matches here</span> · ${fmtInt(all.length)} on sale`
      : `<span class="absent">no listing</span> · ${fmtInt(half.supply)} in this class`;
    const tip = active
      ? "Nothing on sale in this class and state carries the traits you picked."
      : "Nothing is on sale in this class in this state.";
    return `<td class="${g} edge half" data-state="${state}" title="${esc(tip)}">` +
      `<span class="market">On OpenSea${stateTag(state)}</span>` +
      `<span class="depth">${why}</span>` + shelfStrip(keptShelf, half.floorEth, state) + `</td>`;
  }

  const half_ = { ...half, entries: ranked, anvilEntries: keptShelf };
  // Sous filtre ce n'est plus le floor de la classe mais le moins cher de la
  // sélection ; en vue « valeur » ce n'est plus un prix du tout.
  const floorLabel = valued
    ? (active ? "cheapest matching weight" : "cheapest weight")
    : (active ? "cheapest match" : "floor price");
  return renderHalf(half_, g, { shown: shown ?? limit, step, limit, key, depth, state, ethUsd, floorLabel, valued });
}

function renderHalf(half, g, { shown: count, step, limit, key, depth, state, ethUsd, floorLabel, valued = false }) {

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

  // L'anvil ne s'annonce plus dans le carnet OpenSea. Son offre est la même
  // pour toutes les machines et la bande est triée par prix : la phrase
  // répétait, en travers de chaque case, ce que l'ordre porte déjà. Le rayon
  // garde la sienne — lui vend, et ce qu'il vend change d'une case à l'autre.

  // Le floor en tête, en grand et nommé : c'est le chiffre qu'on vient chercher.
  // Sous un filtre ce n'est plus le floor de la classe mais le moins cher de la
  // sélection, et l'étiquette le dit plutôt que de laisser croire au premier.
  const floor = half.entries[0];
  const floorUsd = fmtUsdShort(usdOf(floor.priceEth, ethUsd));
  // En vue « valeur » le grand chiffre change d'unité : il n'est plus ce que
  // coûte la machine mais ce que coûte un point de son poids. Le prix demandé
  // reste à côté, sinon la case classerait sans dire ce qu'il faut payer.
  const head = valued
    ? `<span class="cell-floor">` +
      `<span class="label">${floorLabel}</span>` +
      `<span class="price">${fmtUsdShort(floor.perPoint)}</span> <span class="unit">per weight point</span>` +
      (floorUsd ? ` <span class="usd-big">${floorUsd} to buy</span>` : "") + `</span>`
    : `<span class="cell-floor">` +
      `<span class="label">${floorLabel}</span>` +
      `<span class="price">${fmtEth(floor.priceEth)}</span> <span class="unit">ETH</span>` +
      (floorUsd ? ` <span class="usd-big">${floorUsd}</span>` : "") + `</span>`;

  return `<td class="${g} edge half" data-state="${state}" title="${esc(tip)}">` +
    `<span class="market">On OpenSea${stateTag(state)}</span>` +
    head +
    `<span class="depth">${depth}</span>` +
    `<span class="strip">${shown.map((e, i) => chip(e, { isFloor: i === 0, ethUsd, perPoint: valued ? e.perPoint : null })).join("")}</span>` +
    more +
    shelfStrip(half.anvilEntries, half.floorEth, state) +
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

/**
 * Retrouve une machine dans le carnet, où qu'elle soit : les deux états, les
 * sept classes, et les deux marchés. Le tableau ne la connaît que par sa
 * vignette ; le panneau de détail, lui, a besoin de sa ligne pour savoir de
 * quelle classe elle est et sur quel marché elle se vend.
 */
export function findMachine(d, tokenId) {
  const id = Number(tokenId);
  for (const r of d?.rows ?? []) {
    for (const [side, cell] of [["ink", r.inked], ["dormant", r.dormant]]) {
      for (const e of cell?.entries ?? []) {
        if (e.tokenId === id) return { e, row: r, side, market: "opensea" };
      }
      for (const e of cell?.anvilEntries ?? []) {
        if (e.tokenId === id) return { e, row: r, side, market: "anvil" };
      }
    }
  }
  return null;
}

const factRow = (label, value, extra = "") =>
  value === null || value === undefined || value === ""
    ? ""
    : `<div class="d-row"><span class="label">${label}</span>` +
      `<span class="d-v">${value}</span>` +
      (extra ? `<span class="d-x">${extra}</span>` : "") + `</div>`;

/**
 * Tout ce que l'on sait d'une machine, sur une seule page.
 *
 * La vignette porte cinq nombres parce qu'elle fait 78 pixels de large ; la
 * machine en a vingt. Ce qu'elle est de naissance, ce qu'elle est devenue à
 * force d'encre, ce qu'elle coûte, ce qu'elle rapporte et où l'acheter — rien
 * n'est déduit ici, tout est déjà lu sur la chaîne.
 */
export function machineDetailHtml(d, tokenId) {
  const found = findMachine(d, tokenId);
  if (!found) {
    return `<div class="d-head"><span class="d-id">Machine #${esc(String(tokenId))}</span>` +
      `<button class="d-close" type="button" aria-label="Close">×</button></div>` +
      `<div class="d-body"><p class="w-small">Not in the book right now — it may have just sold.</p></div>`;
  }

  const { e, row: r, side, market } = found;
  const ethUsd = d.eth?.usd ?? null;
  const m = e.machine ?? {};
  const anvil = market === "anvil";
  const priceUsd = anvil ? e.askUsd : usdOf(e.priceEth, ethUsd);
  const dormant = side === "dormant";

  const img = m.image
    ? `<img src="${esc(m.image)}" alt="Machine #${e.tokenId}" width="300" height="300">`
    : `<span class="noimg d-noimg" aria-hidden="true"></span>`;

  const reinked = e.inkMult > 1.0001 && e.weight;
  // Le plafond est commun à toute la flotte et monte à mesure qu'elle brûle.
  const ceiling = d.protocol?.ceiling ? Number(d.protocol.ceiling) / 100 : null;
  const atCeiling = Boolean(ceiling && e.inkMult && e.inkMult >= ceiling - 0.001);
  const gate = d.protocol?.nextGate;
  const nextGate = gate?.needed && gate?.unlocks
    ? { unlocks: Number(gate.unlocks) / 100, more: Number(BigInt(gate.needed) / 10n ** 18n) }
    : null;
  const perPoint = perPointUsd(e, {
    classValue: r.classValue, side, ethUsd,
    activationUsd: d.ink?.activationTotalUsd ?? null,
  });
  const yieldPct = e.epochUsd && priceUsd ? e.epochUsd / priceUsd : null;
  const bidUsd = usdOf(e.anvilBidEth, ethUsd);
  const gainUsd = bidUsd === null || priceUsd === null ? null : bidUsd - priceUsd;
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  const facts =
    factRow("Class", esc(r.classLabel), `${fmtInt(r.chainCount)} machines are born in it`) +
    factRow("Weight", e.weight ? `${fmtExact(e.weight / 100)}x` : "0x",
      dormant ? "dormant — nothing burned, so it earns and votes nothing"
        // « ×2.00 » seul se lisait comme « inkée deux fois ». Ce qui a été fait,
        // c'est brûler quatre fois l'encre de base ; le poids n'en gagne que le
        // double parce qu'il suit une racine carrée.
        : reinked && e.inkPrinter
          ? `born ${esc(r.classLabel)} — burning ${fmtExact(e.inkPrinter / 4250)}× the base ink ` +
            `lifts it to ${fmtExact(e.weight / 100)}x, since weight follows the square root`
        : reinked ? `it outweighs its own class`
        : "activated at the base burn") +
    // La formule seule ment sur les machines qui touchent le plafond : le
    // contrat tronque le multiplicateur au pourcent entier et refuse de le
    // faire passer au-dessus du plafond commun. Une x4 à 17 150 d'encre pèse
    // 800 et non 803,5, et le poids affiché plus haut est celui de la chaîne,
    // jamais un produit de cette ligne.
    factRow("Ink burned",
      e.inkPrinter === null || e.inkPrinter === undefined ? null : `${fmtInt(e.inkPrinter)} $PRINTER`,
      `class × √(ink ÷ 4,250), floored to whole percent` +
      (ceiling ? ` and capped at the x${ceiling} ink ceiling` : "")) +
    factRow("At the ceiling", atCeiling ? `x${ceiling}, the most ink can give today` : null,
      nextGate
        ? `x${nextGate.unlocks} opens when ${fmtCompact(nextGate.more)} more $PRINTER is burned across the fleet`
        : "burning more would be refused, not quietly capped") +
    factRow("Desk", m.desk ? esc(m.desk) : null,
      (m.sector ? `the ${esc(m.sector)} desk — ` : "") +
      (m.ticker ? `on this epoch's ballot, and it counts 2× on that slice`
        : `not on this epoch's ballot, so no slice is bought for it this time`)) +
    factRow("Takes", e.epochUsd === null || e.epochUsd === undefined ? null : `${fmtUsd(e.epochUsd)} of the pot`,
      e.epochUsd ? `up to ${fmtUsd(e.epochUsd * 2)} if the vote lands on its desk`
        : "nothing from this pot, and nothing from the next until it is inked") +
    factRow(anvil ? "Asking" : "Price",
      anvil ? `${fmtInt(Math.round(e.askPrinter))} $PRINTER` : `${fmtEth(e.priceEth)} ETH`,
      priceUsd ? fmtUsd(priceUsd) : "") +
    factRow("Return", yieldPct === null ? null : fmtRatio(yieldPct),
      "of its price is already waiting in the pot") +
    factRow("Per point", perPoint === null ? null : fmtUsd(perPoint),
      `what one x1 point of weight costs here${dormant ? ", activation included" : ""}`) +
    factRow("Anvil bid",
      !anvil && e.anvilBidEth
        ? `${fmtEth(e.anvilBidEth)} ETH` + (bidUsd === null ? "" : ` · ${fmtUsd(bidUsd)}`)
        : null,
      e.anvilBidPrinter
        ? `${fmtInt(e.anvilBidPrinter)} $PRINTER, net of the sell fee` +
          // La vignette annonçait « +$82 » et la fiche ne le disait pas : elle
          // donnait l'offre sans l'écart, c'est-à-dire sans l'information.
          (e.underBid && gainUsd !== null
            ? ` — ${fmtUsd(gainUsd)} more than it is listed for, but paid in $PRINTER`
            : e.underBid ? " — more than it is listed for" : "")
        : "") +
    factRow("Background", m.background ? esc(m.background) : null, "cosmetic") +
    // De quoi vérifier soi-même plutôt que de nous croire.
    factRow("Its account", e.account ? esc(short(e.account)) : null,
      "the machine's own address — this is where the stock lands, and it goes with the sale") +
    factRow("Held by", e.owner ? esc(short(e.owner)) : null, "the wallet that owns the machine today") +
    factRow("Headwear", m.headwear ? esc(headwearLabel(m.headwear)) : null, "the trait that seals the class") +
    factRow("Body", m.body ? esc(m.body) : null, "cosmetic — the desk is read from the chain") +
    factRow("Eyes", m.eyes ? esc(m.eyes) : null, "cosmetic");

  // Le détail de ce que le compte du NFT contient. C'est la seule partie du
  // panneau qui décrit un bien qui change de main avec la machine.
  const inside = e.holds?.lines?.length
    ? `<div class="d-holds"><span class="label">Inside the machine</span>` +
      `<span class="d-x">its own account holds these, and they go with it if it sells</span>` +
      `<ul>${e.holds.lines.map((l) =>
        `<li><span class="h-sym">${esc(l.symbol)}</span>` +
        `<span class="h-amt">${fmtAmount(l.amount)}</span>` +
        `<span class="h-usd">${l.usd === null ? "—" : fmtUsd(l.usd)}</span></li>`).join("")}</ul>` +
      (e.holds.usd ? `<span class="d-total">${fmtUsd(e.holds.usd)} in all</span>` : "") + `</div>`
    : "";

  const where = anvil
    ? `<a class="d-go" href="${ANVIL_URL}" target="_blank" rel="noopener">Buy on the Anvil &#8599;</a>`
    : `<a class="d-go" href="${itemUrl(e.tokenId)}" target="_blank" rel="noopener">View on OpenSea &#8599;</a>`;

  return `<div class="d-head"><span class="d-id">Machine #${e.tokenId}</span>` +
    `<span class="d-where">${anvil ? "on the Anvil" : "on OpenSea"} · ${dormant ? "dormant" : "inked"}` +
    ` · ${esc(r.classLabel)}</span>` +
    `<button class="d-close" type="button" aria-label="Close">×</button></div>` +
    `<div class="d-body"><div class="d-pic">${img}${where}${inside}</div>` +
    `<div class="d-facts">${facts}</div></div>`;
}
/**
 * Le chiffre qui range la ligne, écrit à côté de la classe. Sans lui l'ordre
 * paraît arbitraire : les deux colonnes sont deux marchés indépendants, aucun
 * tri ne peut les rendre toutes deux croissantes, et le nombre qui décide du
 * rang se trouve donc une fois sur deux dans la colonne qu'on ne regarde pas.
 */
function rankLine(best) {
  if (!best || !Number.isFinite(best.p)) return "";
  return `<span class="cls-point">${fmtUsdShort(best.p)}` +
    `<span class="per">per point</span>` +
    `<span class="from">${best.side === "dormant" ? "dormant" : "inked"}</span></span>`;
}

/**
 * Ce qu'une machine rapporte pour ce qu'elle coûte.
 *
 * Le pot n'est pas un revenu périodique : il s'accumule depuis le lancement et
 * n'a encore rien versé. Ce rapport dit donc « quelle part de son prix
 * l'attend déjà », pas un rendement annuel — et il n'y a pas de règle de trois
 * à faire dessus.
 *
 * Une dormante ne pèse rien : on compte ce qu'elle pèserait une fois activée,
 * contre ce qu'il faut sortir pour l'activer. Sinon elle affiche zéro pour
 * l'éternité et sort d'un classement où elle a sa place.
 */
export function yieldOf(e, { side, classValue, potUsd, fleetWeight, activationUsd, priceUsd }) {
  if (!potUsd || !fleetWeight || !priceUsd) return null;
  const dormant = side === "dormant";
  if (dormant && !activationUsd) return null;

  const weight = dormant ? classValue : e?.weight;
  if (!weight) return null;

  // Deux choses attendent l'acheteur, et les deux comptent.
  //
  // Sa part du pot, qui tombera au prochain drop — et les actions déjà posées
  // dans le compte de la machine, qui sont à lui à la seconde où il l'achète,
  // puisque le compte appartient au jeton. Ne compter que la première faisait
  // passer une machine à $261 contenant $26 pour l'égale d'une machine vide au
  // même prix, alors qu'un dixième du prix lui revient immédiatement.
  const fromPot = (potUsd * weight) / fleetWeight;
  const inside = e?.holds?.usd ?? 0;
  const cost = priceUsd + (dormant ? activationUsd : 0);
  return (fromPot + inside) / cost;
}

/**
 * La bande de tête : ce qui rapporte le plus pour le moins cher, toutes classes
 * et les deux états confondus.
 *
 * Elle est bâtie comme une ligne de rareté — même intitulé à gauche, même bande
 * de vignettes, même rayon de l'anvil en dessous — mais tient sur la largeur des
 * deux colonnes, parce qu'elle ne parle ni d'un état ni d'une classe : elle les
 * traverse. C'est la seule vue du tableau où une x1 et une x10 se comparent.
 */
export function bestRow(d, { limit = BEST_LIMIT, step = REVEAL_STEP, shown = null, filter = EMPTY_FILTER, ethUsd = null } = {}) {
  const potUsd = d?.pot?.usd ?? null;
  const fleetWeight = d?.pot?.fleetWeight ?? null;
  const activationUsd = d?.ink?.activationTotalUsd ?? null;
  if (!potUsd || !fleetWeight) return "";

  const active = filterIsActive(filter);
  const book = [];
  const shelf = [];
  for (const r of d.rows ?? []) {
    // Seules les machines qui gagnent déjà. Une dormante inkée aujourd'hui est
    // « Lit » et ne touche rien avant l'epoch suivante : elle ne peut pas
    // prétendre à une part du pot qui attend, et la classer dessus reviendrait
    // à promettre un versement qu'elle ne recevra pas.
    for (const [side, cell] of [["ink", r.inked]]) {
      const common = { side, classValue: r.classValue, potUsd, fleetWeight, activationUsd };
      for (const e of cell?.entries ?? []) {
        if (active && !matchesFilter(e.machine, filter)) continue;
        const y = yieldOf(e, { ...common, priceUsd: usdOf(e.priceEth, ethUsd) });
        if (y !== null) book.push({ e, y, classLabel: r.classLabel });
      }
      // Le rayon est un second marché, libellé en $PRINTER : il garde sa bande.
      for (const e of cell?.anvilEntries ?? []) {
        if (active && !matchesFilter(e.machine, filter)) continue;
        const y = yieldOf(e, { ...common, priceUsd: e.askUsd });
        if (y !== null) shelf.push({ e, y, classLabel: r.classLabel });
      }
    }
  }
  if (!book.length && !shelf.length) return "";

  const byYield = (a, b) => b.y - a.y || a.e.tokenId - b.e.tokenId;
  book.sort(byYield);
  shelf.sort(byYield);

  const visible = Math.max(limit, Math.min(shown ?? limit, book.length));
  const head = book[0];
  const hidden = book.length - visible;
  const next = Math.min(step, hidden);
  const more = hidden > 0
    ? `<button class="more" type="button" data-key="best" data-next="${visible + next}">` +
      `show ${fmtInt(next)} more · ${fmtInt(hidden)} left ▾</button>`
    : (visible > limit
        ? `<button class="more" type="button" data-key="best" data-next="${limit}">▴ show fewer</button>`
        : "");

  const strip = (list) => `<span class="strip">` +
    list.map(({ e, classLabel }) => chip(e, { ethUsd, anvil: e.askPrinter !== undefined, classLabel })).join("") +
    `</span>`;

  const shelfPart = shelf.length
    ? `<span class="shelf"><span class="market">On the Anvil</span>` +
      `<span class="depth">${fmtInt(shelf.length)} on the shelf, best first</span>` +
      strip(shelf.slice(0, limit)) + `</span>`
    : "";

  const label = active ? "best ROI of your pick" : "best ROI";
  return `<tr class="best-row">` +
    `<td class="cls-cell"><span class="cls">Best ROI</span>` +
      `<span class="cls-point">${fmtRatio(head.y)}` +
      `<span class="per">of its price</span><span class="from">pot + stock inside</span></span>` +
      `<span class="census">${fmtInt(book.length)} ranked</span></td>` +
    `<td class="edge half best" colspan="2">` +
      `<span class="market">On OpenSea</span>` +
      `<span class="cell-floor"><span class="label">${label}</span>` +
        // Le grand chiffre doit être celui que le pourcentage mesure. Il
        // annonçait la seule part du pot pendant que le ratio comptait aussi
        // les actions dedans — c'est-à-dire, aujourd'hui, l'essentiel.
        `<span class="price">${fmtUsd((head.e.epochUsd ?? 0) + (head.e.holds?.usd ?? 0))}</span> ` +
        `<span class="unit">back</span>` +
        `<span class="usd-big">for ${fmtUsdShort(usdOf(head.e.priceEth, ethUsd)) || "—"}</span></span>` +
      `<span class="depth">every class, machines already earning, most back per dollar first` +
        (active ? ` · ${fmtInt(book.length)} match your filter` : "") + `</span>` +
      strip(book.slice(0, visible)) + more + shelfPart +
    `</td>` +
  `</tr>`;
}

export function rowsHtml(d, { expanded = new Map(), limit = DEFAULT_LIMIT, step = REVEAL_STEP, filter = EMPTY_FILTER, view = VIEW_FLOOR, bestLimit = BEST_LIMIT } = {}) {
  const ethUsd = d.eth?.usd ?? null;
  const activationUsd = d.ink?.activationTotalUsd ?? null;
  const valued = view === VIEW_VALUE;

  /** Le meilleur point de la ligne, filtre compris : c'est sur lui que les
   *  lignes se rangent en vue « valeur ». Une classe sans rien de calculable
   *  tombe en bas plutôt que de prendre une place qu'elle ne mérite pas. */
  const bestPoint = (r) => {
    let best = { p: Infinity, side: null };
    for (const [side, cell] of [["ink", r.inked], ["dormant", r.dormant]]) {
      for (const e of cell?.entries ?? []) {
        if (!matchesFilter(e.machine, filter)) continue;
        const p = perPointUsd(e, { classValue: r.classValue, side, ethUsd, activationUsd });
        if (p !== null && p < best.p) best = { p, side };
      }
    }
    return best;
  };

  // L'ordre des classes est documentaire en vue « floor » — x1 puis x1.5, comme
  // la doc — et devient un classement en vue « valeur » : c'est là qu'on voit
  // d'un coup d'œil que la x3 achète le poids moins cher que la x10.
  const rows = valued
    ? d.rows.map((r) => ({ r, best: bestPoint(r) })).sort((a, b) => (a.best.p - b.best.p) || 0)
    : d.rows.map((r) => ({ r, best: null }));

  // La bande de tête est épinglée : elle ne suit pas le tri des lignes, parce
  // qu'elle ne parle d'aucune classe en particulier.
  // Le pas de dépliage vaut la bande elle-même : un clic ajoute deux rangées
  // pleines, jamais une rangée et demie.
  const bestHtml = bestRow(d, {
    limit: bestLimit, step: bestLimit,
    shown: expanded.get("best") ?? bestLimit, filter, ethUsd,
  });

  return bestHtml + rows.map(({ r, best }) => {
    const census = r.chainCount === r.docCount
      ? `<span class="census">${fmtInt(r.chainCount)} machines</span>`
      : `<span class="census mismatch" title="The chain returned ${r.chainCount}; the documentation says ${r.docCount}.">${fmtInt(r.chainCount)} ≠ ${fmtInt(r.docCount)}</span>`;

    const inkKey = cellKey(r.classValue, "ink");
    const dorKey = cellKey(r.classValue, "dormant");

    return `<tr>` +
      `<td class="cls-cell"><span class="cls">${r.classLabel}</span>${rankLine(best)}${boostTraits(d.legend, r.classValue)}${census}</td>` +
      halfCell(r.inked,   "ink",     { shown: expanded.get(inkKey) ?? limit, step, limit, key: inkKey, filter, ethUsd, activationUsd, view, classValue: r.classValue }) +
      halfCell(r.dormant, "dormant", { shown: expanded.get(dorKey) ?? limit, step, limit, key: dorKey, filter, ethUsd, activationUsd, view, classValue: r.classValue }) +
    `</tr>`;
  }).join("");
}

/**
 * Les trois menus de filtre. Chaque valeur annonce ce qui est en vente et ce qui
 * existe : savoir avant de cliquer qu'un trait n'a aucune machine sur le marché
 * évite d'aller chercher un tableau vide.
 */
export function filterBarHtml(traitFilters, filter, vote = null) {
  if (!traitFilters) return "";

  // Ce que chaque desk a tiré du pot cette epoch. Le desk n'est pas un trait
  // cosmétique : c'est le seul dont la valeur change avec un vote, et le menu
  // ne peut pas laisser croire que les seize se valent.
  const share = new Map();
  const sector = new Map();
  for (const dk of vote?.desks ?? []) {
    if (dk.desk && dk.share !== null) share.set(dk.desk, dk.share);
    // Le desk est un secteur, mais on cherche le ticker qu'il porte ce tour-ci.
    if (dk.desk && dk.sector) sector.set(dk.desk, dk.sector);
  }

  return TRAIT_TYPES.map((type) => {
    const values = traitFilters[type] ?? [];
    const options = values.map((v) => {
      const wearing = type === "Desk" && sector.has(v.value) ? ` · ${esc(sector.get(v.value))}` : "";
      const pot = type === "Desk" && share.has(v.value) ? ` — ${fmtRatio(share.get(v.value))} of the pot` : "";
      const chosen = filter?.[type] === v.value ? " selected" : "";
      return `<option value="${esc(v.value)}"${chosen}>${esc(v.value)}${wearing}${pot} (${fmtInt(v.listed)} on sale of ${fmtInt(v.total)})</option>`;
    }).join("");
    return `<label class="fl"><span class="label">${type}</span>` +
      `<select data-trait="${type}"><option value="">any</option>${options}</select></label>`;
  }).join("");
}

/**
 * D'où vient l'argent, dit une fois et en toutes lettres.
 *
 * Les vignettes portent « this drop » sous chaque montant vert, mais un
 * mot ne dit pas d'où sort la somme. Cette ligne le dit : le pot est fait des
 * frais de vente, il est partagé au prorata du poids, et il ne tombe pas au
 * rythme des epochs — il tombe quand un bulletin se clôt. Promettre une cadence
 * que le protocole ne tient pas serait pire que ne rien dire.
 */
export function dropNote(d) {
  const pot = d?.pot?.usd;
  if (!pot) return "";

  const when = d?.vote?.opened
    ? "A ballot is open — it pays out when that ballot closes."
    : "No ballot is open yet, so it keeps piling up until one closes.";

  // Le pot n'a jamais rien versé : il s'est constitué depuis le lancement, et
  // sur la semaine où le token s'échangeait le plus. Appeler sa part « par
  // epoch » promettait un rythme que rien ne garantit — le prochain pot vaudra
  // ce que le volume de la semaine suivante lui donnera, et le volume vient de
  // tomber. Le dire est plus utile que de laisser espérer.
  const daily = d?.printer?.volume24h && d?.protocol?.sellFeeBps
    ? (d.printer.volume24h * (d.protocol.sellFeeBps / 10000)) / 2
    : null;
  const rate = daily
    ? ` At today's trading it takes about <b>${fmtBig(daily * 3.5)}</b> to refill over a 3.5-day epoch, ` +
      `so the next one will not be this size unless volume holds.`
    : "";

  return `Sell fees pile up as USDG — <b>${fmtBig(pot)}</b> so far, never yet paid out — and buy the stock ` +
    `the desks vote for. Every Machine takes a share of it by weight: that is the green figure on each one. ` +
    when + rate;
}

export function walletCardHtml(w) {
  const label = `<span class="label">Your wallet</span>`;
  const field = (note) =>
    label +
    `<form id="wallet-form" autocomplete="off">` +
    `<input id="wallet-input" type="text" inputmode="latin" spellcheck="false"` +
    ` placeholder="0x… — paste an address, nothing to sign" aria-label="Wallet address">` +
    `<button type="submit" class="w-go">what should I vote?</button>` +
    (note ? `<span class="x">${note}</span>` : "") + `</form>`;

  // Tant qu'on n'a rien demandé, la ligne n'est que le champ : elle se lit
  // comme une commande de plus, pas comme un encart.
  if (!w) return field("");
  if (w.pending) return field("reading the chain…");
  if (w.error) return field(esc(w.error));

  const short = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
  if (!w.machines.length) {
    return label + `<span class="w-said"><span class="x">${esc(short)} holds no Machine</span>` +
      `<button class="w-again" type="button">try another</button></span>`;
  }

  // Deux réponses, pas une : pour quoi voter, et combien le portefeuille pèse.
  // La seconde était en petit au bout d'une phrase — c'est pourtant le chiffre
  // qu'on vient chercher, et il se lit maintenant comme sur les vignettes.
  const best = w.advice?.best;
  const worth = w.worth?.total
    ? `<span class="w-worth">${fmtUsdRound(w.worth.total)}<small>wallet worth</small></span>`
    : "";
  return label + `<span class="w-said">` +
    `<span class="v">${best ? `Vote ${esc(best.ticker)}` : "No ballot open"}</span>` +
    worth +
    (w.cutUsd === null ? ""
      : `<span class="w-cut">${fmtUsd(w.cutUsd)}<small>of the pot waiting, all ${fmtInt(w.machines.length)} machines</small></span>`) +
    `<span class="x">${esc(short)} · <b>${(w.weight / 100).toFixed(2)}x</b> of the fleet</span>` +
    `<button class="w-again" type="button">another wallet</button></span>`;
}

/**
 * Le détail : chaque machine, son desk, le ticker qu'il porte cette epoch, et
 * ce qu'elle rapporte. Plus la phrase que la carte n'a pas la place de dire —
 * un bulletin isolé rapporte des centimes, et le taire ferait croire à un
 * levier qui n'existe pas.
 */
export function walletDetailHtml(w) {
  if (!w || w.error || w.pending || !w.machines?.length) return "";

  const short = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
  const held = w.dormant
    ? `${fmtInt(w.awake)} earning · ${fmtInt(w.dormant)} dormant`
    : `${fmtInt(w.machines.length)} Machines`;

  const head = `<p class="w-who"><b>${esc(short)}</b> — ${held}` +
    (w.share === null ? "" : ` · ${fmtShare(w.share)} of the fleet`) + `</p>`;

  const best = w.advice?.best;
  const why = !best
    ? `<p class="w-small">No ballot is open, so there is nothing to vote for yet.</p>`
    : `<p class="w-small"><b>${esc(best.desk)}</b> — ` +
      (best.heldWeight
        ? `${(best.heldWeight / 100).toFixed(2)}x of your ${(w.weight / 100).toFixed(2)}x sit there. `
        : `you hold nothing there, but it is still your best slice. `) +
      `Voting it is worth <b>${fmtUsd(best.gainUsd)}</b> against not voting — one wallet barely moves a ` +
      `ballot. What moves your share is where the vote lands.</p>`;

  // Quatre choses, et elles ne se valorisent pas de la même façon. Les
  // machines n'ont pas de prix, seulement un marché : on retient le plus
  // offrant entre le floor de leur case et l'offre de l'anvil, et on dit
  // lequel, parce qu'un floor est un prix demandé et pas un prix obtenu.
  const wo = w.worth;
  const worthBlock = !wo?.total ? "" :
    `<div class="w-worth-block"><span class="label">What this wallet holds</span><ul>` +
    (wo.machinesUsd === null ? "" :
      `<li><span class="ww-k">${fmtInt(w.machines.length)} machines</span>` +
      `<span class="ww-x">at the better of their class floor and the Anvil's standing bid</span>` +
      `<span class="ww-v">${fmtUsdRound(wo.machinesUsd)}</span></li>`) +
    (wo.insideUsd === null ? "" :
      `<li><span class="ww-k">stock inside them</span>` +
      `<span class="ww-x">in their own accounts — it goes with the machine if it sells</span>` +
      `<span class="ww-v">${fmtUsd(wo.insideUsd)}</span></li>`) +
    (wo.stockUsd === null ? "" :
      `<li><span class="ww-k">stock withdrawn</span>` +
      `<span class="ww-x">${esc(wo.ownStock.map((x) => `${fmtAmount(x.amount)} ${x.symbol}`).join(" · "))}</span>` +
      `<span class="ww-v">${fmtUsd(wo.stockUsd)}</span></li>`) +
    (wo.printerUsd === null ? "" :
      `<li><span class="ww-k">$PRINTER</span>` +
      `<span class="ww-x">${fmtInt(Math.round(wo.printerAmount))} held</span>` +
      `<span class="ww-v">${fmtUsd(wo.printerUsd)}</span></li>`) +
    `</ul><span class="ww-total">${fmtUsdRound(wo.total)} in all</span>` +
    (wo.unpriced ? `<span class="w-small">${fmtInt(wo.unpriced)} machine(s) left out — nothing comparable is on sale and the Anvil would not bid.</span>` : "") +
    `<span class="w-small">A floor is what others are asking, not what you would be paid. ` +
    `The Anvil's bid is the part you could take today, and it pays in $PRINTER.</span></div>`;

  const list = w.machines.map((m) => {
    const desk = m.desk ? `${esc(m.desk)}${m.ticker ? ` · ${esc(m.ticker)}` : ""}` : "no desk read";
    return `<li><a href="${itemUrl(m.tokenId)}" target="_blank" rel="noopener">#${m.tokenId}</a>` +
      `<span class="w-w">${(m.weight / 100).toFixed(2)}x</span>` +
      `<span class="w-desk">${desk}</span>` +
      `<span class="w-earn">${m.epochUsd === null ? "—" : fmtUsd(m.epochUsd)}</span></li>`;
  }).join("");

  return head + why + `<ul class="w-list">${list}</ul>` + worthBlock;
}

/**
 * Le dépouillement, desk par desk.
 *
 * Il tenait dans une carte du bandeau — un ticker et un pourcentage — alors que
 * c'est ce qui décide de la taille de chaque tranche du pot. Sur sa propre
 * page, il y a la place de montrer les seize et ce que chacun a tiré.
 */
export function ballotHtml(vote, epoch) {
  if (!vote) return `<p class="w-small">The ballot could not be read.</p>`;
  if (!vote.opened) {
    return `<p class="w-small">No ballot has opened for epoch ${esc(String(epoch ?? "—"))} yet. ` +
      `Until one does, nothing is bought and the pot rolls forward.</p>`;
  }

  const voted = vote.desks.filter((x) => x.votedWeight > 0);
  if (!voted.length) {
    return `<p class="w-small">The ballot is open and not one Machine has voted.</p>`;
  }

  const top = voted[0].votedWeight || 1;
  const rows = vote.desks.map((dk) => {
    const share = dk.share ?? 0;
    const width = Math.round((dk.votedWeight / top) * 100);
    // Un desk absent du bulletin n'a pas perdu le vote : on n'a pas pu voter
    // pour lui, et une barre à zéro le ferait passer pour un candidat rejeté.
    const off = !dk.ticker;
    // Sans ticker, le nom du desk EST son secteur : l'écrire deux fois donnait
    // « consumer staples consumer staples ».
    const name = dk.ticker ?? dk.sector ?? `desk ${dk.index}`;
    return `<li class="${off ? "b-off" : ""}">` +
      `<span class="b-name">${esc(name)}</span>` +
      `<span class="b-sector">${esc(dk.sector && dk.sector !== name ? dk.sector : "")}</span>` +
      `<span class="b-bar"><span style="width:${width}%"></span></span>` +
      `<span class="b-pct">${off ? "not on the ballot" : fmtRatio(share)}</span>` +
      `<span class="b-w">${off ? "" : `${fmtInt(dk.votedWeight)}x`}</span></li>`;
  }).join("");

  return `<p class="w-small">Every Machine votes with its weight, and the pot is cut between the desks ` +
    `in proportion to what they drew. A Machine counts <b>twice</b> on the slice bought for its own desk.</p>` +
    `<ul class="ballot">${rows}</ul>` +
    (vote.finalized ? `<p class="w-small">This ballot has closed and been finalised.</p>` : "");
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
  // La vue vit ici aussi : elle ne dépend d'aucune donnée, donc son menu se
  // construit une fois pour toutes et survit aux rafraîchissements.
  const viewEl = $("view");
  let view = VIEW_FLOOR;
  viewEl.innerHTML = viewBarHtml(view);
  let lastData = null;
  let painted = "";
  let barBuilt = false;

  // Combien de vignettes la bande de tête peut montrer en rangées pleines. On
  // ne peut pas le savoir avant d'avoir peint une fois : la bande n'existe pas
  // encore. Premier rendu au repli, mesure, puis on repeint si le compte change.
  let bestLimit = BEST_LIMIT;
  const measureBest = () => {
    const strip = rowsEl.querySelector(".best-row .strip");
    if (!strip) return false;
    const next = bestFit({ availablePx: strip.clientWidth });
    if (next === bestLimit) return false;
    bestLimit = next;
    return true;
  };

  const paint = () => {
    if (!lastData) return;
    const html = rowsHtml(lastData, { expanded, filter, view, bestLimit });
    if (html !== painted) {
      rowsEl.innerHTML = html;
      painted = html;
      // Une seule reprise : la seconde mesure porte sur la bande redimensionnée
      // et retombe sur elle-même, donc il n'y a pas de boucle à craindre.
      if (measureBest()) {
        const again = rowsHtml(lastData, { expanded, filter, view, bestLimit });
        rowsEl.innerHTML = again;
        painted = again;
      }
    }
    const summary = filterSummary(lastData, filter);
    summaryEl.innerHTML = summary
      ? `${summary} <button class="clear" type="button">clear</button>`
      : "";
  };

  /** La barre est construite une fois. Les traits sont scellés, donc la liste
   *  des valeurs ne bouge jamais ; seuls les compteurs bougent, et on les met à
   *  jour sur place pour ne pas effacer la sélection en cours. */
  const paintFilters = (traitFilters, vote) => {
    if (!traitFilters) return;
    if (!barBuilt) {
      filtersEl.innerHTML = filterBarHtml(traitFilters, filter, vote);
      barBuilt = true;
      return;
    }
    for (const select of filtersEl.querySelectorAll("select")) {
      const rows = new Map((traitFilters[select.dataset.trait] ?? []).map((v) => [v.value, v]));
      for (const option of select.options) {
        const v = rows.get(option.value);
        if (v) option.textContent = `${v.value} (${v.listed} on sale of ${v.total})`;
      }
    }
  };

  viewEl.addEventListener("change", (e) => {
    const select = e.target.closest("select[data-view]");
    if (!select) return;
    view = select.value;
    paint();
  });

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

  // Les onglets.
  //
  // Le choix vit dans l'adresse plutôt qu'en mémoire : un lien partagé rouvre
  // la même page, un rechargement ne renvoie pas au marché, et le bouton retour
  // du navigateur fait ce qu'on attend de lui. Sans script, aucun onglet n'est
  // marqué et les quatre pages restent visibles — dégradé, mais entier.
  const TABS = ["market", "wallet", "vote", "how"];
  const tabsEl = $("tabs");

  const showTab = (name) => {
    const wanted = TABS.includes(name) ? name : TABS[0];
    for (const t of TABS) {
      const pane = $(`pane-${t}`);
      if (pane) pane.hidden = t !== wanted;
      const link = tabsEl?.querySelector(`[data-tab="${t}"]`);
      if (link) link.setAttribute("aria-selected", String(t === wanted));
    }
    return wanted;
  };

  let tab = showTab((location.hash || "").slice(1));
  addEventListener("hashchange", () => {
    tab = showTab((location.hash || "").slice(1));
    // La bande de tête se mesure sur une page visible : cachée, elle rend zéro.
    if (tab === "market" && measureBest()) { painted = ""; paint(); }
  });

  // Le portefeuille du visiteur.
  //
  // Il vit hors du bandeau, qui se redessine toutes les quinze secondes : une
  // adresse à moitié tapée ne peut donc pas disparaître sous les doigts, et il
  // n'y a aucun nœud à réattacher après coup.
  const contextEl = $("context");
  const walletCard = $("wallet-card");
  const walletOut = $("wallet-out");
  // null = la carte est le champ. Sinon : en cours, en erreur, ou la réponse.
  let wallet = null;

  const paintWallet = () => {
    walletCard.innerHTML = walletCardHtml(wallet);
    walletOut.innerHTML = walletDetailHtml(wallet);
  };

  const lookup = async (value) => {
    // Le même garde qu'au serveur, ici pour éviter un aller-retour inutile.
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
      wallet = { error: "that is not an address" };
      paintWallet();
      return;
    }
    wallet = { pending: true };
    paintWallet();
    try {
      const res = await fetch(`/api/wallet?address=${encodeURIComponent(value)}`);
      wallet = res.ok ? await res.json() : { error: "could not read that address" };
    } catch {
      wallet = { error: "could not reach the service" };
    }
    paintWallet();
  };

  if (walletCard) {
    paintWallet();
    walletCard.addEventListener("submit", (e) => {
      e.preventDefault();
      lookup($("wallet-input")?.value.trim() ?? "");
    });
    walletCard.addEventListener("click", (e) => {
      if (!e.target.closest(".w-again")) return;
      wallet = null;
      paintWallet();
    });
  }

  // L'écran change de largeur : la bande doit se recompter, sinon elle garde le
  // découpage d'une fenêtre qui n'existe plus.
  let resizeTimer = null;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (measureBest()) { painted = ""; paint(); } }, 150);
  });

  // Le détail d'une machine.
  //
  // La vignette reste un lien vers le marché : un clic modifié, un clic du
  // milieu ou un « ouvrir dans un nouvel onglet » doivent continuer d'y mener.
  // Seul le clic simple est détourné vers le panneau.
  const veil = $("detail");
  const panel = $("detail-panel");
  let lastFocus = null;

  const closeDetail = () => {
    veil.hidden = true;
    panel.innerHTML = "";
    lastFocus?.focus?.();
    lastFocus = null;
  };

  const openDetail = (tokenId, from) => {
    if (!lastData) return;
    lastFocus = from ?? null;
    panel.innerHTML = machineDetailHtml(lastData, tokenId);
    veil.hidden = false;
    panel.querySelector(".d-close")?.focus();
  };

  if (veil) {
    veil.addEventListener("click", (e) => {
      // Le voile ferme ; le panneau ne ferme que par sa croix.
      if (e.target === veil || e.target.closest(".d-close")) closeDetail();
    });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !veil.hidden) closeDetail();
    });
  }

  rowsEl.addEventListener("click", (e) => {
    const chip = e.target.closest("a.chip");
    if (chip && veil && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      const id = chip.querySelector(".tok")?.textContent?.replace("#", "");
      if (id) {
        e.preventDefault();
        openDetail(Number(id), chip);
        return;
      }
    }

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
    // L'heure du serveur sert deux fois — la fraîcheur du snapshot et le temps
    // qu'il reste pour voter — donc elle vit au-delà du bloc qui la lit.
    let serverNow = null;
    try {
      const res = await fetch("/api/snapshot");
      const body = await res.json();
      // L'en-tête Date vient du serveur, comme `at` : les comparer est sûr.
      serverNow = Date.parse(res.headers.get("date")) || Date.now();
      v = { ...body, ...freshness(body, serverNow) };
    } catch {
      showBanner("Cannot reach the service. The numbers below are the last ones it served.");
      return;
    }

    showBanner(bannerMessage(v));
    if (!v.data) return;

    setContract(v.data.collection?.contract);
    lastData = v.data;
    $("migrated").innerHTML = migrationNote(v.data);
    contextEl.innerHTML = contextHtml(v.data, serverNow);
    // Le vote a sa page : le pot et le bulletin y sont chez eux, en grand.
    $("vote-context").innerHTML = contextHtml(v.data, serverNow);
    $("ballot").innerHTML = ballotHtml(v.data.vote, v.data.protocol?.epoch);
    paintFilters(v.data.traitFilters, v.data.vote);
    $("queue").innerHTML = crateLine(v.data.anvil);
    $("drop-note").innerHTML = dropNote(v.data);
    paint();
    $("legend").innerHTML = legendHtml(v.data.legend);
  };

  refresh();
  setInterval(refresh, 15000);
}

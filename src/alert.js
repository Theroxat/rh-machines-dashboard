/**
 * Ce qui mérite de sonner.
 *
 * Une alerte qui se déclenche souvent ne se lit plus. Les seuils ci-dessous ont
 * donc été calibrés sur le carnet réel avant d'être écrits : « le prix est sous
 * ce que l'anvil paie » concernait 157 annonces sur 508 le jour où j'ai mesuré,
 * et « le contenu vaut un quart du prix », aucune. Ni l'un ni l'autre ne dit
 * quoi que ce soit d'exceptionnel.
 *
 * Deux choses sortaient réellement du lot, et elles sortent rarement.
 */

/** Une annonce très en dessous de la suivante de sa propre case. Le floor est
 *  toujours le moins cher — ce qui compte est l'écart avec le second, parce
 *  qu'un vendeur seul très bas est une erreur de prix, pas un marché. */
export const MIN_GAP_PCT = 0.40;
/** Et l'écart doit peser : 40% d'une machine à $20 ne vaut pas un message. */
export const MIN_GAP_USD = 60;

/** Acheter, retirer les actions, revendre à l'anvil. La marge se mesure en
 *  part du prix ; le maximum observé le jour du calibrage était de 54%. */
export const MIN_MARGIN_PCT = 0.60;

const usd = (eth, rate) => (eth === null || eth === undefined || !rate ? null : eth * rate);

/**
 * Les affaires du moment. Rien d'inventé : chaque champ vient du snapshot, et
 * une annonce dont on ne sait pas le prix n'est pas une affaire.
 */
export function findDeals(d, {
  minGapPct = MIN_GAP_PCT, minGapUsd = MIN_GAP_USD, minMarginPct = MIN_MARGIN_PCT,
} = {}) {
  const rate = d?.eth?.usd;
  if (!rate) return [];
  const out = [];

  // Tout ce qui décrit la machine voyage avec l'affaire : le message est lu sur
  // un téléphone, loin du tableau, et renvoyer quelqu'un chercher les chiffres
  // ailleurs annule l'intérêt de le prévenir.
  const pot = d?.pot?.usd ?? null;
  const fleet = d?.pot?.fleetWeight ?? null;
  const activation = d?.ink?.activationTotalUsd ?? null;
  const facts = (e, r, side) => {
    const p = usd(e.priceEth, rate);
    const dormant = side === "dormant";
    const weight = dormant ? r.classValue : e.weight;
    const cost = p + (dormant ? (activation ?? 0) : 0);
    const inside = e.holds?.usd ?? 0;
    return {
      classLabel: r.classLabel, classValue: r.classValue, side,
      weight: e.weight, inkPrinter: e.inkPrinter ?? null, inkMult: e.inkMult ?? null,
      desk: e.machine?.desk ?? null, sector: e.machine?.sector ?? null,
      onBallot: Boolean(e.machine?.ticker),
      headwear: e.machine?.headwear ?? null, image: e.machine?.image ?? null,
      epochUsd: e.epochUsd ?? null, insideUsd: inside,
      bidUsd: usd(e.anvilBidEth, rate),
      perPointUsd: weight && cost ? cost / (weight / 100) : null,
      roi: pot && fleet && cost ? (((pot * (weight ?? 0)) / fleet) + inside) / cost : null,
    };
  };

  for (const r of d.rows ?? []) {
    for (const [side, cell] of [["inked", r.inked], ["dormant", r.dormant]]) {
      const list = cell?.entries ?? [];

      // 1. Le décrochage : la moins chère très loin sous la suivante.
      if (list.length >= 2) {
        const [first, second] = list;
        const p = usd(first.priceEth, rate);
        const q = usd(second.priceEth, rate);
        const gap = q - p;
        if (p > 0 && gap / q >= minGapPct && gap >= minGapUsd) {
          out.push({
            kind: "gap", tokenId: first.tokenId, priceEth: first.priceEth, priceUsd: p,
            nextUsd: q, gapUsd: gap, gapPct: gap / q,
            ...facts(first, r, side),
          });
        }
      }

      // 2. Le filet : acheter, retirer le contenu, revendre à l'anvil.
      for (const e of list) {
        const p = usd(e.priceEth, rate);
        const bid = usd(e.anvilBidEth, rate);
        if (!p || !bid) continue;
        const inside = e.holds?.usd ?? 0;
        const margin = bid + inside - p;
        if (margin / p < minMarginPct) continue;
        out.push({
          kind: "margin", tokenId: e.tokenId, priceEth: e.priceEth, priceUsd: p,
          marginUsd: margin, marginPct: margin / p,
          ...facts(e, r, side),
        });
      }
    }
  }

  // La plus grosse affaire d'abord : si une seule ligne devait être lue, autant
  // que ce soit celle-là.
  return out.sort((a, b) => (b.gapUsd ?? b.marginUsd) - (a.gapUsd ?? a.marginUsd));
}

const OPENSEA = "https://opensea.io/assets/robinhood";

const money = (v, d = 0) => (v === null || v === undefined ? "—" : `$${v.toFixed(d)}`);
const xOf = (w) => (w ? `${Number((w / 100).toFixed(2))}x` : "0x");

/**
 * Le message, en fiche.
 *
 * Il arrive sur un téléphone, loin du tableau. Une ligne de texte obligeait à
 * ouvrir le lien pour savoir si l'affaire valait quelque chose ; la fiche porte
 * tout — ce qu'elle est, ce qu'elle pèse, ce qu'elle rapporte, ce qu'elle
 * contient — et l'image, pour qu'on la reconnaisse d'un coup d'œil.
 */
export function dealEmbed(deal, contract) {
  const reinked = deal.inkMult > 1.0001 && deal.weight;
  const born = reinked ? `${deal.classLabel} → ${xOf(deal.weight)}` : deal.classLabel;

  const why = deal.kind === "gap"
    ? `**${money(deal.priceUsd)}** — the next one in its cell asks **${money(deal.nextUsd)}**, ` +
      `so this is **${Math.round(deal.gapPct * 100)}% below** it.`
    : `**${money(deal.priceUsd)}** — the Anvil bids **${money(deal.bidUsd)}**` +
      (deal.insideUsd ? ` and it holds **${money(deal.insideUsd, 2)}** of stock` : "") +
      `, so **+${money(deal.marginUsd)}** on paper. Paid in $PRINTER.`;

  const fields = [
    { name: "Weight", value: `${xOf(deal.weight)}${reinked ? ` (born ${deal.classLabel})` : ""}`, inline: true },
    { name: "Ink burned", value: deal.inkPrinter === null ? "—" : `${deal.inkPrinter.toLocaleString("en-US")} $PRINTER`, inline: true },
    { name: "Desk", value: deal.desk ? `${deal.desk}${deal.onBallot ? "" : " (off ballot)"}` : "—", inline: true },
    { name: "Takes from the pot", value: money(deal.epochUsd, 2), inline: true },
    { name: "Stock inside", value: deal.insideUsd ? money(deal.insideUsd, 2) : "nothing", inline: true },
    { name: "Anvil bids", value: money(deal.bidUsd), inline: true },
    { name: "Per weight point", value: money(deal.perPointUsd, 2), inline: true },
    { name: "Back on its price", value: deal.roi === null ? "—" : `${(deal.roi * 100).toFixed(1)}%`, inline: true },
    { name: "Headwear", value: deal.headwear ?? "—", inline: true },
  ];

  return {
    title: `Machine #${deal.tokenId} — ${born}${deal.side === "dormant" ? " · dormant" : ""}`,
    url: `${OPENSEA}/${contract}/${deal.tokenId}`,
    description: why,
    fields,
    // L'ambre de la page : ce qui vient d'elle se reconnaît.
    color: 0xf0a41c,
    thumbnail: deal.image ? { url: deal.image } : undefined,
    footer: { text: deal.kind === "gap" ? "priced well under its own cell" : "worth more than it asks" },
  };
}

/** L'ancienne ligne, gardée pour le repli : si Discord refuse la fiche, un
 *  message reste préférable au silence. */
export function dealMessage(deal, contract) {
  const w = deal.weight ? ` · ${xOf(deal.weight)}` : "";
  const desk = deal.desk ? ` · ${deal.desk}` : "";
  const link = `<${OPENSEA}/${contract}/${deal.tokenId}>`;
  if (deal.kind === "gap") {
    return `**#${deal.tokenId}** — ${deal.classLabel}${w}${desk} ${deal.side}\n` +
      `${money(deal.priceUsd)}, and the next one in its cell is ${money(deal.nextUsd)} ` +
      `— **${Math.round(deal.gapPct * 100)}% below** it.\n${link}`;
  }
  return `**#${deal.tokenId}** — ${deal.classLabel}${w}${desk} ${deal.side}\n` +
    `${money(deal.priceUsd)}, and the Anvil bids ${money(deal.bidUsd)}` +
    (deal.insideUsd ? ` with ${money(deal.insideUsd)} of stock inside` : "") +
    ` — **+${money(deal.marginUsd)}**, paid in $PRINTER.\n${link}`;
}

/**
 * La clé d'une affaire déjà signalée.
 *
 * Une annonce qui reste en place des heures ne doit sonner qu'une fois — mais
 * si son prix change, c'est une autre affaire, et elle mérite d'être redite.
 */
export const dealKey = (deal) => `${deal.kind}:${deal.tokenId}:${deal.priceEth}`;

/** Envoie, et ne casse rien en cas d'échec : un webhook injoignable est un
 *  message perdu, pas un balayage perdu. */
export async function postToDiscord(url, payload, fetchImpl = fetch) {
  if (!url) return false;
  const body = typeof payload === "string"
    ? { content: payload }
    : { embeds: [payload] };
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, allowed_mentions: { parse: [] } }),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

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
            classLabel: r.classLabel, side,
            nextUsd: q, gapUsd: gap, gapPct: gap / q,
            weight: first.weight, desk: first.machine?.desk ?? null,
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
          classLabel: r.classLabel, side,
          bidUsd: bid, insideUsd: inside, marginUsd: margin, marginPct: margin / p,
          weight: e.weight, desk: e.machine?.desk ?? null,
        });
      }
    }
  }

  // La plus grosse affaire d'abord : si une seule ligne devait être lue, autant
  // que ce soit celle-là.
  return out.sort((a, b) => (b.gapUsd ?? b.marginUsd) - (a.gapUsd ?? a.marginUsd));
}

const OPENSEA = "https://opensea.io/assets/robinhood";

/** Le message. Court : il arrive sur un téléphone, et ce qu'on veut savoir en
 *  premier est s'il vaut la peine d'ouvrir le lien. */
export function dealMessage(deal, contract) {
  const w = deal.weight ? ` · ${deal.weight / 100}x` : "";
  const desk = deal.desk ? ` · ${deal.desk}` : "";
  const link = `<${OPENSEA}/${contract}/${deal.tokenId}>`;

  if (deal.kind === "gap") {
    return `**#${deal.tokenId}** — ${deal.classLabel}${w}${desk} ${deal.side}\n` +
      `$${deal.priceUsd.toFixed(0)}, and the next one in its cell is $${deal.nextUsd.toFixed(0)} ` +
      `— **${Math.round(deal.gapPct * 100)}% below** it.\n${link}`;
  }
  return `**#${deal.tokenId}** — ${deal.classLabel}${w}${desk} ${deal.side}\n` +
    `$${deal.priceUsd.toFixed(0)}, and the Anvil bids $${deal.bidUsd.toFixed(0)}` +
    (deal.insideUsd ? ` with $${deal.insideUsd.toFixed(0)} of stock inside` : "") +
    ` — **+$${deal.marginUsd.toFixed(0)}**, paid in $PRINTER.\n${link}`;
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
export async function postToDiscord(url, content, fetchImpl = fetch) {
  if (!url) return false;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

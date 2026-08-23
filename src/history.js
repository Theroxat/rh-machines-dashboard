import { DatabaseSync } from "node:sqlite";

/**
 * L'historique.
 *
 * Le service voyait tout et n'en gardait rien : chaque balayage écrasait le
 * précédent, et la page ne savait répondre qu'au présent. Un floor qui monte,
 * une annonce qui traîne depuis six jours, la vitesse à laquelle le pot se
 * remplit — rien de tout cela n'est lisible dans une photo.
 *
 * Deux règles gouvernent ce fichier.
 *
 * **On enregistre les changements, pas les états.** Garder chaque snapshot
 * entier ferait 204 Go par an pour 407 Ko toutes les soixante secondes, alors
 * que le carnet est presque immobile — mesuré : deux prix modifiés en soixante
 * quatre secondes sur neuf cent soixante sept annonces. En n'écrivant que les
 * différences, l'année tient dans quelques dizaines de mégaoctets.
 *
 * **Écrire ne doit jamais empêcher de servir.** Un disque plein, une base
 * verrouillée, un schéma illisible : tout est rattrapé et compté, et le
 * balayage continue. Une page sans historique reste une page ; une page qui ne
 * s'affiche plus parce qu'une écriture a échoué n'en est plus une.
 */
const SCHEMA = `
  PRAGMA journal_mode = WAL;

  -- Les scalaires, à chaque balayage. C'est la seule table qui s'écrit sans
  -- condition : ce sont les séries dont on veut la forme, pas les sauts.
  CREATE TABLE IF NOT EXISTS tick (
    t INTEGER PRIMARY KEY,
    pot REAL, ethUsd REAL, printerUsd REAL,
    printerMcap REAL, printerVol24h REAL, printerLiq REAL,
    fleetWeight INTEGER, activeMachines INTEGER, epoch INTEGER,
    inkBurned INTEGER, ceiling INTEGER, sellFeeBps INTEGER,
    collFloorEth REAL, collVolEth REAL, collSales INTEGER,
    anvilSpot REAL, anvilShelf INTEGER, anvilCrate REAL, anvilPaused INTEGER,
    listed INTEGER, inked INTEGER, dormant INTEGER
  );

  -- Le floor de chaque case, quand il bouge.
  CREATE TABLE IF NOT EXISTS floor (
    t INTEGER, classValue INTEGER, side TEXT,
    floorEth REAL, listed INTEGER, pelotonEth REAL
  );
  CREATE INDEX IF NOT EXISTS floor_cell ON floor(classValue, side, t);

  -- Le dépouillement, desk par desk, quand il bouge.
  CREATE TABLE IF NOT EXISTS tally (t INTEGER, epoch INTEGER, desk INTEGER, weight INTEGER);
  CREATE INDEX IF NOT EXISTS tally_desk ON tally(epoch, desk, t);

  -- Le bulletin : quel ticker occupe quel desk. Il est réattribué en cours de
  -- scrutin quand une action n'a pas de pool, et ces remaniements comptent.
  CREATE TABLE IF NOT EXISTS ballot (t INTEGER, epoch INTEGER, desk INTEGER, ticker TEXT);
  CREATE INDEX IF NOT EXISTS ballot_epoch ON ballot(epoch, desk, t);

  -- Les annonces, en évènements : apparue, prix changé, partie.
  CREATE TABLE IF NOT EXISTS listing (t INTEGER, tokenId INTEGER, priceEth REAL, kind TEXT);
  CREATE INDEX IF NOT EXISTS listing_token ON listing(tokenId, t);
  CREATE INDEX IF NOT EXISTS listing_time ON listing(t);

  -- Le rayon de l'anvil, aux mêmes règles.
  CREATE TABLE IF NOT EXISTS shelf (t INTEGER, tokenId INTEGER, askPrinter REAL, kind TEXT);
  CREATE INDEX IF NOT EXISTS shelf_token ON shelf(tokenId, t);

  -- Ce qui a déjà sonné. Une annonce qui reste en place des heures ne doit
  -- réveiller personne deux fois, et le fichier survit aux redémarrages —
  -- sinon chaque déploiement rejouerait toutes les alertes en cours.
  CREATE TABLE IF NOT EXISTS alerted (key TEXT PRIMARY KEY, t INTEGER, tokenId INTEGER, kind TEXT);

  -- Poids et encre : ils ne bougent que lorsque quelqu'un brûle.
  CREATE TABLE IF NOT EXISTS machine (t INTEGER, tokenId INTEGER, weight INTEGER, ink INTEGER);
  CREATE INDEX IF NOT EXISTS machine_token ON machine(tokenId, t);
`;

const num = (v) => (v === null || v === undefined ? null : Number(v));
const big = (v) => (v === null || v === undefined ? null : Number(BigInt(v)));

export function openHistory(path) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const stmt = {
    tick: db.prepare(`INSERT OR REPLACE INTO tick VALUES (${new Array(23).fill("?").join(",")})`),
    floor: db.prepare("INSERT INTO floor VALUES (?,?,?,?,?,?)"),
    tally: db.prepare("INSERT INTO tally VALUES (?,?,?,?)"),
    ballot: db.prepare("INSERT INTO ballot VALUES (?,?,?,?)"),
    listing: db.prepare("INSERT INTO listing VALUES (?,?,?,?)"),
    shelf: db.prepare("INSERT INTO shelf VALUES (?,?,?,?)"),
    machine: db.prepare("INSERT INTO machine VALUES (?,?,?,?)"),
  };

  // Le dernier état connu, pour ne coucher que les différences. Reconstruit
  // depuis la base au démarrage : sans ça, un redémarrage réécrirait tout le
  // carnet comme s'il venait d'apparaître.
  const last = { floor: new Map(), tally: new Map(), ballot: new Map(), listing: new Map(), shelf: new Map(), machine: new Map() };

  /** Une annonce dont la dernière trace est « partie » n'est plus une annonce :
   *  elle ne doit pas se voir reprocher d'être partie une seconde fois. */
  const seedGone = (table, into) => {
    const rows = db.prepare(
      `SELECT tokenId FROM ${table} w WHERE kind = 'gone'
       AND t = (SELECT MAX(t) FROM ${table} WHERE tokenId = w.tokenId)`,
    ).all();
    for (const r of rows) into.delete(key(r.tokenId));
  };

  /** La forme unique d'une clé de Map. SQLite rend 463, la chaîne rend 463, et
   *  `join(":")` rend "463" : sans elle, ce sont trois entrées pour une. */
  const key = (x) => String(x);

  const seed = (table, keyCols, valCols, into) => {
    const rows = db.prepare(
      `SELECT ${keyCols.join(",")}, ${valCols.join(",")} FROM ${table} w
       WHERE t = (SELECT MAX(t) FROM ${table} WHERE ${keyCols.map((c) => `${c} IS w.${c}`).join(" AND ")})`,
    ).all();
    for (const r of rows) into.set(keyCols.map((c) => key(r[c])).join(":"), valCols.map((c) => r[c]).join(":"));
  };
  try {
    seed("floor", ["classValue", "side"], ["floorEth", "listed", "pelotonEth"], last.floor);
    seed("tally", ["epoch", "desk"], ["weight"], last.tally);
    seed("ballot", ["epoch", "desk"], ["ticker"], last.ballot);
    seed("listing", ["tokenId"], ["priceEth"], last.listing);
    seedGone("listing", last.listing);
    seed("shelf", ["tokenId"], ["askPrinter"], last.shelf);
    seedGone("shelf", last.shelf);
    seed("machine", ["tokenId"], ["weight", "ink"], last.machine);

  } catch {
    // Une base neuve n'a rien à relire, et une base illisible se réécrira.
  }

  /**
   * N'écrit que si la valeur a changé. Rend 1 si elle a été couchée.
   *
   * La clé est normalisée ici et nulle part ailleurs. `seed()` la reconstruit
   * depuis SQLite avec un `join(":")`, qui rend une chaîne ; les appelants à
   * clé unique passent le tokenId tel que la chaîne le donne, un nombre.
   * `Map.get(463)` ne trouvait donc pas `Map.set("463")` : à chaque
   * redémarrage, la reprise ne servait à rien et les dix mille machines se
   * réécrivaient à l'identique. 98% de la table venait de là.
   */
  const onChange = (bag, rawKey, value, write) => {
    const k = key(rawKey);
    if (bag.get(k) === value) return 0;
    bag.set(k, value);
    write();
    return 1;
  };

  return {
    db,
    last,

    /** Un balayage entier, en une transaction. Rien d'à moitié écrit. */
    record(d, { ink, weights } = {}) {
      const t = d.at;
      const counts = { tick: 0, floor: 0, tally: 0, ballot: 0, listing: 0, shelf: 0, machine: 0 };

      db.exec("BEGIN");
      try {
        stmt.tick.run(
          t, num(d.pot?.usd), num(d.eth?.usd), num(d.printer?.usd),
          num(d.printer?.marketCap), num(d.printer?.volume24h), num(d.printer?.liquidityUsd),
          num(d.pot?.fleetWeight), big(d.protocol?.activeMachines), big(d.protocol?.epoch),
          d.protocol?.totalInkBurned ? Number(BigInt(d.protocol.totalInkBurned) / 10n ** 18n) : null,
          big(d.protocol?.ceiling), num(d.protocol?.sellFeeBps),
          num(d.collection?.floorEth), num(d.collection?.volumeEth), num(d.collection?.sales),
          num(d.anvil?.spotPrinter), num(d.anvil?.shelf), num(d.anvil?.cratePrinter),
          d.anvil?.paused === null || d.anvil?.paused === undefined ? null : (d.anvil.paused ? 1 : 0),
          num(d.book?.listed), num(d.totals?.inked), num(d.totals?.dormant),
        );
        counts.tick = 1;

        for (const r of d.rows ?? []) {
          for (const [side, cell] of [["inked", r.inked], ["dormant", r.dormant]]) {
            const key = `${r.classValue}:${side}`;
            const v = `${cell.floorEth}:${cell.listed}:${cell.pelotonEth}`;
            counts.floor += onChange(last.floor, key, v, () =>
              stmt.floor.run(t, r.classValue, side, num(cell.floorEth), num(cell.listed), num(cell.pelotonEth)));
          }
        }

        const epoch = big(d.protocol?.epoch);
        for (const dk of d.vote?.desks ?? []) {
          counts.tally += onChange(last.tally, `${epoch}:${dk.index}`, String(dk.votedWeight), () =>
            stmt.tally.run(t, epoch, dk.index, dk.votedWeight));
          counts.ballot += onChange(last.ballot, `${epoch}:${dk.index}`, String(dk.ticker ?? ""), () =>
            stmt.ballot.run(t, epoch, dk.index, dk.ticker ?? null));
        }

        // Le carnet : ce qui est apparu, ce qui a changé de prix, ce qui est parti.
        //
        // Tout ce qui est indexé par tokenId l'est par `key()`. SQLite rend des
        // nombres, la chaîne aussi, et `seed()` en faisait des chaînes : trois
        // sources pour une même clé de Map, où 463 et "463" sont deux entrées
        // différentes. Une seule forme, posée ici, et les trois s'accordent.
        const seen = new Set();
        const shelfSeen = new Set();
        for (const r of d.rows ?? []) {
          for (const cell of [r.inked, r.dormant]) {
            for (const e of cell.entries ?? []) {
              seen.add(key(e.tokenId));
              // Le genre se déduit de la présence, il n'entre pas dans l'état
              // comparé : sinon la valeur passe de « prix:new » à « prix:price »
              // au second passage et chaque balayage réécrit tout le carnet.
              const kind = last.listing.has(key(e.tokenId)) ? "price" : "new";
              counts.listing += onChange(last.listing, e.tokenId, String(e.priceEth), () =>
                stmt.listing.run(t, e.tokenId, e.priceEth, kind));
            }
            for (const e of cell.anvilEntries ?? []) {
              shelfSeen.add(key(e.tokenId));
              const kind = last.shelf.has(key(e.tokenId)) ? "price" : "new";
              counts.shelf += onChange(last.shelf, e.tokenId, String(e.askPrinter), () =>
                stmt.shelf.run(t, e.tokenId, e.askPrinter, kind));
            }
          }
        }
        for (const id of [...last.listing.keys()]) {
          if (seen.has(id)) continue;
          last.listing.delete(id);
          stmt.listing.run(t, Number(id), null, "gone");
          counts.listing++;
        }
        for (const id of [...last.shelf.keys()]) {
          if (shelfSeen.has(id)) continue;
          last.shelf.delete(id);
          stmt.shelf.run(t, Number(id), null, "gone");
          counts.shelf++;
        }

        // Poids et encre : lus toutes les dix minutes, ils ne bougent qu'à
        // chaque brûlure. Une valeur inchangée n'écrit rien.
        for (const [id, w] of weights ?? []) {
          const burned = ink?.get(id);
          const inked = burned === undefined ? null : Number(burned / 10n ** 18n);
          counts.machine += onChange(last.machine, id, `${Number(w)}:${inked}`, () =>
            stmt.machine.run(t, id, Number(w), inked));
        }

        db.exec("COMMIT");
      } catch (e) {
        try { db.exec("ROLLBACK"); } catch {}
        throw e;
      }
      return counts;
    },

    /** Vrai si l'affaire n'avait jamais sonné — et elle est alors notée. */
    claimAlert(key, tokenId, kind, t, cooldownMs = 0) {
      const seen = db.prepare("SELECT 1 FROM alerted WHERE key = ?").get(key);
      if (seen) return false;
      // Et pas deux fois pour la même machine dans la journée, quel que soit son
      // prix : une annonce retirée et remise à un centime près est la même.
      if (cooldownMs) {
        const last = db.prepare("SELECT MAX(t) t FROM alerted WHERE tokenId = ?").get(tokenId);
        if (last?.t && t - last.t < cooldownMs) return false;
      }
      db.prepare("INSERT INTO alerted VALUES (?,?,?,?)").run(key, t, tokenId, kind);
      return true;
    },

    close() { try { db.close(); } catch {} },
  };
}

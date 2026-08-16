import { createHash } from "node:crypto";

/**
 * Politique de cache, apprise à la dure le 2026-08-16.
 *
 * Le serveur n'envoyait aucun en-tête. Cloudflare a donc appliqué son défaut
 * aux fichiers .js — quatre heures — tout en laissant passer le HTML et l'API
 * en DYNAMIC. Un navigateur s'est retrouvé à exécuter un script vieux d'une
 * version contre des données à jour : le nouveau snapshot range les photos dans
 * `entries[]`, l'ancien code les cherchait dans `half.machine`, et la page a
 * affiché un tableau silencieusement faux — sans vignettes, avec une colonne
 * supprimée depuis. Rien n'a planté, rien n'a signalé quoi que ce soit.
 *
 * La parade n'est pas de demander « ne cache pas » : c'est de rendre l'URL du
 * script dépendante de son contenu. Un script qui change change d'adresse, donc
 * aucun cache au monde ne peut servir l'ancien à la place du nouveau.
 */

/** Dix caractères suffisent : la collision demanderait 2^40 versions. */
export function assetHash(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 10);
}

export function assetPath(hash) {
  return `/app.${hash}.js`;
}

export function stampPage(html, hash) {
  return html.replace('src="/app.js"', `src="${assetPath(hash)}"`);
}

const POLICIES = Object.freeze({
  // Doit revalider à chaque visite : c'est elle qui porte l'adresse du script,
  // donc une page périmée annule tout le bénéfice du hachage.
  page: "no-cache",
  // Son URL est son contenu : la garder un an est sans risque.
  asset: "public, max-age=31536000, immutable",
  // L'adresse historique, qui ne peut pas changer de contenu : jamais cachée.
  "asset-unversioned": "no-cache",
  // Des prix de marché n'ont aucune raison d'être stockés où que ce soit.
  api: "no-store",
});

export function cacheHeaders(kind) {
  const value = POLICIES[kind];
  if (!value) throw new Error(`unknown cache policy: ${kind}`);
  return { "cache-control": value };
}

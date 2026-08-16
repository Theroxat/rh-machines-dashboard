/**
 * Garde le dernier payload réellement calculé.
 * Un balayage en échec enregistre son erreur et laisse le payload tranquille :
 * une page qui montre des chiffres d'il y a quatre minutes, étiquetés comme
 * tels, est utile. Une page vidée par un seul 503 ne l'est pas, et une page qui
 * montre silencieusement des chiffres partiels est pire que les deux.
 * `now` est passé plutôt que lu, pour que le comportement soit testable.
 */
export function createStore({ staleAfterMs = Infinity } = {}) {
  let data = null;
  let at = null;
  let lastError = null;

  return {
    succeed(payload, now = Date.now()) {
      data = payload;
      at = now;
      lastError = null;
    },
    fail(error, now = Date.now()) {
      lastError = error?.message ?? String(error);
      void now;
    },
    get(now = Date.now()) {
      const ageMs = at === null ? null : now - at;
      return {
        data,
        at,
        ageMs,
        lastError,
        stale: ageMs === null ? true : ageMs > staleAfterMs,
      };
    },
  };
}

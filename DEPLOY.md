# Déployer

**La prod a des visiteurs.** Chaque `docker compose up -d --build` sur
`rh-dashboard` la coupe. Le trou était de 56 secondes, dont 25 où rien
n'écoutait — le tunnel rendait un refus de connexion, c'est-à-dire une page
d'erreur du navigateur. Vingt déploiements dans un après-midi font vingt minutes
de site mort pour du travail qui n'était pas encore prêt à être vu.

## La règle

On développe sur le banc. On ne touche la prod que pour livrer, et
délibérément.

```bash
# ── le banc, autant qu'on veut ─────────────────────────────────────────────
npm test                                                    # d'abord, toujours
docker compose --profile staging up -d --build rh-dashboard-staging
until curl -sf http://192.168.0.11:3051/api/snapshot >/dev/null; do sleep 5; done
#   → http://192.168.0.11:3051

# ── la prod, quand c'est prêt et vérifié ──────────────────────────────────
docker compose up -d --build rh-dashboard
```

Le banc :

- tourne sur **3051** (vérifié libre sur cet hôte, conteneurs arrêtés compris),
  et n'est pas exposé par le tunnel ;
- écrit dans **`data-staging/`**, pas dans l'historique qui sert ;
- a le **webhook Discord coupé** — sans quoi chaque essai sonnerait chez le
  porteur ;
- ne redémarre pas tout seul : un banc mort ne doit alerter personne.

Il est derrière un profil, donc `docker compose up -d` seul ne le lance pas.

## Ce que coûte encore un déploiement

Le serveur écoute désormais **avant** de précharger. Pendant les ~55 secondes de
premier balayage, la page se charge et annonce *« No data yet — the first sweep
is still running »* au lieu de rendre une erreur de connexion. Un test l'exige :
`server.listen` doit précéder la première lecture.

Ce n'est pas du zéro-interruption — les données sont indisponibles pendant ce
temps — mais un site qui s'annonce en train de démarrer n'est pas un site mort.

## L'arrêter

```bash
docker compose --profile staging down rh-dashboard-staging
```

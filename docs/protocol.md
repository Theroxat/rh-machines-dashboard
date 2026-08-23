# RH MACHINES — ce que le protocole fait, et comment on le sait

État au 2026-08-17, epoch 1, avant le premier scrutin et avant la première
distribution.

Ce document sépare trois choses que la conversation mélange vite : ce qui est
**vérifié on-chain**, ce qui est **documenté** sans être vérifiable aujourd'hui,
et ce qui reste **ouvert**. Quand le premier vote et le premier drop auront eu
lieu, la dernière section devient une liste de contrôle.

---

## 1. La carte des contrats

Chaîne Robinhood, id 4663, RPC `https://rpc.mainnet.chain.robinhood.com`.

| Nom | Adresse | Rôle | Source |
|---|---|---|---|
| MACHINES | `0xB509e195bcB3E4461e235Ff152c68D66915f67b5` | le NFT, 10 000 pièces | publique |
| MINE | `0x3C4E763E87Ac5775A23aE2eb2e69F90232f413E1` | poids, ink, epochs, desks | publique |
| TRAITS | `0x8a0833f41cE9e869d6ebd8aC16EfDC9Ee7a38a22` | traits scellés | publique |
| TOKEN | `0x85a574f2fF0795685F58d1D7B0D4b51F148Ac489` | `$PRINTER` | publique |
| VAULT | `0x03645012b560Ea96Ab9a050dF98C72BfCBc9bE4F` | The Anvil, teneur de marché | bundles du terminal |
| VOTE | `0x315A3aefa0F8547e79E85e0Ce644DA2A149a018F` | le scrutin | bundles du terminal |
| DISTRIBUTOR | `0xf1C50FfEB5cC8A50B153cEEd1b7Dd0C42f3e5438` | pousse les actions dans les comptes | bundles du terminal |
| SWAPPER | `0xE43244260Ee978F28fD2052481a5E6E1FAcEbDc6` | achète les actions | bundles du terminal |
| HOOK | `0x3685cc4Aa1266813Fa0EF346853341b0778C80Cc` | frais de vente Uniswap | dérivée |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | stable de référence | **voir §6** |
| MULTICALL3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | lectures groupées | standard |

Les quatre adresses marquées « bundles du terminal » ne sont documentées nulle
part. Elles viennent de l'objet `addresses` publié en clair par les bundles
JavaScript de `rh.btcmachine.gg`, relevé le 2026-08-17, puis vérifié en
appelant chaque contrat. **Aucun des contrats publics n'y renvoie** : c'est le
seul chemin pour les trouver, et il peut changer sans préavis.

---

## 2. Le poids — vérifié

```
poids = rareté × √( ink brûlée ÷ 4 250 )
```

**La rareté** est scellée avant le lancement et vient du **couvre-chef**. Sept
classes, exposées par MINE :

| classe | machines | part |
|---|---|---|
| x1 | 7 131 | 71,3 % |
| x1.5 | 407 | 4,1 % |
| x2 | 1 356 | 13,6 % |
| x3 | 559 | 5,6 % |
| x4 | 429 | 4,3 % |
| x6 | 81 | 0,8 % |
| x10 | 37 | 0,4 % |

La correspondance couvre-chef → classe est dérivée des données, pas écrite en
dur : 25 valeurs de couvre-chef, zéro ambiguïté, et le comptage obtenu
reproduit exactement le recensement publié. Un couvre-chef qui deviendrait
ambigu serait annoncé sur la page plutôt que rangé de force.

**L'ink** est brûlée par le porteur. Racine carrée : quatre fois l'ink double le
poids. Un plafond monte avec le total brûlé par la communauté — x2 à 25 M, x3 à
60 M, x4 à 100 M, plus de limite après 150 M. Une brûlure qui dépasserait le
plafond courant est refusée, pas silencieusement écrêtée.

**Vérification faite** : la somme de `MINE.weightOf` sur les 10 000 machines
égale exactement `MINE.totalWeight()`. Le poids que la page affiche est celui
sur lequel le protocole compte, et non une racine carrée que je recalculerais.

État lu le 2026-08-17 : `totalWeight = 1 087 611`, `activeMachines = 6 663`,
`currentEpoch = 1`.

---

## 3. L'activation — vérifié, avec une part non lisible

Activer coûte **5 000 $PRINTER** :

- **4 250 brûlent en ink.** `MINE.ACTIVATION_INK()` le publie, et c'est le
  dénominateur de `√(ink/4250)`.
- **750 sont une charge d'exploitation.** Elle ne brûle pas, et **aucune vue
  d'aucun contrat ne l'expose**. Elle vient de la documentation seule.

C'est pour ça que `OPERATING_CHARGE_PRINTER = 750` est écrit dans
`src/config.js`, nommé et isolé, plutôt que fondu dans un total qui se lirait
comme une lecture on-chain. La part brûlée décide du poids ; la facture entière
décide de ce que l'activation coûte. Les confondre a produit un vrai bug : le
bandeau annonçait $40 pendant que les prix au point comptaient $47.

**Trois états d'activité**, et ils ne sont pas interchangeables :

| état | ink | gagne | vote |
|---|---|---|---|
| Dormant | aucune | non | non |
| Lit | inkée cette epoch | **à partir de la suivante** | non |
| Earning | active une epoch pleine | oui | oui |

Le délai « Lit » est un coût réel que le dashboard **ne compte pas encore** :
acheter une dormante et l'activer coûte une epoch entière sans revenu, soit
3,5 jours. Voir §7.

---

## 4. Le desk — vérifié

Chaque machine appartient à un des 16 desks, scellé au mint.

`MINE.deskOf(tokenId)` donne l'index et fait autorité. Le **nom** du ticker ne
vient d'aucun contrat : il se déduit de la couleur du corps, en appariant les
comptages de la chaîne au recensement publié.

**Vérification faite, à l'échelle complète** : `deskOf` lu sur les 10 000
machines, recoupé avec la déduction par couleur — les 16 desks se nomment sans
une seule contradiction, et le recensement on-chain reproduit les comptes au
machine près.

| index | ticker | machines | index | ticker | machines |
|---|---|---|---|---|---|
| 0 | NVDA | 1 245 | 8 | TSLA | 562 |
| 1 | AMD | 1 239 | 9 | GME | 661 |
| 2 | MSFT | 886 | 10 | SPCX | 532 |
| 3 | GOOGL | 876 | 11 | SLV | 78 |
| 4 | RDDT | 888 | 12 | PLTR | 66 |
| 5 | AAPL | 1 322 | 13 | USAR | 53 |
| 6 | AMZN | 911 | 14 | ETH | 111 |
| 7 | COST | 514 | 15 | USDG | 56 |

La chaîne range, la couleur nomme. Si les deux divergeaient un jour, la page le
signale au lieu de trancher.

---

## 5. La répartition — documentée, pas encore observable

C'est le cœur, et c'est là que je me suis trompé une fois.

Le trésor n'achète pas un seul tas. Il achète **un tas par desk voté**, et la
taille de chaque tas est **proportionnelle aux voix** de l'epoch. Un desk sans
voix ne reçoit rien. Une epoch sans aucune voix ne peut pas être clôturée :
rien n'est acheté et le trésor est reporté.

Sur chaque tas, toute machine *earning* touche au prorata de son poids, et
celles qui portent le desk du tas **comptent double**.

```
part(m, d) = tas_d × [ poids_m × (2 si m porte d, sinon 1) ]
                   ÷ [ Σ poids effectifs sur ce tas ]
```

### La conséquence qui compte

En sommant sur tous les tas, pour une machine `m` de poids `w` sur le desk `k` :

```
revenu(m) = w × [ Σ_d  tas_d / (W + W_d)  +  tas_k / (W + W_k) ]
```

où `W` est le poids total *earning* et `W_d` le poids *earning* du desk `d`.

**Le crochet ne dépend pas de `w`.** Donc :

> Le revenu est **exactement proportionnel au poids**, multiplié par un
> coefficient qui ne dépend que du desk.

C'est ce qui autorise la métrique du dashboard : deux machines sur le même desk,
celle qui pèse deux fois plus touche exactement deux fois plus, quel que soit le
vote. Le prix d'un point de poids est donc la bonne mesure, et le classement des
classes ne bouge pas avec le scrutin.

### Ce que le desk vaut vraiment

Le seul terme qui distingue deux desks est `tas_k / (W + W_k)`. Son amplitude
dépend entièrement de la concentration du vote :

| vote | écart entre le meilleur et le pire desk |
|---|---|
| réparti également sur les 16 | **0,7 %** |
| concentré sur un seul desk | **×2** |

J'ai d'abord annoncé 0,7 % en supposant les tas égaux. **C'était le plancher de
la fourchette présenté comme la réponse.** L'hypothèse était signalée comme
fragile ; elle était fausse. Le desk peut compter beaucoup.

Détail contre-intuitif qui survit : à vote égal, **un petit desk vaut mieux
qu'un gros**, parce que sur un gros desk tous vos voisins doublent en même temps
que vous et l'effet se dilue.

### Le vote

- Une machine vote **avec son poids**, pas pour une voix. Une x6 pèse six fois
  une x1 au même niveau d'ink.
- Seules les machines actives **au début de l'epoch** votent — pas de brûlure de
  dernière minute pour peser sur le scrutin.
- Une voix par machine et par epoch, enregistrée contre le token id : revendre
  après avoir voté ne produit pas une seconde voix.
- Fenêtre de 48 h dans une epoch de 3,5 jours. Égalités tranchées vers
  l'adresse la plus basse.

### État lu le 2026-08-17

```
closesAt(1) = 0        → aucun bulletin ouvert
finalized(1) = false
desksFor(1)  → revert
tally(1, 0..15) = 0    → aucune voix
```

Rien n'a commencé. Le dashboard distingue trois états qu'un tableau de zéros
confondrait : illisible, pas encore ouvert, ouvert et personne n'a voté.
Annoncer « 0 % du pot » avant que quiconque puisse voter se lirait comme un
rejet unanime.

---

## 6. Ce que le dashboard mesure

### Le prix d'un point de poids

Un point vaut ce que porte une x1 tout juste activée.

```
inkée    :  prix
dormante :  prix + activation (5 000 $PRINTER)
            ÷ (poids ÷ 100)
```

La dormante porte l'activation parce qu'elle ne pèse rien tant que rien n'a
brûlé. L'omettre ferait passer les dormantes bon marché pour les meilleures
affaires du tableau.

Sans taux lu, aucune conversion inventée : la machine sort du classement plutôt
que d'y entrer à zéro.

**Ce que ça a fait ressortir** (relevé du 2026-08-17) : la classe x3 achète le
poids le moins cher, la x10 le plus cher — quatre fois plus par point. Le floor
global de la collection n'est pas la meilleure affaire, c'est le ticket le moins
cher. Et #3210, une x3 ayant brûlé 17 000 $PRINTER, porte un poids de 600 tout
en étant listée au prix d'une x3 ordinaire.

### Deux pièges déjà désamorcés

- **Le faux USDG.** Un jeton homonyme donnait un prix ETH faux de 5 %. L'adresse
  est épinglée et un garde de dépeg à 3 % refuse la lecture si elle dérive.
- **Les machines détenues par l'Anvil.** Un listing OpenSea qui subsiste pour
  une machine du rayon est inexécutable et tirait le floor vers le bas. Ces
  listings sont écartés et comptés dans `excluded.heldByAnvil`.

### Ce que le rayon de l'Anvil ne dit pas

Le rayon reste libellé en `$PRINTER` dans les deux vues. Ses entrées ne portent
pas de poids ink-ajusté, donc un prix au point y sous-estimerait le poids d'une
machine re-inkée. C'est une limite assumée, pas un oubli : la corriger demande
d'attacher le poids aux entrées du rayon côté serveur.

---

## 7. Ce qui reste ouvert

À trancher quand le premier scrutin et le premier drop auront eu lieu.

### Questions posées, réponses obtenues

> **La part d'une machine, c'est son poids ÷ le poids total, avec le double sur
> son propre desk comme seul ajustement ?**

Réponse d'un modérateur : presque — les tas sont dimensionnés par le vote, et le
dénominateur change à chaque tas. Intégré en §5.

### Questions encore ouvertes

1. **Le coefficient réel par desk.** Aujourd'hui je ne sais donner qu'une
   fourchette de 0,7 % à ×2. Au premier vote clos, `tally(epoch, desk)` donne
   les vraies parts et le coefficient se calcule exactement.

2. **Le délai « Lit » n'est pas dans la métrique.** Une dormante activée ne
   gagne qu'à l'epoch suivante — 3,5 jours de revenu nul que le prix au point
   ignore. À intégrer, côté dormant uniquement, une fois qu'on connaîtra le
   revenu d'une epoch et donc ce que l'attente coûte réellement.

3. **La taille du pot.** Le rendement se paie avec les frais de vente du token.
   Rien dans le dashboard ne dit combien le trésor a accumulé ni ce qu'une epoch
   distribue. C'est le dernier chiffre manquant pour passer d'un prix au point à
   un vrai rendement.

4. **Le poids *earning*, pas le poids total.** Mes calculs utilisent
   `totalWeight`. La répartition, elle, porte sur les machines *earning*. Avec
   6 663 actives sur 10 000, l'écart n'est pas négligeable et il faut vérifier
   lequel des deux le distributeur emploie.

5. **`desksFor(epoch)` révoque** avant l'ouverture du bulletin. À revérifier une
   fois ouvert : c'est probablement la liste des desks ayant reçu des voix, et
   elle éviterait de sonder les 16 index un par un.

### Le premier drop a eu lieu — 2026-08-21

Le bulletin de l'epoch 2 est clos et finalisé. Le pot est passé de **$170 023 à
$19 828** : environ **$150 000 dépensés en actions**, versées dans le compte
ERC-6551 de chaque machine.

**Le modèle est confirmé, et dans le détail.**

| vérification | résultat |
|---|---|
| deux machines du même desk, poids différents | #4347 (poids 200) reçoit **exactement le double** de #5769 (poids 100), sur chacune des sept actions |
| le doublement sur son propre desk | #5769 (desk SPCX) reçoit `0.008849576905786901` de SPCX, #463 (desk GME) `0.004424788452893450` — **ratio 2,0000** |
| chacun touche tout, quel que soit son desk | les sept actions distribuées apparaissent dans **chaque** compte |
| le dénominateur | `totalWeight`, et la dilution en `W + W_desk` est confirmée |
| le montant annoncé par la page | **$77.77 prédit, $76.49 reçu — 1,6 % d'écart** |

Le test le plus dur porte sur le terme de dilution, celui que le partage naïf
ignore. Calée sur la seule tranche `energy`, la formule prédit les trois autres :

| tranche | voix | poids du desk | prédit | observé | écart |
|---|---|---|---|---|---|
| energy | 38,18 % | 1 728x | *(calage)* | 0,020967567 | — |
| materials | 18,84 % | 1 564x | 0,010465451 | 0,010481821 | **0,16 %** |
| financials | 5,66 % | 1 208x | 0,003225458 | 0,003217661 | **0,24 %** |
| utilities | 2,04 % | 827x | 0,001195128 | 0,001191483 | **0,31 %** |

Le résidu vient des machines qui ont brûlé depuis la distribution.

### Ce que personne n'avait annoncé : les tranches non achetables

Trois actions votées **n'ont pas été distribuées sous leur propre nom** : AMD
(18,84 %), AMZN (5,66 %) et GME (2,04 %) — 26,5 % du pot. Aucun compte n'en
contient.

Leurs tranches ont été **versées en NVDA**, l'action la plus votée, **en
conservant la structure de chaque tranche** : les machines du desk AMD touchent
toujours le double sur la tranche AMD, simplement payée en NVDA. C'est ce qui
explique qu'une machine du desk `materials` reçoive 29 % de NVDA de plus qu'une
machine de même poids sur un autre desk, et une machine `utilities` 3,3 % de
plus — exactement les rapports que la part de vote de chaque desk prédit.

Le protocole a donc géré l'impossibilité d'achat sans casser la répartition.
Rien dans la documentation ne le mentionne.

### Ce qui reste à vérifier

- **Une machine « Lit » a-t-elle bien touché zéro ?** Non testé : il aurait
  fallu repérer avant la clôture une machine inkée pendant l'epoch.
- **Deux comptes sur huit sont vides** sur le desk gagnant (#4 et #12, tous deux
  inkés). Leurs propriétaires ont probablement vidé le compte ERC-6551, qui leur
  appartient — mais ce n'est pas démontré.

## 8. Sécurité — état au 2026-08-17

Audit fait ce soir, rien à corriger au-delà de ce qui l'a été.

| point | état |
|---|---|
| dépendances runtime | `ethers` seul, `npm audit` : 0 vulnérabilité |
| clé OpenSea | jamais dans git, jamais dans le payload ; `OPENSEA_API_KEY` en variable d'environnement uniquement |
| `config.json` versionné | ne contient que des réglages, aucun secret |
| conteneur | `USER node` (uid 1000), non privilégié, aucune capability ajoutée |
| port | lié à `192.168.0.11:3050`, pas à `0.0.0.0` |
| CSP | `default-src 'none'`, images limitées à `i2c.seadn.io`, `frame-ancestors 'none'` |
| en-têtes | `nosniff`, `no-referrer`, `X-Frame-Options: DENY` |
| écritures | aucune. Le service ne signe rien, ne détient aucune clé, ne fait que lire |

**Le seul champ réellement contrôlé de l'extérieur** est le `tokenId` renvoyé
par OpenSea. Il passe par `Number()` et n'est retenu que s'il est un entier
strictement positif — il ne peut donc porter aucun balisage.

Les tickers viennent d'un recensement figé de seize chaînes. Ils sont malgré
tout échappés à l'entrée du balisage : la sûreté ne doit pas dépendre du fait
que la source est aujourd'hui en dur, et un test le vérifie.

### Rappel hors périmètre

Signalé en son temps, non traité, et ce n'est pas au dashboard de le faire :
Vaultwarden et Immich sont exposés publiquement par le tunnel sans Cloudflare
Access, et l'énumération DNS retrouve chaque sous-domaine en quelques secondes.

---

## 9. Notes d'exploitation

- Le carnet est balayé toutes les **60 s**, l'ink toutes les **600 s**.
- `readVote` fait 18 `eth_call` par balayage du carnet, soit 18/min sur le RPC
  public. Groupables en un multicall si ça devenait impoli.
- `deskOf` est lu **une seule fois au démarrage** : le desk est scellé au mint.
- Le payload de l'API pèse ~400 Ko, sérialisé une fois par snapshot et servi
  avec un ETag — une revalidation coûte 0 octet.
- Le script est servi sous `/app.<hash>.js`, immuable. La page est en
  `no-cache`. Sans ça Cloudflare servait un `app.js` vieux de quatre heures.

---

## PRINTER.FUN — le memepad de l'écosystème

Ajouté à l'écosystème le 2026-08-23. On y lance une pièce adossée à une action
Robinhood tokenisée, échangée sur une courbe de liaison libellée dans cette
action. **1% de chaque échange rachète et brûle du $PRINTER** ; un dixième de ce
frais revient à qui a lancé la pièce (`creatorShareBps = 1000`).

### Les contrats

| rôle | adresse | vérification |
|---|---|---|
| factory A | `0x0C8c78ab91b87a03659c8AD4A11e6d23d5Ab869b` | `coinsCount()` répond |
| factory B | `0x285c1778a6714480aa0fCC468317E621096F1cec` | `coinsCount()` répond |
| trésorerie | `0x81c63D977aA9C2e6Ed5d51abE3fbfF2d2C23BC20` | `treasury()` sur les deux |
| propriétaire | `0xFa382a4009327B8BC868c9fdBCa49d35834E19dF` | `owner()` sur les deux |

Aucun contrat public ne les référence : les adresses viennent des bundles du
site, chacune recoupée par un appel on-chain — même méthode que pour `VOTE`,
`SWAPPER` et `DISTRIBUTOR`.

**Les deux factories tournent en parallèle.** La seconde n'a pas remplacé la
première : elles partagent la trésorerie et reçoivent toutes les deux des
lancements. N'en lire qu'une manque 121 pièces sur 274. Un test l'exige.

### Pourquoi la chaîne et pas leur API

`https://www.printer.fun/api/coins` se contredit dans un seul payload :

- 28 pièces au tableau, alors que les factories en comptent 274 ;
- `vol1hUsd: 0` et `buys1h + sells1h: 0` sur toutes les pièces, dans le même
  document que 25 échanges horodatés des 58 dernières minutes ;
- un échange à `$1 545 709` sur un pad qui n'immobilise pas $13 000.

Les deux factories, elles, tiennent le compte exact. Le tableau de bord ne lit
que `coinsCount()`, `allCoins(i)` et `coins(token)`, et les prix des actions de
base par la même route DexScreener que le reste du service.

### Les deux montants, et pourquoi les deux

**Argent immobilisé** (`realBase × prix de l'action) : ce que des acheteurs ont
réellement versé et qui se trouve encore dans la courbe.

**Capitalisation nominale** (prix marginal × jeton émis) : sur une courbe à
réserves virtuelles, elle porte en très grande partie sur des jetons que personne
n'a achetés. Au 2026-08-23 elle vaut **70×** l'argent réellement présent.

Les deux sont affichés côte à côte, jamais l'un à la place de l'autre. Un test
refuse que le second paraisse seul.

### État au 2026-08-23

274 pièces lancées · 3 graduées · **149 jamais échangées (54%)** · 134 créateurs
· $12 529 immobilisés · 11 actions de base, dont le $PRINTER lui-même
(69 pièces, $4 855 immobilisés).

### Cadence et transport

Le pad est relu toutes les 10 minutes (`padPollIntervalMs`) et servi sur
`/api/pad`, pas dans le snapshot : 16 Ko gzippés qui ne bougent qu'aux dix
minutes n'ont rien à faire dans un document qui repart toutes les 15 secondes.
La page le charge à l'ouverture de l'onglet, avec ETag et 304.

### Ce qui n'est pas mesuré

Le **$PRINTER brûlé par le pad** ne l'est pas. La brûlure réduit l'offre totale
— aucun solde ne s'accumule sur une adresse morte — et les machines brûlent de
l'encre dans la même offre. Les séparer demanderait les journaux d'événements,
qui sortent de la fenêtre du RPC. Rien n'est donc avancé là-dessus.

La **date de lancement** d'une pièce ne l'est pas non plus. `allCoins(i)` donne
l'ordre de création au sein d'une factory, mais les deux tournent en parallèle :
il n'existe pas d'ordre global sans horodatage de bloc. Le classement est donc
par argent immobilisé, et aucune section « lancements récents » n'est affichée.

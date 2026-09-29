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

### Graduer vide la courbe

Remplir sa courbe fait **graduer** la pièce : les réserves partent dans une
vraie pool et la pièce s'y échange. Son `realBase` retombe donc à zéro — par
construction, pas par abandon.

La première version de cet onglet triait tout par argent immobilisé et dérivait
« jamais échangée » de `realBase`. Les trois seules réussites du pad
s'affichaient donc **en gris, au rang 126 sur 274, sous la mention « never
traded »** — l'exact contraire de ce qui leur était arrivé. Deux corrections :
`untouched` exclut les graduées, et le classement ne porte que sur celles encore
sur leur courbe.

Les graduées ont leur propre section, lue sur DexScreener par adresse de jeton :
pool, capitalisation, volume 24 h, nombre d'échanges. C'est là qu'est
l'essentiel de l'activité — JDOG seul échange en un jour plus de dix fois ce que
les 272 courbes retiennent en tout.

**Courbe pleine n'est pas graduée.** Déployer la pool est un appel séparé
(`deployPool(token)`) : une pièce peut rester à 100 % sans avoir gradué, et la
ligne le dit au lieu d'afficher « 100% ».

### État au 2026-08-23

275 pièces lancées · 3 graduées · **147 jamais échangées (53%)** · 134 créateurs
· $12 487 dans les courbes · $33 322 dans les pools des graduées · $167 147
échangés en 24 h sur 2 122 trades · 11 actions de base, dont le $PRINTER lui-même
(69 pièces).

### Ce qui bouge

La page disait ce qui existe, pas ce qui se passe : tout y aurait été identique
si le pad avait été gelé huit jours. Il ne l'est pas — vingt pièces sont nées
pendant les vingt-quatre minutes qui ont suivi la mise en service.

Le pad est enregistré dans la base d'historique (`pad`), une ligne par courbe et
seulement quand elle bouge, et relu **toutes les 2 minutes** (un balayage complet
prend 1,7 s ; les 10 minutes d'origine étaient de la prudence inutile).

Trois pièges, tous rencontrés et tous corrigés :

**L'écart se mesure en unités de l'action, jamais en dollars.** Une courbe
adossée à NVDA « gagne » 15% le jour où NVDA les gagne, sans que personne n'y
ait mis un centime. La conversion se fait à la fin, au cours du moment.

**Rencontrer une pièce n'est pas la voir naître.** Au premier enregistrement,
les 280 pièces déjà lancées reçoivent toutes leur première trace au même
instant. Les compter comme des lancements affichait **« +281 launched »** un
matin où pas une seule n'était née. Une pièce n'est neuve que si sa première
trace est postérieure au tout premier relevé.

**Graduer n'est pas une fuite d'argent.** La courbe se vide dans une pool.
Compté comme flux sortant, TONER prenait la tête des courbes qui refroidissent
— à **−$6 760**, le plus gros « départ » de la fenêtre — le jour même où elle
réussissait. Une graduation sort du flux et se nomme.

Tant que l'enregistrement est plus jeune que la fenêtre demandée, la page
annonce la fenêtre réelle (« since 24 minutes ago — all we have watched »)
plutôt que de prétendre couvrir 24 h.

### Les homonymes

Rien n'empêche deux pièces de porter le même nom, et le pad en est plein :
**126 jetons sur 300** partagent leur symbole avec un autre. Un lancement est
copié dans les créneaux qui le suivent — dix-sept ZEUB aux indices 129 à 145,
seize wallets différents, tous dans la même factory.

Le tableau montrait dix-sept lignes identiques avec un lien d'achat sur chacune.
Qui clique sur la mauvaise paie un imposteur. Chaque ligne porte maintenant
l'adresse de qui l'a lancée, et un repère :

- `first` — le premier à porter ce nom ;
- `copy n/m` — les suivants ;
- `shared name` — quand le groupe est à cheval sur les deux factories.

`allCoins(i)` rend l'ordre de création : **au sein d'une même factory**, l'indice
le plus bas est l'original, et c'est démontrable. Les deux factories tournant en
parallèle, un groupe qui les enjambe (11 cas : JDOG, BRRR, PAPO, INK…) n'a pas
d'ordre, et aucun rang n'est alors avancé plutôt qu'un rang inventé.

### La course et le cimetière

Le pad prend **~140 pièces par jour** (mesuré sur 7,5 h d'enregistrement) et
plus de la moitié n'est jamais achetée. Le classement les portait toutes : 174
lignes rigoureusement identiques — $0, $0, « never traded » — sur 322, et des
milliers d'ici un mois. Ce n'est plus de l'exhaustivité, c'est du bruit.

Deux sections désormais :

- **Racing to graduate** — les courbes qui tiennent de l'argent et n'ont pas
  gradué, par proximité de la graduation. Une pièce à zéro n'est pas dernière de
  la course : elle n'y est pas.
- **Launched and never traded** — les autres, en pastilles : un nom, un lien,
  et le repère d'homonyme. Chacune reste trouvable (c'est peut-être la sienne
  qu'on cherche) sans occuper une ligne de tableau pour dire zéro.

### Les niveaux portent leur sens

`$8,886 in the curves` sortait de `$16,435` le matin même, et rien ne le laissait
voir. L'écart affiché vient du flux mesuré — entré moins sorti — donc il ne
compte pas les graduations, qui vident une courbe sans que personne n'ait vendu.

### Deux sources, dites

Pool, capitalisation, volume 24 h et nombre d'échanges des graduées viennent des
données de marché des pools, sur une fenêtre de 24 h. Tout le reste est lu sur la
chaîne toutes les deux minutes. La page le dit : sans quoi un lecteur croit lire
un seul instrument.

### Cadence et transport

Le pad est relu toutes les 2 minutes (`padPollIntervalMs`) et servi sur
`/api/pad`, pas dans le snapshot : 16 Ko gzippés n'ont rien à faire dans un
document qui repart toutes les 15 secondes.
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

---

## Le Proton et son coffre

Ajouté à l'écosystème le 2026-08-22, avec la refonte du site officiel
(`rhmachines.com`). On y sacrifie une machine pour en alourdir une autre :
80% de réussite annoncés, sacrifice dormant → cible ×1.5, sacrifice actif →
+1.5× son poids.

### Les contrats

| rôle | adresse | vérification |
|---|---|---|
| Proton | `0xbA28ac2377291E1d92B4cB5fD587dC24604dA8aE` | `nextCommitId()` répond |
| coffre (Factory) | `0xE4979E6c766a239C8e491433d42E697B22fAcf40` | `heldCount()` répond |
| propriétaire des deux | `0xA08c58FCC285D9Cd48b7122293C8a62446AA3d17` | `owner()` sur les deux |

Aucun des deux n'est vérifié sur l'explorateur. Les adresses viennent de
`/api/protonConfig` du site officiel, chacune recoupée on-chain.

### La machine n'est pas brûlée

C'est le point que rien ne dit et qui change tout. Le commentaire du
développeur, dans leur propre bundle :

> *« commit (pay fee, **sacrifice leaves to the Factory**), wait ~2 blocks,
> then reveal the roll »*

La machine quitte le portefeuille **au commit, avant le tirage**. Elle n'est
pas détruite : `totalSupply` du NFT reste à 10 000, vérifié. Elle change de
propriétaire, un point c'est tout.

Le coffre expose **`releaseMachine(uint256,address)`**, réservée au
propriétaire — simulée depuis celui-ci sur une machine détenue : l'appel passe ;
depuis une adresse quelconque : `OwnableUnauthorizedAccount`. Le propriétaire
est une **clé simple, pas un multisig** (0 octet de bytecode), et il contrôle
aussi le Proton. `renounceOwnership()` existe et n'a pas été appelée.

Il expose également `sweepStock(address,address,uint256)` : sortir les actions
accumulées vers l'adresse de son choix. Simulée depuis le propriétaire, elle
passe le contrôle d'accès et n'échoue que sur `ERC20InsufficientBalance`.

**Aucun abus constaté** : 178 entrées, 0 sortie. La fonction a probablement une
raison légitime. Mais « enfermée » n'est pas « brûlée », et la page le dit.

### Ce que le coffre fait vraiment

Le site annonce que la Factory *« les active et partage leurs revenus avec la
flotte »*. Au 2026-08-25 : **172 des 178 machines dorment**. Six sont allumées,
600 points au total. La promesse n'est pas tenue aujourd'hui.

### Le taux d'échec

77 fusions, 54 gagnées, 22 perdues → **28,9% d'échec contre 20% annoncés**.

L'écart n'est pas concluant : sur un tirage honnête à 80/20, une série aussi
mauvaise survient environ **une fois sur 25**. La page publie les deux — le
compte brut et la probabilité qu'il ne soit qu'un hasard — parce que publier le
premier seul accuse, et taire les deux cache. Il faudrait quelques centaines de
fusions pour trancher.

Les révélations tardives (`lateDraw`) sont comptées à part : ce n'est pas un dé
perdu, c'est un joueur qui n'est pas revenu à temps.

### La combustion du $PRINTER

Le rapprochement tombe au centième près :

```
  offre frappée            200 000 000
  − offre actuelle         155 814 801   (totalSupply, lu)
  − encre brûlée            43 285 199   (totalInkBurned, lu)
  = brûlé autrement            900 000
```

Dont **425 000 par le Proton**, mesurés sur ses évènements `FuseCommitted`. Le
reste vient des rachats du pad et du swap.

### Lecture des journaux

Cette chaîne produit un bloc toutes les 0,1 s : les journaux défilent en
quelques heures. La lecture remonte par tranches de 100 000 blocs jusqu'à 20
tranches vides consécutives, puis **se recoupe avec `nextCommitId()`**. Sans ce
recoupement, un taux d'échec calculé sur un échantillon amputé aurait l'air
aussi sérieux que le vrai. Quand le compte ne retombe pas, aucun taux n'est
présenté et la page le dit.

### Effet sur les floors

178 machines ne peuvent pas être mises en vente. L'offre réellement échangeable
est de **9 822**, pas 10 000 — et le coffre gagne ~48 machines par jour. Le
ratio d'annonces affiché s'en écarte de 0,12 point aujourd'hui ; dans un mois,
au même rythme, l'écart serait de plus d'un point.

---

## Recoupement du site officiel (2026-08-25)

La refonte de `rhmachines.com` publie trois pages chiffrées — Flywheel, Burn,
Stock. Recoupées une à une contre la chaîne.

### Ce qui concorde

`activeMachines()` rend **7 495**, exactement ce que le tableau de bord affiche.
L'epoch est bien 4. La combustion totale — 44 185 199 sur 200 000 000, soit
**22,1%** — se recoupe au centième.

### Ce qui ne concorde pas

**Leur site se contredit lui-même sur la combustion.** La page Flywheel annonce
« 21.2% gone », la page Burn « 22.1% of the 200M cap ». Le calcul donne 22,09% :
la page Burn a raison, celle du Flywheel est figée et accuse **1 785 199 de
retard**.

**Leur compte de machines actives est en cache.** Ils affichent 7 458 contre
7 495 on-chain. L'écart n'est ni le coffre (178) ni ses machines allumées (6) :
c'est une valeur qui n'est pas recalculée à la vue.

### Le taux de combustion, et pourquoi le nôtre diffère

La page Burn annonce **175 098 $PRINTER/h**, sous un bandeau « live ». C'est une
moyenne depuis le lancement, écrasée par la ruée d'activation des premiers
jours. Mesuré sur notre historique :

| fenêtre | rythme réel |
|---|---|
| 6 dernières heures | ~13 000 /h |
| 24 dernières heures | ~52 000 /h |
| 3 derniers jours | ~32 000 /h |
| tout notre relevé (6 j) | ~48 000 /h |

Soit **trois à treize fois** sous leur affichage. Leur chiffre n'est pas faux —
il est mal cadré : une moyenne sous un bandeau « live » se lit comme un rythme
courant. Notre page nomme sa fenêtre et met les deux côte à côte.

### Le pot : deux définitions, pas une erreur

Leur page Stock annonce **$35 630 « READY FOR STOCK »**, décomposé ainsi :

| poste | montant | vérifié |
|---|---|---|
| in the pot · USDG, ready | $19 031 | **oui** — solde USDG du SWAPPER, $19 038 relevé |
| ETH fees · converting | $13 477 | non localisé |
| USDG fees · converting | $2 016 | non localisé |
| $PRINTER · converting | $1 107 | partiellement — $7 443 de $PRINTER au VAULT |

Notre `pot` lit le solde USDG du SWAPPER : **ce qui est déjà converti et prêt à
acheter des actions**. Le leur y ajoute les frais encaissés et pas encore
convertis, répartis dans des contrats que nous n'avons pas tous identifiés.

Les deux définitions sont défendables. La nôtre est plus conservatrice et
entièrement vérifiable ; la leur est plus complète et invérifiable en l'état.
**Nous gardons la nôtre**, faute de pouvoir recouper les $16 600 restants : un
pot annoncé sur des soldes qu'on n'a pas su trouver serait un chiffre repris,
pas un chiffre lu.

---

## La provenance des chiffres

Le tableau de bord reproche au terminal officiel de ne pas cadrer ses sources.
Il ne peut pas s'en dispenser. La page *How it works* porte désormais la
répartition ligne par ligne, en trois groupes qui ne disent pas « fiable /
douteux » mais quelque chose de plus utile :

| genre | ce que le lecteur peut en faire |
|---|---|
| **lu sur la chaîne** | refaire la lecture et devoir trouver le même chiffre |
| **servi par un tiers** | faire confiance, ou ne pas s'en servir |
| **calculé ici** | notre arithmétique, et donc là où vivent nos erreurs |

### Ce qui n'est pas on-chain, et pourquoi ça ne peut pas l'être

**Tous les prix demandés** viennent d'OpenSea — c'est-à-dire le sujet même du
site. Les ordres Seaport sont signés hors chaîne et ne la touchent qu'à
l'exécution : il n'existe aucun carnet d'ordres à lire à la place. On pourrait
lire les ventes *conclues*, mais ce serait un historique, pas un prix demandé.

**Tous les montants en dollars** viennent de DexScreener (repli CoinGecko pour
l'ETH). La chaîne connaît les réserves d'une pool, jamais un cours. Les deux
paires sont épinglées par adresse : la leçon a été payée deux fois — l'imposteur
USDG qui price l'ETH 5% faux, et le jour où la paire s'est inversée.

Ce sont des **limites, pas des raccourcis**, et la page les nomme comme telles.

### Le garde-fou

`src/sources.js` déclare les hôtes tiers. Un test balaie tout `src/`, extrait
chaque URL appelée, et **échoue si un hôte est interrogé sans être déclaré** —
vérifié en injectant une fausse source : la suite tombe avec le nom de l'hôte
fautif. L'inverse est vrai aussi : un hôte déclaré qui n'est appelé nulle part
fait échouer la suite, pour que la page ne nomme rien qu'elle n'interroge.

La documentation ne peut donc pas dériver du code sans que quelqu'un s'en
aperçoive.

---

## Recoupement du Flywheel (2026-08-26)

Leur page Flywheel, reprise ligne par ligne contre la chaîne.

### Ce qui est exact

**255 machines fusionnées** — vérifié, `balanceOf` du coffre rend exactement 255.

### Ce qui est en retard

| leur affichage | la chaîne | écart |
|---|---|---|
| « 21.2% gone » | **22,47%** | 2 540 448 jetons |
| « 7 458 machines earning » | **7 507** | 49 machines |

Le 21,2% est le même chiffre figé que le 2026-08-25 : il n'a pas bougé d'un
dixième pendant que 2,5 millions de $PRINTER brûlaient. Leur propre page Burn
affiche le bon.

### Ce qui ne se produit pas

> *« the Factory activates them & shares their stock with the fleet »*

**6 machines allumées sur 255. 249 dorment.**

Ce n'est plus « pas encore » : le coffre est passé de 178 à 255 en deux jours et
le nombre d'allumées **n'a pas bougé d'une seule**. Les six qui tournent sont
celles qui étaient déjà actives au moment du sacrifice.

### Le pot : $59 210 contre $35 467

Leur « STOCK POT · buys real tokenized equities every epoch ». Localisé :

| poste | montant | ce que c'est |
|---|---|---|
| SWAPPER, en USDG | **$35 467** | prêt à acheter des actions — **notre pot** |
| VAULT, en $PRINTER | $11 549 | le fonds de roulement de l'anvil |
| pad factory B | $7 692 | les réserves des courbes du memepad |
| pad treasury | $819 | frais du pad non convertis |
| divers | $305 | |
| **localisé** | **$55 832** | |
| introuvable | $3 378 | 6% |

Les $11 549 de l'anvil sont sa **capacité d'achat de machines**, pas de l'argent
qui achètera des actions. Les $7 692 du pad appartiennent aux détenteurs de
memecoins, pas aux porteurs de machines. Annoncer les trois sous « buys real
tokenized equities every epoch » gonfle d'environ $19 000 ce qui sera réellement
distribué.

Nous gardons notre définition : **le solde USDG du swapper**, c'est-à-dire ce
qui est converti et prêt. C'est aussi exactement la ligne « in the pot, ready »
de leur propre page Stock.

## Le Meltdown (2026-09-23)

Annoncé par @btcordinal (« RH MACHINE collection is now down to 6521 — we have
burned the entire Factory »). Vérifié on-chain le jour même.

### Deux « burns » qui n'ont rien de commun

| | combien | où ça se lit | réversible |
|---|---|---|---|
| envoyées à `0x…dEaD` | 3 497 | `ownerOf`, journaux `Transfer` | non |
| marquées `Status: Burned`, toujours détenues | 4 381 (1 400 porteurs) | métadonnées hors chaîne seulement | oui, par l'équipe |

**L'adresse morte.** 3 477 des 3 497 sortent du coffre du Proton
(`0xE4979E6c…`), en 3 486 transactions `releaseMachine(uint256,address)`
(`0xbb37d716`) signées par son propriétaire `0xA08c58FC…`, entre 01:29 et 04:04
UTC. Le reste — une vingtaine — a été envoyé directement par des porteurs.
Le coffre ne se remplissait pas par les seules fusions : depuis au moins le
2026-09-13, les porteurs y déposaient eux-mêmes leurs machines par un proxy
ERC-1967 `0x687e2D91…` (implémentation `0x812d7d63…`, non vérifiée), sélecteur
`0x16194de3(uint256[],address)`, qui émet un compteur par dépôt. 2 668 dépôts,
344 expéditeurs, sur les neuf jours lus. Personne n'a été dépossédé de force.

**Les marquées.** Toutes les machines sous 2x au moment du Meltdown ont vu leur
`rhmachines.com/meta/{id}.json` réécrit : `Status: Burned`, `Burned In: The
Meltdown`, fond `Blood Red`, **nouveau Headwear** (« Broken Halo », « Sold At A
Big Loss », « Crowned Devil »…), `Weight (x): 0`, nouvelle image IPFS. Les
2 120 `Active` restantes sont toutes à 2x ou plus.

### Ce qui n'a pas bougé

- Aucun `Upgraded` sur le NFT, MINE ni TRAITS ; les implémentations sont celles
  d'avant. `totalSupply` = 10 000.
- `MINE.weightOf` donne toujours leur poids aux marquées : 437 232 au total
  (100, 200, 466…). Le `totalWeight` officiel (22 649) retombe à l'unité près
  sur la somme vivantes + marquées + adresse morte. « Ne pèsera plus jamais »
  est donc une déclaration de l'équipe, pas un fait de la chaîne — à revérifier
  si le distributeur ou MINE change.

### Ce que ça a changé ici

- OpenSea n'expose plus les machines de l'adresse morte (d'où « 6 521 » puis
  6 503), et ne publie plus les traits `Wallet`, `Desk` ni `Weight`. Relire tout
  le cache des métadonnées aurait effacé les comptes 6551 des machines.
- Le statut et l'image sont relus à part (`readLiveStatus`, boucle `status`,
  10 min). Les traits du cache restent ceux du mint : le nouveau Headwear des
  marquées ferait sinon exploser la dérivation couvre-chef → classe.
- Troisième case `burned` par classe. Floor de collection et capitalisation sur
  les seules vivantes.

## Le Rituel noir (2026-09-23)

Annoncé le soir même du Meltdown (@btcordinal, 22:50 UTC) : les brûlées
deviennent la matière première d'une nouvelle catégorie, les **Dark Machines**.

| | |
|---|---|
| contrat | `0x207455FDbb3F0DEc567b9c83176FCee3e0940506`, pas un proxy, 8 016 octets |
| propriétaire | `0xA08c58FC…`, la même clé que le Proton et le coffre |
| ouverture | bloc 70 867 555, 2026-09-23 22:22 UTC (premier journal) |
| coût | 4 brûlées (« fuel », parties à `0x…dEaD`) + 1 vessel + 10 000 $PRINTER + ~0,0165 ETH |
| mécanique | machine à sous de 100 tours, objectif 235 points, graine fixée au `perform()` |
| annoncé | 60 % de réussite |

Source de l'adresse : `/api/dark` du site officiel, recoupée on-chain — les
journaux `Charged`/`Settled` retombent exactement sur les compteurs de l'API
(31 rituels, 19 gagnés, 10 perdus, 2 en cours, 124 machines brûlées au
2026-09-24). Le vessel doit prouver par Merkle (`vesselProof`) qu'il est une
brûlée ; la racine est publiée par l'API.

**Taux observé : 19 sur 29 réglés, 65,5 %**, au-dessus des 60 % annoncés.

**La #23 est Dark sans rituel.** Publiée `Status: Dark Machine` par les
métadonnées et listée par `/api/dark`, elle n'apparaît dans aucun journal du
contrat — ni comme vessel, ni comme carburant. Marquée à la main. À l'inverse,
OpenSea avait six Dark de retard sur la chaîne le jour de l'ouverture.

**Aucun poids retiré.** `MINE.weightOf` donne toujours 100 à 700 aux Dark
Machines. « No weight » est, comme pour les brûlées, une déclaration de
l'équipe ; les « 10× sur printer.fun et les jeux » ne sont visibles dans aucun
contrat lu ici.

Métadonnées d'une Dark : aucun trait de rareté (ni Body, ni Headwear, ni
Eyes), `Forged In: The Dark Ritual`, une image commune — « Art is not yet
revealed ». La dérivation des classes s'appuie sur le cache du mint, elle n'en
souffre pas.

## Le contrat de drop par tours (2026-09-03)

`0xFAc5FD9cabD83A97596063E853632122a901AF9d`, pas un proxy, propriétaire
`0xA08c58FC…` (la clé du Proton), keeper `0xcC86E51c…`. Il a remplacé le
distributeur `0xf1C50FfE…` pour le drop NVDA du 3 septembre : `airdrop(uint256[])`
pousse les parts par lots, `shareOf(id)` et `paidThisRound(id)` en gardent la
trace. `roundId()` = 1 au 2026-09-24 ; aucun drop depuis.

- 7 689 machines payées, **193 avec une part enregistrée et jamais versée**,
  16,3 NVDA en tout. Le contrat ne détient plus de NVDA : ces parts ne sont pas
  financées. Le porteur ne peut rien réclamer — seul le keeper pousse.
- Le jeton d'un tour n'est exposé par aucune vue. Celui du tour 1 (NVDA,
  `0xd0601CE1…`) est figé dans `DROPS.rounds` ; un tour inconnu se dit « une
  part », sans symbole.
- La page du portefeuille affiche la ligne de ce qui est dû, sous les totaux.

### La règle de partage a changé — reportée le 2026-09-26

Le drop du 21 août suivait les tranches proportionnelles aux voix (§7, vérifié
à 0,3 %). Depuis le 27 août, chaque drop ne contient **qu'une action** (AMD le
27/08, AAPL le 2/09, NVDA le 3/09) : c'est le « winner takes all » que la doc
officielle décrit désormais, gagnant exclu quatre epochs.

`epochUsd` rend désormais `pot × w × (desk gagnant ? 2 : 1) ÷ (W + W_gagnant)`,
la formule du 21 août réduite à une tranche, avec le desk en tête du scrutin
comme gagnant, et le partage à plat sans voix. **`W` est le poids des machines
qui gagnent** — ni adresse morte, ni brûlées, ni Dark — et non le `totalWeight`
de MINE : le terminal officiel divise par son « earning weight » (17 554 contre
22 812 le 2026-09-26) et annonce aux brûlées « earn nothing ». L'ancien calcul
sous-estimait chaque part d'environ un quart. Recoupé : 15 points de poids,
pot de $25 480 → $21,77 ici, $21,75 sur le terminal.

### Le second contrat de rituel (2026-09-24)

Le lendemain de l'ouverture, 2026-09-24 à 19:14 UTC (bloc 71 611 854), l'équipe
a déployé `0x6adA619F5e8613BaDb833445F74f467eEeF98c3E` — même `owner()`, même
ABI, 8 274 octets, pas un proxy — et `/api/dark` l'annonce désormais. Rien ne
l'a signalé. Les numéros de rituel y **repartent à 1** : le rituel #20 du
second contrat (la #8643, gagnée le 2026-09-26 en 88 tours) n'est pas le #20
du premier. L'ancien contrat a émis ses derniers journaux au bloc 71 614 804.

Au 2026-09-26 : 36 rituels sur le premier, 20 sur le second, 56 en tout — le
compte de l'API. Le dashboard lit les deux, numérote les rituels dans l'ordre de
jeu, et suit un contrat suivant dès que l'API l'annonce, à condition que la clé
`0xA08c58FC…` le possède.

## Les Blue Machines (2026-09-28)

| | |
|---|---|
| contrat | `0xc5B4e6f1Aa1EE8579404B92C14dD4379208ed0f0`, 9 930 octets, pas un proxy |
| propriétaire | `0xA08c58FC…` (la clé du Proton) |
| ouverture | bloc 75 034 477, 2026-09-28 19:04 UTC |
| coût | 3 brûlées (à l'adresse morte) + 7 777 $PRINTER + 0,07 ETH ; la seconde d'un portefeuille : 2 brûlées + 6 913 $PRINTER |
| offre | 500 annoncées, 102 remises à des portefeuilles au 2026-09-29 |

Le contrat ne frappe rien : il **détient des machines existantes** et en remet
une à chaque mint. Il reçoit aussi des brûlées en paiement et les envoie à
l'adresse morte : sur 474 sorties au 2026-09-29, **372 allaient à `0x…dEaD`**
(dont 264 venues d'un seul portefeuille, `0x342ECC6F…`) et **102 à des
portefeuilles** — les vraies Blue, le compte d'OpenSea. Les métadonnées
marquent pourtant « Blue Machine » les 474 : 372 Blue détruites dès leur
passage. Les brûlées du mineur partent à `0x…dEaD` — pas à
`0x0` : le contrat NFT ne brûle toujours rien lui-même. L'inscription passe par
une checklist X hors chaîne (`/blue/apply`). Métadonnées : `Status: Blue
Machine`, `Revealed: No`, œuvre révélée au mint. OpenSea n'en publiait que 102
sur 474 le lendemain : la page lit la chaîne (les `Transfer` dont l'expéditeur
est le contrat Blue).

Les Blue gardent un poids sur MINE (100 à 200, celui des brûlées dont elles
viennent). Rien ne dit qu'elles touchent le pot : elles sont retirées du poids
gagnant et ne se voient promettre aucun drop.

### Le contrat NFT a été remplacé cinq fois le 2026-09-28

`Upgraded` à 20:49, 20:50, 20:55, 21:19 et 22:35 UTC, signés par la clé
propriétaire `0x355dCD59…` ; implémentation finale `0xfaa06e09…`, source non
vérifiée. `totalSupply` = 10 000. Le contenu des changements n'est pas lisible ;
aucune machine n'a été envoyée à `0x0` depuis.

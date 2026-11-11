# Cabas — Données ouvertes (produits, prix, enseignes)

> Le catalogue de produits et de prix vient d'**Open Food Facts**, d'**Open
> Prices** et d'**OpenStreetMap** (licence ODbL, voir
> [`DATA_LICENSE.md`](../DATA_LICENSE.md)). Ce document décrit le pipeline
> d'import, les règles de filtrage, le calcul des prix et des estimations, et
> la marche à suivre pour rafraîchir les données.

```
productSources.ts ──┐   (choix des produits, relu à la main)
                    │
 npm run data:fetch │   1. exports Open Prices (prices / locations .jsonl.gz)
                    │      + fiches Open Food Facts des codes-barres → .cache/open-data/
                    ▼
 npm run data:snapshot  2. filtres + médianes + indice d'enseigne
                    │      → src/data/openData/snapshot.json (versionné) + rapport
                    ▼
 npm run data:generate  3. produits, prix relevés, estimations, méta
                           → src/data/products.ts · prices.ts · meta.ts (générés)
```

| Fichier | Rôle |
|---|---|
| `src/core/openPrices.ts` | Fonctions PURES : détection d'enseigne, filtres, GTIN, agrégation, indice d'enseigne, allergènes et contenances Open Food Facts. Partagé avec l'Edge Function `collect-prices` (`npm run sync:shared`). |
| `scripts/open-data/fetch.mjs` | Téléchargements (Node pur, sans dépendance). |
| `scripts/open-data/build-snapshot.mjs` | Lecture en flux des exports, instantané, rapport de relecture. |
| `src/data/generator/buildCatalog.ts` | Générateur déterministe (imports de types uniquement). |
| `src/data/generator/run.mjs` | Écrit `products.ts`, `prices.ts`, `meta.ts`. |
| `src/data/productSources.ts` | Produits réels retenus par ingrédient (format `IngredientSource`). |
| `src/data/openData/snapshot.json` | Instantané versionné (base dérivée ODbL). |

## 1. Choisir les produits (`productSources.ts`)

Une entrée par ingrédient achetable :

```ts
{
  ingredientId: 'lentilles_corail',
  national: { ean: '3111952035624' },                       // marque nationale
  bio: { ean: '…' },                                         // variante bio (facultatif)
  mdd: [
    { ean: '3560070829651', chains: ['carrefour'] },         // marque distributeur
    { ean: '3250392603588', chains: ['intermarche', 'netto'] }, // MDD des Mousquetaires
  ],
  loose: { categoryTags: ['en:tomatoes'], pricePer: 'KILOGRAM', name: 'Tomates, en vrac' }, // vrac
  note: 'remarque de relecture',
}
```

- `ean` : code-barres réel (GTIN-13 / GTIN-8, clé valide, jamais un code
  « poids variable » 2…). Surcharges possibles si la fiche Open Food Facts est
  fausse : `name`, `brand`, `organic`, `packSize` (+ `packUnit`).
- `chains` d'une MDD : enseignes qui la vendent ; la MDD n'aura de prix que là.
- `loose` : vrac sans code-barres, prix Open Prices « par catégorie »
  (`KILOGRAM` ou `UNIT`), catégories par ordre de préférence, `organic` pour
  ne garder que les relevés bio, `packSize` facultatif.

**Identifiants** (les données des utilisateurs y font référence, ne pas les
changer) : `prd_<ingrédient>` (marque nationale), `prd_<ingrédient>_bio`,
`prd_<ingrédient>_mdd_<chaîne>` (chaîne = **première** enseigne de `chains`),
`prd_<ingrédient>_vrac`.

Pour valider le pipeline sans toucher au catalogue, chaque étape accepte une
liste JSON de même format : `--sources liste.json` — un tableau
d'`IngredientSource` ou `{ "productSources": [...] }`, lus par le même
`loadSources` (`scripts/open-data/lib.mjs`) aux trois étapes ; `--out`
obligatoire pour l'instantané et le générateur.

**Relecture** (tests d'intégrité) : un code-barres écarté (pizza au chorizo,
Grana Padano, pâte brisée végétale…) ne revient jamais ; une surcharge `name`
ne cache pas un mot distinctif de la fiche (« céréales », « graines »,
« grana », « pizza ») ; la contenance est le poids NET (« 2 l (1,4 kg) » →
1 400 g) et un sachet d'herbes compte en fraction de botte (11 g = 0,4 botte de
30 g) ; un allergène déclaré par au moins la moitié des fiches d'un
ingrédient (≥ 3) doit figurer sur l'ingrédient.

## 2. Téléchargements (`npm run data:fetch`)

- `https://prices.openfoodfacts.org/data/prices.jsonl.gz` et
  `locations.jsonl.gz` (exports quotidiens complets, ≈ 25 Mo) →
  `.cache/open-data/` (ignoré par git). Réutilisés pendant 20 h
  (`--refresh-dumps` pour forcer). Open Prices : au plus 1 requête / 2 s.
- Fiches Open Food Facts de tous les codes-barres de `productSources`, par
  lots de 100 : `GET /api/v2/search?code=<ean1,…>&fields=…&page_size=100`.
  **≤ 6 requêtes / min** (limite OFF : 10 recherches / min / IP), reprise sur
  503 / 429 avec attente croissante (15 s → 4 min). Cache
  `.cache/open-data/off-products.json` : seuls les codes absents sont
  redemandés (`--refresh-off` pour tout redemander). Les codes absents d'Open
  Food Facts sont listés.
- User-Agent `Cabas-dev/1.0 (open-data import)`, aucune information
  personnelle. Derrière un proxy (`HTTPS_PROXY`), le script se relance avec
  `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21).

## 3. Instantané (`npm run data:snapshot`)

### Filtres obligatoires (`normalizeObservation`)

Un relevé n'est retenu que si **toutes** ces conditions sont vraies :

| Règle | Détail |
|---|---|
| France métropolitaine | `osm_address_country_code === 'FR'` (ou, sans code, `osm_address_country === 'France'`) et code postal hors 97 / 98. L'API `/api/v1/prices` n'a **aucun** filtre pays : on filtre côté client. |
| Magasin d'une des 10 enseignes | voir détection ci-dessous ; `osm_tag_value ≠ 'fuel'` (stations-service exclues) |
| Monnaie | `EUR` |
| Pas un doublon | `duplicate_of` nul |
| Daté dans la fenêtre | date non nulle, entre J − 365 et la date de l'instantané (bornes incluses) |
| Quantité de ticket | `receipt_quantity` ≤ 1 ou absente (au-delà, prix unitaire ou total : ambigu) |
| Code-barres | GTIN-8 ou GTIN-13 à clé valide (UPC-A / GTIN-14 ramenés à 13 chiffres), jamais un code poids variable (13 chiffres commençant par 2) ; un code-barres relevé « au kilo » est écarté |
| Vrac | catégorie `xx:…` et `price_per` `KILOGRAM` ou `UNIT` |
| Prix normal | prix payé entre 0,01 € et 10 000 € ; promo : le prix barré `price_without_discount` devient le prix normal (supérieur au prix payé, **au plus 10 000 €** : une saisie « 9999999 » est écartée) ; **promo sans prix barré : relevé écarté**. L'instantané ne contient aucune promotion. |
| Données personnelles | le champ `owner` (pseudonyme) n'est jamais lu ni conservé |

### Détection d'enseigne (`detectChain`)

Texte replié (minuscules, sans accents), `osm_brand` d'abord, `osm_name`
seulement si `osm_brand` est vide :

| Enseigne | Motif |
|---|---|
| leclerc | `\bleclerc\b` |
| carrefour | `\bcarrefour\b` |
| auchan | `\bauchan\b` |
| intermarche | `\bintermarche\b` |
| superu | `^(super u\|hyper u\|u express\|utile\|systeme u\|marche u)\b` (jamais `u` seul) |
| lidl | `\blidl\b` |
| aldi | `\baldi\b` |
| netto | `\bnetto\b` |
| monoprix | `\bmonoprix\b\|\bmonop\b` |
| franprix | `\bfranprix\b` |

Format de **proximité** si la marque ou le nom contient `city`, `express`,
`contact`, `utile`, `daily`, `proxi` ou `monop` (mot entier, pour ne pas
classer tout Monoprix en proximité).

### Prix national d'une enseigne (`aggregateObservations`)

Pour chaque clé du catalogue — `ean:<gtin>`, `cat:<catégorie>:<KILOGRAM|UNIT>`
(vrac conventionnel) ou `…:organic` (vrac bio) — et chaque enseigne : **médiane
du prix normal** de ses relevés, en ne gardant que les relevés hyper / super
s'il y en a (les formats de proximité sont 12 à 22 % plus chers), arrondie au
centime. On conserve le nombre de relevés, les dates du premier et du dernier,
et `proximityOnly: true` quand la médiane ne repose QUE sur des formats de
proximité (163 prix relevés du catalogue) : le seed en fait un socle
« proximité », qu'un premier relevé hyper / super remplacera dans la collecte.

### Indice de prix des enseignes (`computeChainIndex`)

Leclerc = 1. Pour chaque enseigne : moyenne géométrique des ratios
`médiane enseigne / médiane Leclerc` sur les **mêmes codes-barres** (tous les
codes FR relevés, pas seulement ceux du catalogue), médianes hors proximité.
Mesuré si au moins **200** codes-barres communs, borné à [0,85 ; 1,6] ; sinon
a priori « presse » (`basis: 'press'`) : Lidl 0,98, Aldi 1,02, Netto 1,00
(repli des généralistes : comparatifs publics 2025-2026).

Instantané du 11 novembre 2026 (relevés du 11/11/2025 au 11/11/2026) :

| Enseigne | Indice | Base | Codes communs |
|---|---|---|---|
| Leclerc | 1,000 | mesuré | 20 785 |
| Carrefour | 1,084 | mesuré | 3 233 |
| Auchan | 1,115 | mesuré | 2 728 |
| Intermarché | 1,087 | mesuré | 1 451 |
| Super U | 1,145 | mesuré | 1 562 |
| Lidl | 0,98 | presse | 24 |
| Aldi | 1,02 | presse | 1 |
| Netto | 1,00 | presse | 0 |
| Monoprix | 1,274 | mesuré | 1 026 |
| Franprix | 1,439 | mesuré | 1 068 |

### Fiches Open Food Facts

Pour chaque code-barres : nom (`product_name_fr`, sinon `product_name`),
marques, contenance (`parseOffQuantity` : `product_quantity` +
`product_quantity_unit`, sinon le texte « 2 x 75 g », « 125 g x 4 »,
« 1 kg 500 », « 75 cl », « 6 œufs » ; valeur invraisemblable rejetée),
Nutri-Score, labels bio, allergènes
(`allergens_tags` → les 14 allergènes réglementaires, `mapOffAllergens`) et
traces (pour information).

**Allergènes** : un tag non reconnu (texte libre, autre langue) n'est jamais
ignoré : il est signalé dans le rapport, et un mot-clé reconnu (« avoine »,
« disulfite »…) ajoute l'allergène par prudence.

### Rapport de relecture

`data:snapshot` affiche : volumes par enseigne, indice, codes-barres
invalides / sans fiche / sans aucun relevé, vrac sans relevé, allergènes Open
Food Facts non reconnus ou absents de l'ingrédient, contenances illisibles.

## 4. Catalogue (`npm run data:generate`)

### Produits

- Contenance : surcharge de la source, sinon Open Food Facts, convertie dans
  l'unité de base de l'ingrédient (densité g ↔ ml, poids moyen pièce ↔ g) ;
  produit écarté (et signalé) si inconnue ou non convertible — **jamais
  « 1 ml = 1 g »** sans densité de l'ingrédient (préciser `packSize`).
- Nom : surcharge, sinon nom Open Food Facts nettoyé (espaces, capitales,
  marque répétée en tête) ; marque : surcharge, sinon la première marque
  Open Food Facts (signalé pour une MDD à plusieurs marques).
- **Allergènes = ingrédient ∪ Open Food Facts** : jamais moins que
  l'ingrédient. La sécurité repose sur l'ingrédient (`core/constraints`) ; le
  choix d'un produit dans le panier ne doit jamais proposer un produit
  portant un allergène déclaré du profil.
- Vrac : pas de code-barres, `offCategoryTag` = première catégorie ; vendu par
  « portion » : pièce moyenne (≥ 100 g) pour un ingrédient en g, 1 pièce pour
  un ingrédient à la pièce ; prix = prix au kilo (ou à la pièce) × portion.
  Le produit porte aussi les règles de l'instantané pour la collecte :
  `offCategoryTags` (toutes les catégories, par préférence), `offPricePer`
  (unité des relevés de la SOURCE : le concombre, au poids, se relève à la
  pièce) et `offPackFactor` (prix relevé → prix de la portion).
- Un produit sans aucun prix (ni relevé ni estimable) est écarté et signalé.

### Prix relevés (`source: 'open_prices'`)

Médiane nationale de l'enseigne (§ 3), `observationCount`, `observedFrom`,
`updatedAt` = date du dernier relevé. Une MDD n'a de prix que dans ses
enseignes (un relevé ailleurs, souvent un magasin mal identifié, est ignoré).

### Estimations (`source: 'estimate'`)

Toujours signalées « Estimé » dans l'app, jamais de promotion,
`updatedAt` = date de l'instantané, `estimateBasisCount` = nombre de relevés
réels utilisés. « Équivalent Leclerc » = prix relevé ÷ indice de son enseigne ;
les médianes sont pondérées par le nombre de relevés.

| Méthode | Quand | Calcul |
|---|---|---|
| `chain_index` | Marque nationale / bio sans relevé dans une enseigne **généraliste** (Leclerc, Carrefour, Auchan, Intermarché, U, Monoprix, Franprix) mais relevée ailleurs ; ou MDD vendue dans plusieurs enseignes (Intermarché / Netto), relevée dans l'une de **ses** enseignes mais pas dans l'autre | médiane des équivalents Leclerc (du produit lui-même) × indice de l'enseigne. Marque nationale **jamais** estimée chez Lidl, Aldi, Netto : on n'invente pas une disponibilité (une MDD n'est estimée que dans ses `storeChains`). |
| `mdd_ratio` | MDD sans **aucun** relevé dans ses enseignes | prix unitaire (€/kg, €/l, €/pièce) médian des MDD du même ingrédient (bio avec bio) relevées ailleurs, en équivalent Leclerc, × indice × contenance ; à défaut prix unitaire de la marque nationale × 0,75 |
| `category_median` | Vrac sans relevé dans une enseigne (toutes, discounters compris) | médiane nationale de la catégorie en équivalent Leclerc × indice de l'enseigne × portion |

### Méta (`catalogMeta`) et mentions

`meta.ts` : date de l'instantané, fenêtre des relevés, nombres de prix relevés
/ estimés, indice et couverture par enseigne, sources et licences, et
`lastCreatedAt` (horodatage exact du dernier relevé de l'export : curseur
initial de la collecte). `src/data/index.ts` en tire `PRICE_DATA_NOTICE`
(origine des prix, part estimée, caractère indicatif) et exporte
`DATA_ATTRIBUTION`, affichée sous les prix (onglet Prix, détail d'un article,
ticket de commande).

## 5. Catalogue actuel (instantané du 11 novembre 2026)

Relevés du 11/11/2025 au 11/11/2026 : 343 096 lus, **96 591 retenus**
(France métropolitaine, 10 enseignes, **660 magasins** ayant fourni au moins
un relevé retenu, sur 1 553 lieux candidats). Sources : 145 ingrédients
achetables (tous sauf l'eau), 835 codes-barres, 28 catégories vrac.

| | Produits |
|---|---|
| Marques nationales | 126 |
| Variantes bio | 66 |
| MDD | 643 |
| Vrac | 28 |
| **Total** | **863** |

**2 358 prix** : 1 142 relevés (48 %) et 1 216 estimés — 941 `chain_index`
(dont 70 MDD des Mousquetaires estimées chez Netto ou Intermarché d'après leur
propre relevé), 126 `mdd_ratio`, 149 `category_median`. 730 codes-barres sur 835 (87 %) ont au
moins un relevé ; 745 prix relevés reposent sur un seul relevé.

| Enseigne | Prix relevés | Prix estimés | Ingrédients chiffrés | dont relevés | Ingrédients de recette chiffrés |
|---|---|---|---|---|---|
| Leclerc | 241 | 89 | 145 | 131 | 138 / 138 |
| Carrefour | 216 | 107 | 145 | 123 | 138 / 138 |
| Auchan | 160 | 140 | 145 | 96 | 138 / 138 |
| Intermarché | 140 | 171 | 145 | 96 | 138 / 138 |
| Super U | 178 | 138 | 145 | 110 | 138 / 138 |
| Lidl | 46 | 35 | 76 | 42 | 72 / 138 |
| Aldi | 12 | 35 | 45 | 12 | 43 / 138 |
| Netto | 1 | 118 | 110 | 1 | 104 / 138 |
| Monoprix | 82 | 190 | 145 | 64 | 138 / 138 |
| Franprix | 66 | 193 | 145 | 49 | 138 / 138 |

Les **145 ingrédients** ont au moins un prix relevé. Chez les discounters, une
marque nationale n'est jamais estimée : un ingrédient n'y est chiffré que par
une MDD (relevée, estimée d'après son propre relevé dans l'enseigne sœur, ou
`mdd_ratio`) ou par le vrac.

Choix d'intégration (détails dans les `note` de `productSources.ts`) :

- **Vrac à la pièce** pour le chou-fleur, le concombre et la courge butternut
  (relevés `UNIT`, convertis par `gramsPerPiece`) : il n'y a presque aucun
  relevé au kilo. La collecte les rattache dans cette même unité
  (`offPricePer`).
- **Herbes fraîches** : sachets de 11 à 20 g, comptés en fraction de botte
  (persil 11 g = 0,4 botte de 30 g) ; jamais un sachet pour une botte.
- **Moules** : la fiche « 2 l (1,4 kg) » donne le volume du sac ; la
  contenance retenue est le poids net, 1 400 g.
- **Écartés à la relecture** (autre produit que l'ingrédient) : « Chorizo »
  Carrefour 3245413824899 (pizza au chorizo), « Parmesan » Lidl 4056489043157
  (Grana Padano), pâte brisée Auchan 3596710074686 (matière grasse végétale).
  Le pain de mie Aldi garde son vrai nom (« céréales & graines »).
- **Substituts** faute de produit à code fixe relevé (la viande à la coupe est
  en poids variable, exclue) : épaule d'agneau → gigot Pure South 2 kg ;
  filet mignon de porc → filet de porc mariné Nobles et pavés de porc U. Leurs
  entrées vrac (`en:lamb-shoulder`, `en:pork-filet-mignon`) restent prêtes
  pour le jour où un relevé existera.
- **Fiches obsolètes** : la recherche Open Food Facts ne renvoie pas les
  produits marqués « obsolètes ». Dix MDD encore relevées en 2026 (surtout
  Auchan) ont été lues une à une par l'API produit
  (`/api/v2/product/<code>`) et ajoutées au cache.
- **Marques** : raisons sociales et capitales d'Open Food Facts corrigées
  (« CARREFOUR FRANCE » → Carrefour, « Groupe Casino » → Monoprix…) ; la
  marque U s'affiche « Produits U ».
- **Allergènes** : la moutarde de Dijon porte les sulfites (disulfite de
  potassium, déclaré par 7 fiches sur 10) et le pesto les œufs (lysozyme du
  Grana Padano, 5 fiches sur 9) au niveau de l'INGRÉDIENT : les recettes qui
  les utilisent sont exclues pour ces profils. 49 produits portent encore des
  allergènes Open Food Facts absents de l'ingrédient. Ce sont souvent des traces saisies comme allergènes
  (lentilles « fruits à coque », baguette avec 12 allergènes…). Ils sont
  **conservés par prudence** : le produit est alors écarté pour ces profils. Les
  tags non reconnus (11, par exemple `en:beef` ou `fr:OGM`) ne sont pas des
  allergènes ou sont déjà couverts par un mot-clé. Une exception va dans le
  sens prudent : « fr:Blé noir » (le sarrasin) est lu comme du blé, donc la
  farine de sarrasin Reflets de France porte du gluten à tort.

## 6. Rafraîchir les données

```bash
npm run data:all          # fetch + snapshot + generate
npm test -- src/data      # intégrité : provenance, couverture, fichiers à jour
npm run seed:generate     # seed Supabase à partir de src/data
```

Relire le rapport de `data:snapshot` (fiches manquantes, allergènes à vérifier),
corriger `productSources.ts` si besoin (surcharges), relancer. Pour reproduire
un instantané : `npm run data:snapshot -- --date 2026-11-11` (avec les mêmes
exports). Le test d'intégrité recalcule le catalogue depuis `snapshot.json` et
échoue si `products.ts` / `prices.ts` / `meta.ts` ne sont pas à jour.

En production, l'Edge Function `collect-prices` complète l'instantané par une
collecte incrémentale Open Prices, avec les mêmes fonctions de
`core/openPrices.ts` (voir [`BACKEND.md`](BACKEND.md)).

## 7. Limites connues

- Couverture inégale : Leclerc, Carrefour, Auchan sont très relevés ; Lidl
  (566 relevés sur l'année), Aldi (83) et Netto (19) très peu → indices
  « presse » et prix surtout estimés (MDD et vrac). Un panier Lidl, Aldi ou
  Netto ne couvre qu'une partie des recettes (voir § 5).
- Quand tous les produits connus d'un ingrédient portent un allergène déclaré
  du profil (ex. le paleron de bœuf « lait »), l'article est signalé « écarté
  pour tes allergies », jamais « introuvable ».
- Netto n'a presque aucun relevé (1 prix relevé) : ses prix sont des
  estimations, avec un indice « presse » (1,00) faute de produits communs ;
  une MDD des Mousquetaires y est estimée d'après son prix Intermarché ÷ 1,087.
- Pas de rejet des valeurs aberrantes : un relevé isolé peut tirer une
  médiane (bananes en vrac à 4,49 €/kg chez Leclerc, citron vert à 1,79 € la
  pièce chez Lidl).
- Relevés bénévoles, concentrés sur quelques magasins et contributeurs : la
  médiane nationale peut s'écarter du prix d'un magasin donné (prix
  indicatifs).
- Les MDD des Mousquetaires (Intermarché / Netto) partagent leurs codes-barres :
  une seule fiche produit, vendue dans les deux enseignes (`storeChains`).
- Les fiches Open Food Facts sont contributives : contenance, marques, labels
  et allergènes peuvent être faux → surcharges dans `productSources.ts` et
  relecture du rapport.

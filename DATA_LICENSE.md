# Licence des données ouvertes

Le **code** de Cabas est sous la licence du fichier [`LICENSE`](LICENSE).
Les **données de produits, de prix et d'enseignes** embarquées dans l'app
viennent de bases ouvertes publiées sous **Open Database License (ODbL) 1.0**
et restent soumises à cette licence.

## Sources

| Base | Ce que Cabas en tire | Licence | Lien |
|---|---|---|---|
| Open Food Facts | Fiches produit : nom, marque, contenance, Nutri-Score, allergènes, labels bio | ODbL 1.0 (base) · DbCL 1.0 (contenus) | <https://world.openfoodfacts.org> · <https://world.openfoodfacts.org/terms-of-use> |
| Open Prices (projet Open Food Facts) | Prix relevés en magasin par la communauté (étiquettes, tickets) | ODbL 1.0 | <https://prices.openfoodfacts.org> |
| OpenStreetMap | Magasins (enseigne, adresse, type de commerce) auxquels les relevés sont rattachés | ODbL 1.0 · © contributeurs OpenStreetMap | <https://www.openstreetmap.org/copyright> |

Texte de la licence : <https://opendatacommons.org/licenses/odbl/1-0/>.

## Attribution

La mention suivante doit rester visible dans l'app, là où les prix sont
présentés (constante `DATA_ATTRIBUTION`, `src/data/index.ts`, reprise par
`DATA_ATTRIBUTION_LINE` de `components/feature/sources` : onglet Prix, détail
d'un article, ticket de commande — vérifié par les tests) :

> Produits : Open Food Facts · Prix : Open Prices · Enseignes : © contributeurs OpenStreetMap · Licence ODbL

Les sources, leurs liens et leur licence figurent aussi dans
`catalogMeta.sources` (`src/data/meta.ts`). Aucun logo d'enseigne n'est
reproduit (l'app affiche des initiales) et le Nutri-Score est affiché en
simple lettre.

## Base dérivée (partage à l'identique)

Cabas publie une **base dérivée** de ces données, versionnée dans ce dépôt
public (<https://github.com/niedraa/CABAS>), sous la même licence ODbL 1.0 :

| Fichier | Contenu |
|---|---|
| `src/data/openData/snapshot.json` | Instantané : fenêtre de dates, indice de prix des enseignes, pour chaque produit / catégorie du catalogue le prix médian de chaque enseigne (nombre de relevés, premier et dernier relevé), champs utiles des fiches Open Food Facts |
| `src/data/products.ts`, `src/data/prices.ts`, `src/data/meta.ts` | Catalogue généré à partir de l'instantané (fichiers générés) |
| `src/data/productSources.ts` | Choix des produits (codes-barres) par ingrédient |

Les traitements appliqués (filtres, médianes, estimations) sont décrits dans
[`docs/OPEN_DATA.md`](docs/OPEN_DATA.md) et entièrement reproductibles avec
les scripts de `scripts/open-data/` et `src/data/generator/` (`npm run data:all`).

**Prix estimés.** Une partie des prix n'est pas relevée mais calculée à partir
de prix relevés (indice de l'enseigne, MDD équivalente, médiane d'une
catégorie). Ils portent la provenance `estimate` et sont toujours signalés
« Estimé » dans l'app : ce ne sont pas des relevés.

## Données personnelles

Les exports Open Prices contiennent le pseudonyme des contributeurs (`owner`).
Ce champ n'est **jamais** lu ni conservé : l'instantané ne contient que des
agrégats (médianes, nombres de relevés, dates). Les appels aux API se font avec
un User-Agent générique, sans aucune information sur l'utilisateur.

## Limites

Les prix sont **indicatifs** : relevés par des bénévoles, à des dates
variables, dans certains magasins seulement, ils peuvent différer du prix en
rayon. Les frais de drive et de livraison (`src/data/stores.ts`) sont des
valeurs indicatives relevées sur les sites des enseignes et dans la presse.

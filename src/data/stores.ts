/**
 * Enseignes couvertes par Cabas — une entrée par enseigne (`id === chain`).
 *
 * Les PRIX sont nationaux : médiane des relevés Open Prices de tous les
 * magasins français de l'enseigne (voir `catalogMeta`), d'où `city: 'France'`.
 *
 * Services, frais et minimums : valeurs INDICATIVES relevées sur les sites des
 * enseignes et la presse (novembre 2026). Chez Leclerc, Intermarché et U,
 * chaque magasin fixe ses frais ; l'app les présente comme indicatifs.
 * - `pickup` : drive, click & collect, ou `none` (courses en magasin) ;
 * - `deliveryFeeCents: null` : pas de livraison à domicile ;
 * - `searchUrlTemplate` sans `{query}` : le site ne propose pas de recherche
 *   adressable (Netto, Franprix) — la page est ouverte telle quelle.
 *
 * Aucune donnée de marque (logo) : l'app affiche des initiales.
 * Ce fichier ne contient que des imports de types (chargeable par Node).
 */
import type { Store } from '../core/types';

export const stores: Store[] = [
  {
    id: 'leclerc',
    chain: 'leclerc',
    name: 'E.Leclerc',
    city: 'France',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 790,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.e.leclerc/recherche?q={query}',
    driveUrl: 'https://www.leclercdrive.fr/',
  },
  {
    id: 'carrefour',
    chain: 'carrefour',
    name: 'Carrefour',
    city: 'France',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 690,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.carrefour.fr/s?q={query}',
    driveUrl: 'https://www.carrefour.fr/',
  },
  {
    id: 'auchan',
    chain: 'auchan',
    name: 'Auchan',
    city: 'France',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 690,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.auchan.fr/recherche?text={query}',
    driveUrl: 'https://www.auchan.fr/',
  },
  {
    id: 'intermarche',
    chain: 'intermarche',
    name: 'Intermarché',
    city: 'France',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 750,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.intermarche.com/recherche/{query}',
    driveUrl: 'https://www.intermarche.com/',
  },
  {
    id: 'superu',
    chain: 'superu',
    name: 'Super U',
    city: 'France',
    pickup: 'drive',
    driveFeeCents: 0,
    deliveryFeeCents: 690,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.coursesu.com/recherche?q={query}',
    driveUrl: 'https://www.coursesu.com/',
  },
  {
    id: 'lidl',
    chain: 'lidl',
    name: 'Lidl',
    city: 'France',
    // Ni drive ni livraison alimentaire : la commande devient une liste à emporter.
    pickup: 'none',
    driveFeeCents: 0,
    deliveryFeeCents: null,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.lidl.fr/q/search?q={query}',
    driveUrl: 'https://www.lidl.fr/',
  },
  {
    id: 'aldi',
    chain: 'aldi',
    name: 'Aldi',
    city: 'France',
    pickup: 'none',
    driveFeeCents: 0,
    deliveryFeeCents: null,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.aldi.fr/recherche.html?query={query}',
    driveUrl: 'https://www.aldi.fr/',
  },
  {
    id: 'netto',
    chain: 'netto',
    name: 'Netto',
    city: 'France',
    pickup: 'none',
    driveFeeCents: 0,
    deliveryFeeCents: null,
    minOrderCents: 0,
    // Pas de recherche adressable sur netto.fr.
    searchUrlTemplate: 'https://www.netto.fr/',
    driveUrl: 'https://www.netto.fr/',
  },
  {
    id: 'monoprix',
    chain: 'monoprix',
    name: 'Monoprix',
    city: 'France',
    pickup: 'click_collect',
    driveFeeCents: 0,
    deliveryFeeCents: 800,
    minOrderCents: 6000,
    searchUrlTemplate: 'https://courses.monoprix.fr/search?q={query}',
    driveUrl: 'https://courses.monoprix.fr/',
  },
  {
    id: 'franprix',
    chain: 'franprix',
    name: 'Franprix',
    city: 'France',
    pickup: 'click_collect',
    driveFeeCents: 0,
    deliveryFeeCents: 399,
    minOrderCents: 1500,
    // Pas de recherche adressable vérifiable sur franprix.fr.
    searchUrlTemplate: 'https://www.franprix.fr/courses',
    driveUrl: 'https://www.franprix.fr/courses',
  },
];

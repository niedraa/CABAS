/**
 * Enseignes du catalogue de démonstration (agglomération lyonnaise).
 *
 * Un magasin par enseigne. L'identifiant du magasin est le nom de l'enseigne
 * (`leclerc`, `carrefour`…) : c'est ce que référencent les prix (`Price.storeId`)
 * et les magasins préférés du profil.
 *
 * Frais et minimums : valeurs indicatives observées sur les sites des
 * enseignes (le retrait drive est le plus souvent gratuit). Lidl n'a pas de
 * drive dans la plupart des villes : `driveUrl` pointe alors vers son site,
 * et la commande se résume à une liste à emporter en magasin.
 *
 * Gabarits de recherche : `{query}` est remplacé par le libellé du produit
 * encodé (encodeURIComponent) — voir `core/order.ts`.
 *
 * Ce fichier ne contient que des imports de types (chargeable par Node).
 */
import type { Store } from '../core/types';

export const stores: Store[] = [
  {
    id: 'leclerc',
    chain: 'leclerc',
    name: 'E.Leclerc Drive',
    city: 'Lyon',
    driveFeeCents: 0,
    deliveryFeeCents: null,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.e.leclerc/recherche?q={query}',
    driveUrl: 'https://www.leclercdrive.fr/',
  },
  {
    id: 'carrefour',
    chain: 'carrefour',
    name: 'Carrefour Drive',
    city: 'Lyon',
    driveFeeCents: 0,
    deliveryFeeCents: 599,
    minOrderCents: 1500,
    searchUrlTemplate: 'https://www.carrefour.fr/s?q={query}',
    driveUrl: 'https://www.carrefour.fr/drive',
  },
  {
    id: 'auchan',
    chain: 'auchan',
    name: 'Auchan Drive',
    city: 'Lyon',
    driveFeeCents: 0,
    deliveryFeeCents: 690,
    minOrderCents: 1500,
    searchUrlTemplate: 'https://www.auchan.fr/recherche?text={query}',
    driveUrl: 'https://www.auchan.fr/drive',
  },
  {
    id: 'intermarche',
    chain: 'intermarche',
    name: 'Intermarché Drive',
    city: 'Lyon',
    driveFeeCents: 190,
    deliveryFeeCents: 799,
    minOrderCents: 2000,
    searchUrlTemplate: 'https://www.intermarche.com/recherche/{query}',
    driveUrl: 'https://www.intermarche.com/',
  },
  {
    id: 'lidl',
    chain: 'lidl',
    name: 'Lidl',
    city: 'Lyon',
    // Pas de drive : retrait = courses en magasin, aucun frais, pas de livraison.
    driveFeeCents: 0,
    deliveryFeeCents: null,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.lidl.fr/q/search?q={query}',
    driveUrl: 'https://www.lidl.fr/',
  },
];

/**
 * Enseignes du catalogue de démonstration.
 *
 * - France (agglomération lyonnaise) : E.Leclerc, Carrefour, Auchan,
 *   Intermarché, Lidl, Super U, Monoprix ;
 * - Espagne (Barcelone) : Mercadona, Carrefour, Lidl, Dia, Alcampo, Eroski, Consum.
 *
 * Un magasin par enseigne et par pays. L'identifiant du magasin est le nom de
 * l'enseigne (`leclerc`, `mercadona`…), suffixé de `_es` pour les enseignes
 * présentes dans les deux pays (`carrefour_es`, `lidl_es`) : c'est ce que
 * référencent les prix (`Price.storeId`) et les magasins préférés du profil.
 *
 * `hasDrive` : retrait drive / click & collect. Sans drive, la commande se
 * résume à une liste à emporter en magasin (ou à la livraison si proposée).
 * Le minimum de commande ne s'applique qu'aux commandes en ligne.
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
  // ─── France ────────────────────────────────────────────────────────────────
  {
    id: 'leclerc',
    chain: 'leclerc',
    country: 'FR',
    name: 'E.Leclerc Drive',
    city: 'Lyon',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: null,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.e.leclerc/recherche?q={query}',
    driveUrl: 'https://www.leclercdrive.fr/',
  },
  {
    id: 'carrefour',
    chain: 'carrefour',
    country: 'FR',
    name: 'Carrefour Drive',
    city: 'Lyon',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: 599,
    minOrderCents: 1500,
    searchUrlTemplate: 'https://www.carrefour.fr/s?q={query}',
    driveUrl: 'https://www.carrefour.fr/',
  },
  {
    id: 'auchan',
    chain: 'auchan',
    country: 'FR',
    name: 'Auchan Drive',
    city: 'Lyon',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: 690,
    minOrderCents: 1500,
    searchUrlTemplate: 'https://www.auchan.fr/recherche?text={query}',
    driveUrl: 'https://www.auchan.fr/parcours-de-courses-drive/ep-parcours-de-courses-drive',
  },
  {
    id: 'intermarche',
    chain: 'intermarche',
    country: 'FR',
    name: 'Intermarché Drive',
    city: 'Lyon',
    hasDrive: true,
    driveFeeCents: 190,
    deliveryFeeCents: 799,
    minOrderCents: 2000,
    searchUrlTemplate: 'https://www.intermarche.com/recherche/{query}',
    driveUrl: 'https://www.intermarche.com/',
  },
  {
    id: 'lidl',
    chain: 'lidl',
    country: 'FR',
    name: 'Lidl',
    city: 'Lyon',
    // Pas de drive : retrait = courses en magasin, aucun frais, pas de livraison.
    hasDrive: false,
    driveFeeCents: 0,
    deliveryFeeCents: null,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.lidl.fr/q/search?q={query}',
    driveUrl: 'https://www.lidl.fr/',
  },
  {
    id: 'superu',
    chain: 'superu',
    country: 'FR',
    name: 'Super U Drive',
    city: 'Lyon',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: 690,
    minOrderCents: 1500,
    searchUrlTemplate: 'https://www.coursesu.com/recherche?q={query}',
    driveUrl: 'https://www.coursesu.com/',
  },
  {
    id: 'monoprix',
    chain: 'monoprix',
    country: 'FR',
    name: 'Monoprix',
    city: 'Lyon',
    // Pas de drive en général : courses en magasin ou livraison à domicile.
    hasDrive: false,
    driveFeeCents: 0,
    deliveryFeeCents: 599,
    minOrderCents: 5000,
    searchUrlTemplate: 'https://courses.monoprix.fr/search?q={query}',
    driveUrl: 'https://courses.monoprix.fr/',
  },
  // ─── Espagne ───────────────────────────────────────────────────────────────
  {
    id: 'mercadona',
    chain: 'mercadona',
    country: 'ES',
    name: 'Mercadona',
    city: 'Barcelone',
    // Pas de retrait : courses en magasin ou livraison (« Mercadona online »).
    hasDrive: false,
    driveFeeCents: 0,
    deliveryFeeCents: 825,
    minOrderCents: 6000,
    searchUrlTemplate: 'https://tienda.mercadona.es/search-results?query={query}',
    driveUrl: 'https://tienda.mercadona.es/',
  },
  {
    id: 'carrefour_es',
    chain: 'carrefour',
    country: 'ES',
    name: 'Carrefour España',
    city: 'Barcelone',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: 595,
    minOrderCents: 3000,
    searchUrlTemplate: 'https://www.carrefour.es/?q={query}',
    driveUrl: 'https://www.carrefour.es/supermercado',
  },
  {
    id: 'lidl_es',
    chain: 'lidl',
    country: 'ES',
    name: 'Lidl España',
    city: 'Barcelone',
    hasDrive: false,
    driveFeeCents: 0,
    deliveryFeeCents: null,
    minOrderCents: 0,
    searchUrlTemplate: 'https://www.lidl.es/q/search?q={query}',
    driveUrl: 'https://www.lidl.es/',
  },
  {
    id: 'dia',
    chain: 'dia',
    country: 'ES',
    name: 'Dia',
    city: 'Barcelone',
    hasDrive: false,
    driveFeeCents: 0,
    deliveryFeeCents: 499,
    minOrderCents: 2500,
    searchUrlTemplate: 'https://www.dia.es/search?q={query}',
    driveUrl: 'https://www.dia.es/',
  },
  {
    id: 'alcampo',
    chain: 'alcampo',
    country: 'ES',
    name: 'Alcampo Drive',
    city: 'Barcelone',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: 690,
    minOrderCents: 3000,
    searchUrlTemplate: 'https://www.compraonline.alcampo.es/search?q={query}',
    driveUrl: 'https://www.compraonline.alcampo.es/',
  },
  {
    id: 'eroski',
    chain: 'eroski',
    country: 'ES',
    name: 'Eroski',
    city: 'Barcelone',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: 595,
    minOrderCents: 3000,
    searchUrlTemplate: 'https://supermercado.eroski.es/es/search/results/?q={query}',
    driveUrl: 'https://supermercado.eroski.es/',
  },
  {
    id: 'consum',
    chain: 'consum',
    country: 'ES',
    name: 'Consum',
    city: 'Barcelone',
    hasDrive: true,
    driveFeeCents: 0,
    deliveryFeeCents: 590,
    minOrderCents: 3000,
    searchUrlTemplate: 'https://tienda.consum.es/es/s/{query}',
    driveUrl: 'https://tienda.consum.es/',
  },
];

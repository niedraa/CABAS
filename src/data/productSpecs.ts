/**
 * Spécifications des produits du catalogue de démonstration.
 *
 * Une ligne par ingrédient achetable : le produit de MARQUE NATIONALE
 * (vendu dans toutes les enseignes), son prix de référence 2026 (indice
 * enseigne 1,00), la famille qui détermine le nom de la marque distributeur
 * (MDD) de chaque enseigne, et éventuellement une variante bio.
 *
 * `products.ts` et `prices.ts` sont GÉNÉRÉS à partir de ce fichier par
 * `node src/data/generator/run.mjs` (déterministe) : modifier ici, puis
 * relancer le générateur. Un test vérifie que les fichiers générés sont à jour.
 *
 * Convention : `packSize` est exprimé dans l'unité de base de l'ingrédient
 * (g, ml ou pièce). Les produits frais vendus « au kilo » ont un packSize de
 * 1000 g (le prix est alors le prix au kilo).
 */
import type { Product } from '../core/types';

/** Famille de produit → nom de la marque distributeur dans chaque enseigne. */
export type ProductFamily =
  | 'primeur'
  | 'boucherie'
  | 'charcuterie'
  | 'poisson'
  | 'cremerie'
  | 'vegetal'
  | 'boulangerie'
  | 'pates'
  | 'italien'
  | 'conserve'
  | 'feculents'
  | 'asie'
  | 'epices'
  | 'huile'
  | 'condiment'
  | 'patisserie'
  | 'fruits_secs'
  | 'surgeles'
  | 'vin';

export interface MddSpec {
  /** Libellé MDD (défaut : `name` de la spec). */
  name?: string;
  /** Contenance MDD (défaut : celle du produit national). */
  packSize?: number;
  /** Prix unitaire MDD / prix unitaire national (défaut 0,74). */
  ratio?: number;
}

export interface BioSpec {
  name: string;
  brand: string;
  packSize: number;
  priceCents: number;
}

export interface ProductSpec {
  ingredientId: string;
  family: ProductFamily;
  /** Libellé générique du produit (sans la marque). */
  name: string;
  /** Marque nationale (« Vrac » pour les produits frais sans marque). */
  brand: string;
  packSize: number;
  /** Prix de référence du produit national, centimes (indice enseigne 1,00). */
  priceCents: number;
  nutriScore?: Product['nutriScore'];
  /** `false` : pas de MDD pour ce produit. */
  mdd?: MddSpec | false;
  bio?: BioSpec;
}

/** Ligne de spécification compacte. */
function p(
  ingredientId: string,
  family: ProductFamily,
  name: string,
  brand: string,
  packSize: number,
  priceCents: number,
  nutriScore: Product['nutriScore'],
  extra: { mdd?: MddSpec | false; bio?: BioSpec } = {},
): ProductSpec {
  return { ingredientId, family, name, brand, packSize, priceCents, nutriScore, ...extra };
}

const NO_MDD = { mdd: false } as const;

export const productSpecs: ProductSpec[] = [
  // ── Fruits & légumes ──
  p('oignon_jaune', 'primeur', 'Oignons jaunes', 'Vrac', 1000, 229, 'A', {
    mdd: { name: 'Oignons jaunes, filet 1 kg', ratio: 0.78 },
    bio: { name: 'Oignons jaunes bio, filet', brand: 'Vrac bio', packSize: 500, priceCents: 229 },
  }),
  p('oignon_rouge', 'primeur', 'Oignons rouges', 'Vrac', 500, 179, 'A', { mdd: { name: 'Oignons rouges, filet 500 g', ratio: 0.8 } }),
  p('oignon_nouveau', 'primeur', 'Oignons nouveaux, la botte', 'Vrac', 6, 149, 'A', NO_MDD),
  p('echalote', 'primeur', 'Échalotes', 'Prince de Bretagne', 500, 249, 'A', { mdd: { name: 'Échalotes, filet 500 g', ratio: 0.8 } }),
  p('ail', 'primeur', 'Ail blanc, filet 3 têtes', 'Vrac', 250, 229, 'A', { mdd: { ratio: 0.8 } }),
  p('carotte', 'primeur', 'Carottes', 'Vrac', 1000, 179, 'A', {
    mdd: { name: 'Carottes, sachet 1 kg', ratio: 0.78 },
    bio: { name: 'Carottes bio', brand: 'Vrac bio', packSize: 1000, priceCents: 279 },
  }),
  p('pomme_de_terre', 'primeur', 'Pommes de terre de consommation', 'Parmentine', 2500, 449, 'A', {
    mdd: { name: 'Pommes de terre, filet 2,5 kg', ratio: 0.75 },
  }),
  p('patate_douce', 'primeur', 'Patates douces', 'Vrac', 1000, 349, 'A', NO_MDD),
  p('tomate', 'primeur', 'Tomates rondes', 'Savéol', 1000, 399, 'A', {
    mdd: { name: 'Tomates rondes, barquette 1 kg', ratio: 0.8 },
    bio: { name: 'Tomates bio', brand: 'Vrac bio', packSize: 1000, priceCents: 599 },
  }),
  p('tomate_cerise', 'primeur', 'Tomates cerises, barquette', 'Savéol', 250, 249, 'A', { mdd: { ratio: 0.8 } }),
  p('courgette', 'primeur', 'Courgettes', 'Vrac', 1000, 299, 'A', { mdd: { name: 'Courgettes, sachet 1 kg', ratio: 0.82 } }),
  p('aubergine', 'primeur', 'Aubergines', 'Vrac', 1000, 349, 'A', NO_MDD),
  p('poivron_rouge', 'primeur', 'Poivrons rouges', 'Vrac', 1000, 499, 'A', {
    mdd: { name: 'Poivrons tricolores, sachet 500 g', packSize: 500, ratio: 0.82 },
  }),
  p('poivron_vert', 'primeur', 'Poivrons verts', 'Vrac', 1000, 399, 'A', NO_MDD),
  p('concombre', 'primeur', 'Concombre, la pièce', 'Vrac', 350, 119, 'A', NO_MDD),
  p('salade_verte', 'primeur', 'Laitue, la pièce', 'Vrac', 1, 119, 'A', NO_MDD),
  p('pousses_epinards', 'primeur', "Pousses d'épinards, sachet", 'Florette', 125, 229, 'A', { mdd: { ratio: 0.72 } }),
  p('champignons_paris', 'primeur', 'Champignons de Paris blancs, barquette', 'Vrac', 250, 199, 'A', {
    mdd: { name: 'Champignons de Paris émincés, barquette 400 g', packSize: 400, ratio: 0.8 },
  }),
  p('brocoli', 'primeur', 'Brocoli, la pièce', 'Vrac', 500, 229, 'A', NO_MDD),
  p('chou_fleur', 'primeur', 'Chou-fleur, la pièce', 'Prince de Bretagne', 1000, 279, 'A', NO_MDD),
  p('poireau', 'primeur', 'Poireaux, la botte', 'Vrac', 1000, 329, 'A', NO_MDD),
  p('celeri_branche', 'primeur', 'Céleri branche', 'Vrac', 500, 199, 'A', NO_MDD),
  p('endive', 'primeur', 'Endives, sachet 1 kg', 'Perle du Nord', 1000, 349, 'A', { mdd: { ratio: 0.8 } }),
  p('courge_butternut', 'primeur', 'Courge butternut', 'Vrac', 1000, 249, 'A', NO_MDD),
  p('citron', 'primeur', 'Citrons jaunes, filet de 4', 'Vrac', 4, 229, 'A', {
    mdd: { name: 'Citrons jaunes, filet de 6', packSize: 6, ratio: 0.8 },
    bio: { name: 'Citrons jaunes bio, filet de 3', brand: 'Vrac bio', packSize: 3, priceCents: 299 },
  }),
  p('citron_vert', 'primeur', 'Citron vert, la pièce', 'Vrac', 1, 49, 'A', NO_MDD),
  p('avocat', 'primeur', 'Avocat, la pièce', 'Vrac', 1, 119, 'A', { mdd: { name: 'Avocats, filet de 2', packSize: 2, ratio: 0.82 } }),
  p('banane', 'primeur', 'Bananes', 'Chiquita', 1000, 249, 'A', { mdd: { name: 'Bananes Cavendish', ratio: 0.78 } }),
  p('pomme', 'primeur', 'Pommes Gala', 'Vrac', 1000, 279, 'A', { mdd: { name: 'Pommes Gala, sachet 1,5 kg', packSize: 1500, ratio: 0.8 } }),
  p('gingembre', 'primeur', 'Gingembre frais', 'Vrac', 100, 129, 'A', NO_MDD),
  p('persil', 'primeur', 'Persil plat, la botte', 'Vrac', 1, 109, 'A', NO_MDD),
  p('coriandre', 'primeur', 'Coriandre, la botte', 'Vrac', 1, 119, 'A', NO_MDD),
  p('basilic', 'primeur', 'Basilic, le pot', 'Vrac', 1, 199, 'A', NO_MDD),
  p('ciboulette', 'primeur', 'Ciboulette, la botte', 'Vrac', 1, 119, 'A', NO_MDD),
  p('menthe', 'primeur', 'Menthe, la botte', 'Vrac', 1, 119, 'A', NO_MDD),

  // ── Boucherie & charcuterie ──
  p('blanc_poulet', 'boucherie', 'Filets de poulet', 'Le Gaulois', 400, 699, 'A', {
    mdd: { ratio: 0.78 },
    bio: { name: 'Filets de poulet bio', brand: 'Maître Coq', packSize: 300, priceCents: 829 },
  }),
  p('cuisse_poulet', 'boucherie', 'Cuisses de poulet', 'Le Gaulois', 1000, 699, 'B', { mdd: { ratio: 0.78 } }),
  p('escalope_dinde', 'boucherie', 'Escalopes de dinde', 'Le Gaulois', 480, 749, 'A', { mdd: { ratio: 0.78 } }),
  p('boeuf_hache', 'boucherie', 'Viande hachée pur bœuf 5 % MG', 'Charal', 500, 749, 'A', { mdd: { ratio: 0.8 } }),
  p('boeuf_braiser', 'boucherie', 'Bœuf à braiser (paleron, gîte)', 'Charal', 800, 1399, 'A', { mdd: { ratio: 0.82 } }),
  p('boeuf_emince', 'boucherie', 'Émincé de bœuf', 'Charal', 400, 899, 'A', { mdd: { ratio: 0.82 } }),
  p('epaule_agneau', 'boucherie', "Épaule d'agneau", 'Bigard', 1000, 1590, 'B', { mdd: { ratio: 0.85 } }),
  p('merguez', 'boucherie', 'Merguez, x6', 'Isla Délice', 330, 449, 'D', { mdd: { ratio: 0.78 } }),
  p('lardons', 'charcuterie', 'Allumettes de lardons fumés', 'Herta', 200, 279, 'D', { mdd: { ratio: 0.72 } }),
  p('jambon_blanc', 'charcuterie', 'Jambon de Paris, 4 tranches', 'Fleury Michon', 160, 349, 'C', {
    mdd: { ratio: 0.7 },
    bio: { name: 'Jambon blanc bio, 4 tranches', brand: 'Fleury Michon', packSize: 140, priceCents: 449 },
  }),
  p('saucisse_toulouse', 'charcuterie', 'Saucisses de Toulouse, x4', 'Herta', 400, 499, 'D', { mdd: { ratio: 0.76 } }),
  p('chorizo', 'charcuterie', 'Chorizo fort, en tranches', 'Justin Bridou', 100, 249, 'E', { mdd: { ratio: 0.74 } }),
  p('filet_mignon_porc', 'boucherie', 'Filet mignon de porc', 'Bigard', 500, 1099, 'A', { mdd: { ratio: 0.82 } }),

  // ── Poissonnerie ──
  p('filet_saumon', 'poisson', "Pavés de saumon de l'Atlantique, x2", 'Mowi', 250, 799, 'B', { mdd: { ratio: 0.8 } }),
  p('pave_cabillaud', 'poisson', 'Dos de cabillaud, x4', 'Findus', 500, 1199, 'A', { mdd: { ratio: 0.8 } }),
  p('saumon_fume', 'poisson', 'Saumon fumé de Norvège, 4 tranches', 'Labeyrie', 120, 549, 'C', { mdd: { ratio: 0.72 } }),
  p('crevettes', 'poisson', 'Crevettes cuites décortiquées', 'Pescanova', 200, 499, 'A', { mdd: { ratio: 0.78 } }),
  p('moules', 'poisson', 'Moules de bouchot, filet 1 kg', 'Vrac', 1000, 549, 'A', { mdd: { ratio: 0.85 } }),
  p('thon_naturel', 'poisson', 'Thon albacore au naturel', 'Petit Navire', 140, 299, 'A', { mdd: { ratio: 0.72 } }),

  // ── Crèmerie & frais ──
  p('oeuf', 'cremerie', 'Œufs frais de plein air, x6', 'Loué', 6, 279, 'A', {
    mdd: { ratio: 0.75 },
    bio: { name: 'Œufs bio, x6', brand: 'Cocorette', packSize: 6, priceCents: 349 },
  }),
  p('lait', 'cremerie', 'Lait demi-écrémé UHT', 'Lactel', 1000, 119, 'A', {
    mdd: { ratio: 0.82 },
    bio: { name: 'Lait demi-écrémé bio', brand: 'Lactel', packSize: 1000, priceCents: 155 },
  }),
  p('beurre', 'cremerie', 'Beurre doux', 'Président', 250, 319, 'E', { mdd: { ratio: 0.78 } }),
  p('creme_fraiche', 'cremerie', 'Crème fraîche épaisse 30 % MG', 'Elle & Vire', 200, 179, 'D', { mdd: { ratio: 0.74 } }),
  p('creme_liquide', 'cremerie', 'Crème liquide entière 30 % MG', 'Président', 200, 149, 'D', { mdd: { ratio: 0.76 } }),
  p('yaourt_nature', 'cremerie', 'Yaourts nature, 4 × 125 g', 'Danone', 500, 189, 'A', {
    mdd: { ratio: 0.7 },
    bio: { name: 'Yaourts nature bio, 4 × 125 g', brand: 'Les 2 Vaches', packSize: 500, priceCents: 259 },
  }),
  p('yaourt_grec', 'cremerie', 'Yaourt à la grecque nature', 'Fage', 500, 349, 'A', { mdd: { ratio: 0.68 } }),
  p('parmesan', 'cremerie', 'Parmigiano Reggiano AOP', 'Giovanni Ferrari', 150, 449, 'D', { mdd: { ratio: 0.78 } }),
  p('mozzarella', 'cremerie', 'Mozzarella', 'Galbani', 125, 149, 'C', { mdd: { ratio: 0.72 } }),
  p('emmental_rape', 'cremerie', 'Emmental râpé', 'Entremont', 200, 249, 'D', { mdd: { ratio: 0.76 } }),
  p('comte', 'cremerie', 'Comté AOP 6 mois', 'Juraflore', 200, 449, 'D', { mdd: { ratio: 0.8 } }),
  p('chevre_buche', 'cremerie', 'Bûche de chèvre', 'Soignon', 180, 289, 'D', { mdd: { ratio: 0.74 } }),
  p('feta', 'cremerie', 'Feta AOP', 'Salakis', 200, 299, 'D', { mdd: { ratio: 0.75 } }),
  p('ricotta', 'cremerie', 'Ricotta', 'Galbani', 250, 249, 'C', { mdd: { ratio: 0.76 } }),
  p('reblochon', 'cremerie', 'Reblochon de Savoie AOP', 'Président', 450, 749, 'D', { mdd: { ratio: 0.84 } }),
  p('cheddar', 'cremerie', 'Cheddar en tranches, x8', 'Kerrygold', 160, 279, 'D', { mdd: { ratio: 0.7 } }),
  p('creme_soja', 'vegetal', 'Crème de soja pour la cuisine', 'Alpro', 250, 179, 'B', { mdd: { ratio: 0.76 } }),
  p('tofu_ferme', 'vegetal', 'Tofu nature ferme', 'Soy', 400, 389, 'A', { mdd: { packSize: 200, ratio: 0.8 } }),
  p('gnocchi', 'italien', 'Gnocchis à poêler', 'Lustucru', 400, 249, 'A', { mdd: { packSize: 500, ratio: 0.7 } }),
  p('pate_brisee', 'cremerie', 'Pâte brisée pur beurre', 'Herta', 230, 199, 'D', { mdd: { ratio: 0.7 } }),
  p('pate_pizza', 'cremerie', 'Pâte à pizza fine', 'Herta', 260, 189, 'C', { mdd: { ratio: 0.7 } }),

  // ── Boulangerie ──
  p('pain_baguette', 'boulangerie', 'Baguette tradition', 'Vrac', 1, 119, 'A', { mdd: { name: 'Baguette', ratio: 0.75 } }),
  p('pain_mie', 'boulangerie', 'Pain de mie nature sans croûte', 'Harrys', 500, 279, 'B', { mdd: { ratio: 0.66 } }),
  p('pain_burger', 'boulangerie', 'Pains burger nature, x4', 'Harrys', 4, 219, 'C', { mdd: { packSize: 6, ratio: 0.7 } }),
  p('tortilla_ble', 'boulangerie', 'Tortillas de blé, x8', 'Old El Paso', 8, 279, 'C', { mdd: { ratio: 0.68 } }),
  p('pain_pita', 'boulangerie', 'Pains pita, x6', 'Al Amir', 6, 219, 'B', { mdd: { ratio: 0.72 } }),

  // ── Épicerie salée ──
  p('pates_spaghetti', 'pates', 'Spaghetti n°5', 'Barilla', 500, 159, 'A', {
    mdd: { name: 'Spaghetti', ratio: 0.62 },
    bio: { name: 'Spaghetti bio', brand: 'Barilla', packSize: 500, priceCents: 229 },
  }),
  p('pates_penne', 'pates', 'Penne rigate', 'Barilla', 500, 159, 'A', { mdd: { ratio: 0.62 } }),
  p('pates_coquillettes', 'pates', 'Coquillettes', 'Lustucru', 500, 149, 'A', { mdd: { ratio: 0.62 } }),
  p('tagliatelles', 'pates', 'Tagliatelles aux œufs frais', 'Lustucru', 250, 199, 'A', { mdd: { packSize: 500, ratio: 0.66 } }),
  p('lasagnes', 'pates', "Lasagne all'uovo", 'Barilla', 500, 279, 'A', { mdd: { ratio: 0.66 } }),
  p('nouilles_riz', 'asie', 'Nouilles de riz', 'Suzi Wan', 250, 199, 'A', { mdd: { ratio: 0.72 } }),
  p('nouilles_oeufs', 'asie', 'Nouilles chinoises aux œufs', 'Suzi Wan', 250, 189, 'A', { mdd: { ratio: 0.72 } }),
  p('riz_basmati', 'feculents', 'Riz basmati', 'Taureau Ailé', 1000, 399, 'A', {
    mdd: { ratio: 0.65 },
    bio: { name: 'Riz basmati bio', brand: 'Taureau Ailé', packSize: 500, priceCents: 349 },
  }),
  p('riz_arborio', 'feculents', 'Riz pour risotto arborio', 'Riso Gallo', 1000, 349, 'A', { mdd: { ratio: 0.7 } }),
  p('semoule', 'feculents', 'Semoule de blé dur moyenne', 'Tipiak', 1000, 219, 'A', { mdd: { ratio: 0.68 } }),
  p('boulgour', 'feculents', 'Boulgour', 'Tipiak', 500, 229, 'A', { mdd: { ratio: 0.7 } }),
  p('quinoa', 'feculents', 'Quinoa blanc', 'Tipiak', 400, 349, 'A', {
    mdd: { packSize: 500, ratio: 0.72 },
    bio: { name: 'Quinoa blanc bio', brand: 'Priméal', packSize: 500, priceCents: 499 },
  }),
  p('lentilles_vertes', 'feculents', 'Lentilles vertes', 'Sabarot', 500, 279, 'A', { mdd: { ratio: 0.66 } }),
  p('lentilles_corail', 'feculents', 'Lentilles corail', 'Sabarot', 500, 289, 'A', { mdd: { ratio: 0.68 } }),
  p('pois_chiches', 'conserve', 'Pois chiches, boîte 4/4 égouttée', 'Bonduelle', 265, 149, 'A', { mdd: { ratio: 0.66 } }),
  p('haricots_rouges', 'conserve', 'Haricots rouges, boîte 4/4 égouttée', 'Bonduelle', 250, 139, 'A', { mdd: { ratio: 0.66 } }),
  p('mais_doux', 'conserve', 'Maïs doux en grains', 'Géant Vert', 285, 169, 'A', { mdd: { ratio: 0.68 } }),
  p('tomates_concassees', 'italien', 'Tomates concassées', 'Mutti', 400, 199, 'A', { mdd: { ratio: 0.6 } }),
  p('coulis_tomate', 'italien', 'Passata, coulis de tomates', 'Mutti', 500, 199, 'A', { mdd: { ratio: 0.62 } }),
  p('concentre_tomate', 'italien', 'Double concentré de tomates', 'Mutti', 130, 189, 'A', { mdd: { packSize: 140, ratio: 0.62 } }),
  p('bouillon_volaille', 'epices', 'Bouillon de volaille, 10 cubes', 'Knorr', 10, 219, 'D', { mdd: { ratio: 0.66 } }),
  p('bouillon_boeuf', 'epices', 'Bouillon de bœuf, 10 cubes', 'Knorr', 10, 219, 'D', { mdd: { ratio: 0.66 } }),
  p('bouillon_legumes', 'epices', 'Bouillon de légumes, 10 cubes', 'Knorr', 10, 219, 'D', {
    mdd: { ratio: 0.66 },
    bio: { name: 'Bouillon de légumes bio, 8 cubes', brand: 'Bjorg', packSize: 8, priceCents: 249 },
  }),
  p('lait_coco', 'asie', 'Lait de coco', 'Suzi Wan', 400, 249, 'D', { mdd: { ratio: 0.66 } }),
  p('olives_noires', 'condiment', 'Olives noires dénoyautées', 'Tramier', 150, 229, 'D', { mdd: { ratio: 0.7 } }),
  p('cacahuetes', 'fruits_secs', 'Cacahuètes grillées salées', 'Bénénuts', 200, 249, 'C', { mdd: { ratio: 0.7 } }),
  p('noix', 'fruits_secs', 'Cerneaux de noix', 'Daco Bello', 125, 349, 'A', { mdd: { packSize: 200, ratio: 0.74 } }),
  p('graines_sesame', 'fruits_secs', 'Graines de sésame', 'Daco Bello', 100, 249, 'A', { mdd: { ratio: 0.72 } }),
  p('chapelure', 'patisserie', 'Chapelure dorée', 'Tipiak', 250, 159, 'A', { mdd: { ratio: 0.7 } }),

  // ── Épicerie sucrée ──
  p('farine_ble', 'patisserie', 'Farine de blé T45', 'Francine', 1000, 129, 'A', {
    mdd: { ratio: 0.72 },
    bio: { name: 'Farine de blé T65 bio', brand: 'Francine', packSize: 1000, priceCents: 199 },
  }),
  p('farine_sarrasin', 'patisserie', 'Farine de sarrasin', 'Francine', 500, 249, 'A', { mdd: { ratio: 0.76 } }),
  p('maizena', 'patisserie', 'Fécule de maïs', 'Maïzena', 400, 249, 'A', { mdd: { ratio: 0.6 } }),
  p('sucre', 'patisserie', 'Sucre en poudre', 'Daddy', 1000, 159, 'E', { mdd: { ratio: 0.72 } }),
  p('miel', 'patisserie', 'Miel de fleurs crémeux', 'Lune de Miel', 500, 599, 'D', { mdd: { ratio: 0.72 } }),
  p('gelatine', 'patisserie', 'Gélatine en feuilles', 'Vahiné', 18, 229, 'A', NO_MDD),

  // ── Condiments, huiles & épices ──
  p('huile_olive', 'huile', "Huile d'olive vierge extra", 'Puget', 1000, 899, 'B', {
    mdd: { ratio: 0.78 },
    bio: { name: "Huile d'olive vierge extra bio", brand: 'Puget', packSize: 500, priceCents: 699 },
  }),
  p('huile_tournesol', 'huile', 'Huile de tournesol', 'Lesieur', 1000, 299, 'B', { mdd: { ratio: 0.7 } }),
  p('huile_sesame', 'asie', 'Huile de sésame grillé', 'Suzi Wan', 150, 299, 'C', { mdd: { ratio: 0.74 } }),
  p('vinaigre_balsamique', 'condiment', 'Vinaigre balsamique de Modène IGP', 'Ponti', 250, 229, 'C', { mdd: { ratio: 0.7 } }),
  p('vinaigre_vin', 'condiment', 'Vinaigre de vin rouge', 'Amora', 500, 179, 'A', { mdd: { ratio: 0.66 } }),
  p('moutarde', 'condiment', 'Moutarde de Dijon fine et forte', 'Amora', 440, 279, 'C', { mdd: { ratio: 0.66 } }),
  p('mayonnaise', 'condiment', 'Mayonnaise de Dijon', 'Amora', 235, 229, 'E', { mdd: { ratio: 0.68 } }),
  p('ketchup', 'condiment', 'Tomato ketchup', 'Heinz', 570, 339, 'D', { mdd: { ratio: 0.6 } }),
  p('sauce_soja', 'asie', 'Sauce soja salée', 'Kikkoman', 250, 349, 'E', { mdd: { ratio: 0.62 } }),
  p('pesto', 'italien', 'Pesto alla genovese', 'Barilla', 190, 299, 'D', { mdd: { ratio: 0.7 } }),
  p('tahini', 'condiment', 'Tahin, crème de sésame', 'Al Amir', 300, 449, 'C', { mdd: { packSize: 250, ratio: 0.76 } }),
  p('sel', 'epices', 'Sel fin de mer', 'La Baleine', 750, 129, 'E', { mdd: { packSize: 1000, ratio: 0.6 } }),
  p('poivre', 'epices', 'Poivre noir moulu', 'Ducros', 50, 329, 'A', { mdd: { ratio: 0.66 } }),
  p('curry', 'epices', 'Curry en poudre', 'Ducros', 45, 249, 'A', { mdd: { ratio: 0.66 } }),
  p('cumin', 'epices', 'Cumin moulu', 'Ducros', 37, 249, 'A', { mdd: { packSize: 40, ratio: 0.66 } }),
  p('paprika', 'epices', 'Paprika doux', 'Ducros', 40, 229, 'A', { mdd: { ratio: 0.66 } }),
  p('curcuma', 'epices', 'Curcuma moulu', 'Ducros', 40, 239, 'A', { mdd: { ratio: 0.66 } }),
  p('cannelle', 'epices', 'Cannelle moulue', 'Ducros', 39, 239, 'A', { mdd: { packSize: 40, ratio: 0.66 } }),
  p('ras_el_hanout', 'epices', 'Ras el hanout', 'Ducros', 40, 269, 'A', { mdd: { ratio: 0.68 } }),
  p('herbes_provence', 'epices', 'Herbes de Provence', 'Ducros', 20, 219, 'A', { mdd: { ratio: 0.66 } }),
  p('thym', 'epices', 'Thym', 'Ducros', 15, 229, 'A', { mdd: { ratio: 0.66 } }),
  p('laurier', 'epices', 'Laurier en feuilles', 'Ducros', 4, 199, 'A', { mdd: { ratio: 0.7 } }),
  p('origan', 'epices', 'Origan', 'Ducros', 10, 209, 'A', { mdd: { ratio: 0.68 } }),
  p('piment', 'epices', 'Piment de Cayenne moulu', 'Ducros', 40, 249, 'A', { mdd: { ratio: 0.66 } }),
  p('muscade', 'epices', 'Noix de muscade moulue', 'Ducros', 30, 299, 'A', { mdd: { ratio: 0.68 } }),

  // ── Boissons ──
  p('vin_blanc', 'vin', 'Vin de France blanc sec', 'Cellier des Dauphins', 750, 449, undefined, NO_MDD),
  p('vin_rouge', 'vin', 'Vin de France rouge', 'Vieux Papes', 750, 389, undefined, NO_MDD),

  // ── Surgelés ──
  p('petits_pois', 'surgeles', 'Petits pois extra-fins surgelés', 'Bonduelle', 750, 289, 'A', { mdd: { packSize: 1000, ratio: 0.66 } }),
  p('epinards_surgeles', 'surgeles', 'Épinards hachés en galets', 'Findus', 750, 299, 'A', { mdd: { packSize: 1000, ratio: 0.66 } }),
  p('haricots_verts', 'surgeles', 'Haricots verts extra-fins surgelés', 'Bonduelle', 1000, 349, 'A', { mdd: { ratio: 0.66 } }),
];

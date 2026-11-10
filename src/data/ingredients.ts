/**
 * Référentiel des ingrédients du catalogue de démonstration Cabas.
 *
 * Source de vérité pour :
 *  - les ALLERGÈNES (14 allergènes réglementaires UE, règlement INCO 1169/2011) ;
 *  - les drapeaux de régime (viande, porc, poisson, fruits de mer, produit
 *    d'origine animale, alcool) utilisés par `core/constraints.ts` pour ne
 *    JAMAIS proposer un plat incompatible avec le profil.
 *
 * Règle d'étiquetage : en cas de doute (recette industrielle variable selon
 * la marque), on étiquette de façon PRUDENTE — mieux vaut exclure un plat
 * sans risque que proposer un plat dangereux.
 *
 * Ce fichier ne contient que des imports de types : il peut être chargé tel
 * quel par Node (type stripping) pour générer le seed Supabase.
 */
import type { Aisle, Allergen, BaseUnit, Ingredient } from '../core/types';

// ─── Aides de construction ───────────────────────────────────────────────────

type IngredientOptions = Partial<Omit<Ingredient, 'id' | 'name' | 'aisle' | 'baseUnit'>>;

/** Construit un ingrédient avec des drapeaux à `false` par défaut. */
function ing(
  id: string,
  name: string,
  aisle: Aisle,
  baseUnit: BaseUnit,
  options: IngredientOptions = {},
): Ingredient {
  return {
    id,
    name,
    aisle,
    baseUnit,
    allergens: [],
    isMeat: false,
    isPork: false,
    isFish: false,
    isSeafood: false,
    isAnimalProduct: false,
    ...options,
  };
}

/** Drapeaux d'une viande (hors porc). */
const MEAT = { isMeat: true, isAnimalProduct: true } as const;
/** Drapeaux d'une viande / charcuterie de porc. */
const PORK = { isMeat: true, isPork: true, isAnimalProduct: true } as const;
/** Drapeaux d'un poisson (allergène « poissons » inclus). */
const FISH = { isFish: true, isAnimalProduct: true, allergens: ['poissons'] as Allergen[] } as const;
/** Produit laitier (allergène « lait »). */
const DAIRY = { isAnimalProduct: true, allergens: ['lait'] as Allergen[] } as const;
/** Épice / aromate sec de placard (densité apparente ≈ 0,5 g/ml). */
const SPICE = { isPantryStaple: true, density: 0.5 } as const;

// Saisons (mois 1-12) des produits frais en France métropolitaine.
const SUMMER = [6, 7, 8, 9];
const LATE_SUMMER = [7, 8, 9, 10];
const WINTER = [1, 2, 3, 4, 9, 10, 11, 12];
const AUTUMN_WINTER = [1, 2, 9, 10, 11, 12];

// ─── Référentiel ─────────────────────────────────────────────────────────────

export const ingredients: Ingredient[] = [
  // ── Fruits & légumes ──
  ing('oignon_jaune', 'Oignon jaune', 'fruits_legumes', 'g', { namePlural: 'Oignons jaunes', gramsPerPiece: 110 }),
  ing('oignon_rouge', 'Oignon rouge', 'fruits_legumes', 'g', { namePlural: 'Oignons rouges', gramsPerPiece: 120 }),
  ing('oignon_nouveau', 'Oignon nouveau', 'fruits_legumes', 'piece', {
    namePlural: 'Oignons nouveaux',
    gramsPerPiece: 20,
    seasonMonths: [3, 4, 5, 6, 7, 8, 9],
  }),
  ing('echalote', 'Échalote', 'fruits_legumes', 'g', { namePlural: 'Échalotes', gramsPerPiece: 30 }),
  // Une « pièce » d'ail = une gousse (≈ 5 g).
  ing('ail', 'Ail', 'fruits_legumes', 'g', { gramsPerPiece: 5 }),
  ing('carotte', 'Carotte', 'fruits_legumes', 'g', { namePlural: 'Carottes', gramsPerPiece: 100 }),
  ing('pomme_de_terre', 'Pomme de terre', 'fruits_legumes', 'g', { namePlural: 'Pommes de terre', gramsPerPiece: 150 }),
  ing('patate_douce', 'Patate douce', 'fruits_legumes', 'g', {
    namePlural: 'Patates douces',
    gramsPerPiece: 300,
    seasonMonths: [1, 2, 3, 10, 11, 12],
  }),
  ing('tomate', 'Tomate', 'fruits_legumes', 'g', { namePlural: 'Tomates', gramsPerPiece: 120, seasonMonths: SUMMER }),
  ing('tomate_cerise', 'Tomate cerise', 'fruits_legumes', 'g', {
    namePlural: 'Tomates cerises',
    gramsPerPiece: 15,
    seasonMonths: [5, 6, 7, 8, 9],
  }),
  ing('courgette', 'Courgette', 'fruits_legumes', 'g', { namePlural: 'Courgettes', gramsPerPiece: 220, seasonMonths: SUMMER }),
  ing('aubergine', 'Aubergine', 'fruits_legumes', 'g', { namePlural: 'Aubergines', gramsPerPiece: 280, seasonMonths: SUMMER }),
  ing('poivron_rouge', 'Poivron rouge', 'fruits_legumes', 'g', {
    namePlural: 'Poivrons rouges',
    gramsPerPiece: 160,
    seasonMonths: LATE_SUMMER,
  }),
  ing('poivron_vert', 'Poivron vert', 'fruits_legumes', 'g', {
    namePlural: 'Poivrons verts',
    gramsPerPiece: 160,
    seasonMonths: LATE_SUMMER,
  }),
  ing('concombre', 'Concombre', 'fruits_legumes', 'g', {
    namePlural: 'Concombres',
    gramsPerPiece: 350,
    seasonMonths: [5, 6, 7, 8, 9],
  }),
  ing('salade_verte', 'Salade verte', 'fruits_legumes', 'piece', {
    namePlural: 'Salades vertes',
    gramsPerPiece: 300,
    seasonMonths: [4, 5, 6, 7, 8, 9, 10],
  }),
  ing('pousses_epinards', "Pousses d'épinards", 'fruits_legumes', 'g', { seasonMonths: [3, 4, 5, 9, 10, 11] }),
  ing('champignons_paris', 'Champignons de Paris', 'fruits_legumes', 'g', { gramsPerPiece: 20 }),
  ing('brocoli', 'Brocoli', 'fruits_legumes', 'g', { namePlural: 'Brocolis', gramsPerPiece: 400, seasonMonths: [6, 7, 8, 9, 10, 11] }),
  ing('chou_fleur', 'Chou-fleur', 'fruits_legumes', 'g', { namePlural: 'Choux-fleurs', gramsPerPiece: 800, seasonMonths: WINTER }),
  ing('poireau', 'Poireau', 'fruits_legumes', 'g', { namePlural: 'Poireaux', gramsPerPiece: 200, seasonMonths: WINTER }),
  // Une « pièce » de céleri = une branche.
  ing('celeri_branche', 'Céleri branche', 'fruits_legumes', 'g', {
    allergens: ['celeri'],
    gramsPerPiece: 40,
    seasonMonths: [6, 7, 8, 9, 10, 11],
  }),
  ing('endive', 'Endive', 'fruits_legumes', 'g', {
    namePlural: 'Endives',
    gramsPerPiece: 120,
    seasonMonths: [1, 2, 3, 4, 10, 11, 12],
  }),
  ing('courge_butternut', 'Courge butternut', 'fruits_legumes', 'g', {
    namePlural: 'Courges butternut',
    gramsPerPiece: 1200,
    seasonMonths: AUTUMN_WINTER,
  }),
  ing('citron', 'Citron', 'fruits_legumes', 'piece', { namePlural: 'Citrons', gramsPerPiece: 120 }),
  ing('citron_vert', 'Citron vert', 'fruits_legumes', 'piece', { namePlural: 'Citrons verts', gramsPerPiece: 70 }),
  ing('avocat', 'Avocat', 'fruits_legumes', 'piece', { namePlural: 'Avocats', gramsPerPiece: 200 }),
  ing('banane', 'Banane', 'fruits_legumes', 'g', { namePlural: 'Bananes', gramsPerPiece: 120 }),
  ing('pomme', 'Pomme', 'fruits_legumes', 'g', {
    namePlural: 'Pommes',
    gramsPerPiece: 150,
    seasonMonths: [1, 2, 3, 4, 8, 9, 10, 11, 12],
  }),
  ing('gingembre', 'Gingembre frais', 'fruits_legumes', 'g'),
  // Herbes fraîches : une « pièce » = une botte (ou un pot).
  ing('persil', 'Persil plat', 'fruits_legumes', 'piece', { gramsPerPiece: 30 }),
  ing('coriandre', 'Coriandre fraîche', 'fruits_legumes', 'piece', { gramsPerPiece: 30 }),
  ing('basilic', 'Basilic frais', 'fruits_legumes', 'piece', { gramsPerPiece: 25, seasonMonths: [5, 6, 7, 8, 9] }),
  ing('ciboulette', 'Ciboulette', 'fruits_legumes', 'piece', { gramsPerPiece: 20 }),
  ing('menthe', 'Menthe fraîche', 'fruits_legumes', 'piece', { gramsPerPiece: 25 }),

  // ── Boucherie & charcuterie ──
  ing('blanc_poulet', 'Filet de poulet', 'boucherie', 'g', { ...MEAT, namePlural: 'Filets de poulet', gramsPerPiece: 150 }),
  ing('cuisse_poulet', 'Cuisse de poulet', 'boucherie', 'g', { ...MEAT, namePlural: 'Cuisses de poulet', gramsPerPiece: 250 }),
  ing('escalope_dinde', 'Escalope de dinde', 'boucherie', 'g', {
    ...MEAT,
    namePlural: 'Escalopes de dinde',
    gramsPerPiece: 120,
  }),
  ing('boeuf_hache', 'Viande hachée de bœuf', 'boucherie', 'g', { ...MEAT }),
  ing('boeuf_braiser', 'Bœuf à braiser', 'boucherie', 'g', { ...MEAT }),
  ing('boeuf_emince', 'Bœuf émincé', 'boucherie', 'g', { ...MEAT }),
  ing('epaule_agneau', "Épaule d'agneau", 'boucherie', 'g', { ...MEAT }),
  ing('merguez', 'Merguez', 'boucherie', 'g', { ...MEAT, namePlural: 'Merguez', gramsPerPiece: 55 }),
  ing('lardons', 'Lardons', 'boucherie', 'g', { ...PORK }),
  // Une « pièce » / tranche de jambon ≈ 40 g.
  ing('jambon_blanc', 'Jambon blanc', 'boucherie', 'g', { ...PORK, gramsPerPiece: 40 }),
  ing('saucisse_toulouse', 'Saucisse de Toulouse', 'boucherie', 'g', {
    ...PORK,
    namePlural: 'Saucisses de Toulouse',
    gramsPerPiece: 100,
  }),
  // Le chorizo industriel contient très souvent du lactose / des protéines de lait.
  ing('chorizo', 'Chorizo', 'boucherie', 'g', { ...PORK, allergens: ['lait'] }),
  ing('filet_mignon_porc', 'Filet mignon de porc', 'boucherie', 'g', { ...PORK }),

  // ── Poissonnerie ──
  ing('filet_saumon', 'Pavé de saumon', 'poissonnerie', 'g', { ...FISH, namePlural: 'Pavés de saumon', gramsPerPiece: 125 }),
  ing('pave_cabillaud', 'Dos de cabillaud', 'poissonnerie', 'g', { ...FISH, namePlural: 'Dos de cabillaud', gramsPerPiece: 125 }),
  // Une tranche de saumon fumé ≈ 30 g.
  ing('saumon_fume', 'Saumon fumé', 'poissonnerie', 'g', { ...FISH, gramsPerPiece: 30 }),
  ing('crevettes', 'Crevettes décortiquées', 'poissonnerie', 'g', {
    isSeafood: true,
    isAnimalProduct: true,
    allergens: ['crustaces'],
  }),
  ing('moules', 'Moules de bouchot', 'poissonnerie', 'g', {
    isSeafood: true,
    isAnimalProduct: true,
    allergens: ['mollusques'],
    seasonMonths: [1, 7, 8, 9, 10, 11, 12],
  }),
  ing('thon_naturel', 'Thon au naturel', 'epicerie_salee', 'g', { ...FISH }),

  // ── Crèmerie & frais ──
  ing('oeuf', 'Œuf', 'cremerie', 'piece', { namePlural: 'Œufs', gramsPerPiece: 55, isAnimalProduct: true, allergens: ['oeufs'] }),
  ing('lait', 'Lait demi-écrémé', 'cremerie', 'ml', { ...DAIRY, density: 1.03 }),
  ing('beurre', 'Beurre doux', 'cremerie', 'g', { ...DAIRY }),
  ing('creme_fraiche', 'Crème fraîche épaisse', 'cremerie', 'ml', { ...DAIRY }),
  ing('creme_liquide', 'Crème liquide', 'cremerie', 'ml', { ...DAIRY }),
  ing('yaourt_nature', 'Yaourt nature', 'cremerie', 'g', { ...DAIRY, namePlural: 'Yaourts nature', gramsPerPiece: 125 }),
  ing('yaourt_grec', 'Yaourt à la grecque', 'cremerie', 'g', { ...DAIRY }),
  ing('parmesan', 'Parmesan', 'cremerie', 'g', { ...DAIRY }),
  ing('mozzarella', 'Mozzarella', 'cremerie', 'g', { ...DAIRY, gramsPerPiece: 125 }),
  ing('emmental_rape', 'Emmental râpé', 'cremerie', 'g', { ...DAIRY }),
  ing('comte', 'Comté', 'cremerie', 'g', { ...DAIRY }),
  ing('chevre_buche', 'Bûche de chèvre', 'cremerie', 'g', { ...DAIRY }),
  ing('feta', 'Feta', 'cremerie', 'g', { ...DAIRY }),
  ing('ricotta', 'Ricotta', 'cremerie', 'g', { ...DAIRY }),
  ing('reblochon', 'Reblochon', 'cremerie', 'g', { ...DAIRY, gramsPerPiece: 450 }),
  // Une tranche de cheddar ≈ 20 g.
  ing('cheddar', 'Cheddar en tranches', 'cremerie', 'g', { ...DAIRY, gramsPerPiece: 20 }),
  ing('creme_soja', 'Crème de soja', 'cremerie', 'ml', { allergens: ['soja'] }),
  ing('tofu_ferme', 'Tofu ferme', 'cremerie', 'g', { allergens: ['soja'] }),
  ing('gnocchi', 'Gnocchis à poêler', 'cremerie', 'g', { allergens: ['gluten'] }),
  // Pâtes à dérouler : une « pièce » = un rouleau.
  ing('pate_brisee', 'Pâte brisée pur beurre', 'cremerie', 'g', {
    allergens: ['gluten', 'lait'],
    isAnimalProduct: true,
    gramsPerPiece: 230,
  }),
  ing('pate_pizza', 'Pâte à pizza', 'cremerie', 'g', { allergens: ['gluten'], gramsPerPiece: 260 }),

  // ── Boulangerie ──
  ing('pain_baguette', 'Baguette', 'boulangerie', 'piece', { namePlural: 'Baguettes', gramsPerPiece: 250, allergens: ['gluten'] }),
  // Une tranche de pain de mie ≈ 25 g.
  ing('pain_mie', 'Pain de mie', 'boulangerie', 'g', { gramsPerPiece: 25, allergens: ['gluten'] }),
  ing('pain_burger', 'Pain à burger', 'boulangerie', 'piece', {
    namePlural: 'Pains à burger',
    gramsPerPiece: 75,
    allergens: ['gluten', 'sesame'],
  }),
  ing('tortilla_ble', 'Tortilla de blé', 'boulangerie', 'piece', {
    namePlural: 'Tortillas de blé',
    gramsPerPiece: 40,
    allergens: ['gluten'],
  }),
  ing('pain_pita', 'Pain pita', 'boulangerie', 'piece', { namePlural: 'Pains pita', gramsPerPiece: 70, allergens: ['gluten'] }),

  // ── Épicerie salée ──
  ing('pates_spaghetti', 'Spaghetti', 'epicerie_salee', 'g', { allergens: ['gluten'] }),
  ing('pates_penne', 'Penne', 'epicerie_salee', 'g', { allergens: ['gluten'] }),
  ing('pates_coquillettes', 'Coquillettes', 'epicerie_salee', 'g', { allergens: ['gluten'] }),
  ing('tagliatelles', 'Tagliatelles aux œufs', 'epicerie_salee', 'g', {
    allergens: ['gluten', 'oeufs'],
    isAnimalProduct: true,
  }),
  ing('lasagnes', 'Feuilles de lasagnes aux œufs', 'epicerie_salee', 'g', {
    allergens: ['gluten', 'oeufs'],
    isAnimalProduct: true,
  }),
  ing('nouilles_riz', 'Nouilles de riz', 'epicerie_salee', 'g'),
  ing('nouilles_oeufs', 'Nouilles chinoises aux œufs', 'epicerie_salee', 'g', {
    allergens: ['gluten', 'oeufs'],
    isAnimalProduct: true,
  }),
  ing('riz_basmati', 'Riz basmati', 'epicerie_salee', 'g'),
  ing('riz_arborio', 'Riz arborio', 'epicerie_salee', 'g'),
  ing('semoule', 'Semoule de blé', 'epicerie_salee', 'g', { allergens: ['gluten'] }),
  ing('boulgour', 'Boulgour', 'epicerie_salee', 'g', { allergens: ['gluten'] }),
  ing('quinoa', 'Quinoa', 'epicerie_salee', 'g'),
  ing('lentilles_vertes', 'Lentilles vertes', 'epicerie_salee', 'g'),
  ing('lentilles_corail', 'Lentilles corail', 'epicerie_salee', 'g'),
  ing('pois_chiches', 'Pois chiches cuits', 'epicerie_salee', 'g'),
  ing('haricots_rouges', 'Haricots rouges cuits', 'epicerie_salee', 'g'),
  ing('mais_doux', 'Maïs doux', 'epicerie_salee', 'g'),
  ing('tomates_concassees', 'Tomates concassées', 'epicerie_salee', 'g'),
  ing('coulis_tomate', 'Coulis de tomate', 'epicerie_salee', 'g'),
  ing('concentre_tomate', 'Concentré de tomate', 'epicerie_salee', 'g'),
  // Bouillons : une « pièce » = un cube (≈ 10 g). Le céleri est quasi systématique.
  ing('bouillon_volaille', 'Bouillon de volaille', 'epicerie_salee', 'piece', {
    namePlural: 'Cubes de bouillon de volaille',
    gramsPerPiece: 10,
    allergens: ['celeri'],
    isMeat: true,
    isAnimalProduct: true,
  }),
  ing('bouillon_boeuf', 'Bouillon de bœuf', 'epicerie_salee', 'piece', {
    namePlural: 'Cubes de bouillon de bœuf',
    gramsPerPiece: 10,
    allergens: ['celeri'],
    isMeat: true,
    isAnimalProduct: true,
  }),
  ing('bouillon_legumes', 'Bouillon de légumes', 'epicerie_salee', 'piece', {
    namePlural: 'Cubes de bouillon de légumes',
    gramsPerPiece: 10,
    allergens: ['celeri'],
  }),
  ing('lait_coco', 'Lait de coco', 'epicerie_salee', 'ml'),
  ing('olives_noires', 'Olives noires', 'epicerie_salee', 'g', { gramsPerPiece: 4 }),
  ing('cacahuetes', 'Cacahuètes grillées', 'epicerie_salee', 'g', { allergens: ['arachides'] }),
  ing('noix', 'Cerneaux de noix', 'epicerie_salee', 'g', { allergens: ['fruits_a_coque'] }),
  ing('graines_sesame', 'Graines de sésame', 'epicerie_salee', 'g', { allergens: ['sesame'], density: 0.6 }),
  ing('chapelure', 'Chapelure', 'epicerie_salee', 'g', { allergens: ['gluten'], density: 0.45 }),

  // ── Épicerie sucrée & aides culinaires ──
  ing('farine_ble', 'Farine de blé', 'epicerie_sucree', 'g', { allergens: ['gluten'], isPantryStaple: true, density: 0.55 }),
  // Le sarrasin ne contient pas de gluten (ce n'est pas une céréale du genre Triticum).
  ing('farine_sarrasin', 'Farine de sarrasin', 'epicerie_sucree', 'g', { density: 0.55 }),
  ing('maizena', 'Fécule de maïs', 'epicerie_sucree', 'g', { isPantryStaple: true, density: 0.6 }),
  ing('sucre', 'Sucre en poudre', 'epicerie_sucree', 'g', { isPantryStaple: true, density: 0.85 }),
  ing('miel', 'Miel', 'epicerie_sucree', 'g', { isAnimalProduct: true, density: 1.4 }),
  // Gélatine alimentaire : très majoritairement d'origine porcine.
  ing('gelatine', 'Gélatine en feuilles', 'epicerie_sucree', 'g', {
    isAnimalProduct: true,
    isPork: true,
    gramsPerPiece: 2,
  }),

  // ── Condiments, huiles & épices ──
  ing('huile_olive', "Huile d'olive", 'condiments', 'ml', { isPantryStaple: true, density: 0.92 }),
  ing('huile_tournesol', 'Huile de tournesol', 'condiments', 'ml', { isPantryStaple: true, density: 0.92 }),
  ing('huile_sesame', 'Huile de sésame', 'condiments', 'ml', { allergens: ['sesame'], density: 0.92 }),
  ing('vinaigre_balsamique', 'Vinaigre balsamique', 'condiments', 'ml', {
    allergens: ['sulfites'],
    isPantryStaple: true,
    density: 1.05,
  }),
  ing('vinaigre_vin', 'Vinaigre de vin', 'condiments', 'ml', { allergens: ['sulfites'], isPantryStaple: true }),
  ing('moutarde', 'Moutarde de Dijon', 'condiments', 'g', { allergens: ['moutarde'] }),
  ing('mayonnaise', 'Mayonnaise', 'condiments', 'g', { allergens: ['oeufs', 'moutarde'], isAnimalProduct: true, density: 0.92 }),
  ing('ketchup', 'Ketchup', 'condiments', 'g', { density: 1.1 }),
  ing('sauce_soja', 'Sauce soja', 'condiments', 'ml', { allergens: ['soja', 'gluten'], density: 1.15 }),
  // Pesto industriel : fromage (lait) + très souvent noix de cajou (fruits à coque).
  ing('pesto', 'Pesto au basilic', 'condiments', 'g', {
    allergens: ['lait', 'fruits_a_coque'],
    isAnimalProduct: true,
  }),
  ing('tahini', 'Tahini (purée de sésame)', 'condiments', 'g', { allergens: ['sesame'], density: 1.05 }),
  ing('sel', 'Sel fin', 'condiments', 'g', { isPantryStaple: true, density: 1.2 }),
  ing('poivre', 'Poivre noir moulu', 'condiments', 'g', { ...SPICE }),
  // Les mélanges curry contiennent souvent des graines de moutarde et du céleri.
  ing('curry', 'Curry en poudre', 'condiments', 'g', { ...SPICE, allergens: ['moutarde', 'celeri'] }),
  ing('cumin', 'Cumin moulu', 'condiments', 'g', { ...SPICE }),
  ing('paprika', 'Paprika', 'condiments', 'g', { ...SPICE }),
  ing('curcuma', 'Curcuma', 'condiments', 'g', { ...SPICE }),
  ing('cannelle', 'Cannelle moulue', 'condiments', 'g', { ...SPICE }),
  ing('ras_el_hanout', 'Ras el hanout', 'condiments', 'g', { ...SPICE }),
  ing('herbes_provence', 'Herbes de Provence', 'condiments', 'g', { ...SPICE, density: 0.3 }),
  ing('thym', 'Thym séché', 'condiments', 'g', { ...SPICE, density: 0.3 }),
  // Une « pièce » de laurier = une feuille.
  ing('laurier', 'Laurier', 'condiments', 'g', { isPantryStaple: true, gramsPerPiece: 0.2 }),
  ing('origan', 'Origan séché', 'condiments', 'g', { ...SPICE, density: 0.3 }),
  ing('piment', 'Piment en poudre', 'condiments', 'g', { ...SPICE }),
  ing('muscade', 'Noix de muscade moulue', 'condiments', 'g', { ...SPICE }),

  // ── Boissons ──
  ing('vin_blanc', 'Vin blanc sec', 'boissons', 'ml', { allergens: ['sulfites'], isAlcohol: true, density: 0.99 }),
  ing('vin_rouge', 'Vin rouge', 'boissons', 'ml', { allergens: ['sulfites'], isAlcohol: true, density: 0.99 }),
  // Eau du robinet : jamais achetée, ignorée par la liste de courses.
  ing('eau', 'Eau', 'boissons', 'ml', { isPantryStaple: true }),

  // ── Surgelés ──
  ing('petits_pois', 'Petits pois surgelés', 'surgeles', 'g'),
  ing('epinards_surgeles', 'Épinards hachés surgelés', 'surgeles', 'g'),
  ing('haricots_verts', 'Haricots verts surgelés', 'surgeles', 'g'),
];

/** Ingrédients qui ne s'achètent jamais (eau du robinet). */
export const NON_PURCHASABLE_INGREDIENT_IDS: readonly string[] = ['eau'];

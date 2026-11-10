/// <reference types="jest" />
import { INGREDIENTS_BY_ID as I, RECIPES_BY_ID as R } from './fixtures';
import {
  convertBase,
  formatIngredientLine,
  formatNumberFr,
  formatPieces,
  formatQuantity,
  isCountUnit,
  roundTo,
  toBase,
  unitLabel,
} from '../units';
import { ceilHalf, householdPortions, householdServings, scaleQuantity, scaleRecipeIngredients } from '../portions';

describe('units — toBase', () => {
  it('convertit masses, volumes et unités de cuisine', () => {
    expect(toBase(1, 'kg')).toEqual({ quantity: 1000, unit: 'g' });
    expect(toBase(250, 'g')).toEqual({ quantity: 250, unit: 'g' });
    expect(toBase(1.5, 'l')).toEqual({ quantity: 1500, unit: 'ml' });
    expect(toBase(20, 'cl')).toEqual({ quantity: 200, unit: 'ml' });
    expect(toBase(2, 'cs')).toEqual({ quantity: 30, unit: 'ml' });
    expect(toBase(3, 'cc')).toEqual({ quantity: 15, unit: 'ml' });
    expect(toBase(1, 'pincee')).toEqual({ quantity: 0.5, unit: 'g' });
    for (const u of ['gousse', 'botte', 'tranche', 'sachet', 'boite', 'piece'] as const) {
      expect(toBase(2, u)).toEqual({ quantity: 2, unit: 'piece' });
    }
    expect(toBase(0.1 + 0.2, 'g').quantity).toBe(0.3);
  });

  it('se ramène à l’unité de base de l’ingrédient', () => {
    // volume → g via la densité
    expect(toBase(2, 'cs', I.farine)).toEqual({ quantity: 16.5, unit: 'g' });
    expect(toBase(100, 'ml', { baseUnit: 'g' })).toEqual({ quantity: 100, unit: 'g' }); // densité 1 par défaut
    // pièce → g via gramsPerPiece
    expect(toBase(2, 'piece', I.tomate)).toEqual({ quantity: 240, unit: 'g' });
    // g → pièces
    expect(toBase(220, 'g', I.oignon)).toEqual({ quantity: 2, unit: 'piece' });
    // pièce sans poids connu : reste en pièces
    expect(toBase(1, 'piece', { baseUnit: 'g' })).toEqual({ quantity: 1, unit: 'piece' });
    // g → ml via densité
    expect(toBase(92, 'g', I.huile_olive)).toEqual({ quantity: 100, unit: 'ml' });
    expect(toBase(50, 'cl', I.lait)).toEqual({ quantity: 500, unit: 'ml' });
    expect(toBase(3, 'gousse', I.ail)).toEqual({ quantity: 3, unit: 'piece' });
  });
});

describe('units — convertBase', () => {
  it('convertit entre unités de base quand c’est possible', () => {
    expect(convertBase(5, 'g', 'g')).toBe(5);
    expect(convertBase(10, 'ml', 'g')).toBe(10);
    expect(convertBase(10, 'ml', 'g', { density: 0.5 })).toBe(5);
    expect(convertBase(10, 'g', 'ml', { density: 0.5 })).toBe(20);
    expect(convertBase(1, 'piece', 'ml', { gramsPerPiece: 100, density: 0.5 })).toBe(200);
    expect(convertBase(200, 'ml', 'piece', { gramsPerPiece: 100, density: 0.5 })).toBe(1);
    expect(convertBase(330, 'g', 'piece', I.oignon)).toBe(3);
    expect(convertBase(100, 'g', 'piece', {})).toBeNull();
    expect(convertBase(1, 'piece', 'g')).toBeNull();
    expect(convertBase(1, 'piece', 'g', { gramsPerPiece: 0 })).toBeNull();
    expect(convertBase(10, 'ml', 'g', { density: -2 })).toBe(10);
  });
});

describe('units — formatage', () => {
  it('formatQuantity : masses', () => {
    expect(formatQuantity(1500, 'g')).toBe('1,5 kg');
    expect(formatQuantity(1000, 'g')).toBe('1 kg');
    expect(formatQuantity(1234, 'g')).toBe('1,2 kg');
    expect(formatQuantity(999, 'g')).toBe('1 kg');
    expect(formatQuantity(250, 'g')).toBe('250 g');
    expect(formatQuantity(252, 'g')).toBe('250 g');
    expect(formatQuantity(53, 'g')).toBe('55 g');
    expect(formatQuantity(12.4, 'g')).toBe('12 g');
    expect(formatQuantity(2.25, 'g')).toBe('2,3 g');
    expect(formatQuantity(2, 'kg')).toBe('2 kg');
  });

  it('formatQuantity : volumes', () => {
    expect(formatQuantity(750, 'ml')).toBe('75 cl');
    expect(formatQuantity(200, 'ml')).toBe('20 cl');
    expect(formatQuantity(15, 'ml')).toBe('15 ml');
    expect(formatQuantity(5, 'ml')).toBe('5 ml');
    expect(formatQuantity(1500, 'ml')).toBe('1,5 l');
    expect(formatQuantity(2, 'l')).toBe('2 l');
    expect(formatQuantity(20, 'cl')).toBe('20 cl');
    expect(formatQuantity(0.5, 'l')).toBe('50 cl');
    expect(formatQuantity(57, 'ml')).toBe('55 ml');
  });

  it('formatQuantity : pièces et unités de cuisine', () => {
    expect(formatQuantity(3, 'piece')).toBe('3');
    expect(formatQuantity(0.5, 'piece')).toBe('½');
    expect(formatQuantity(1.5, 'piece')).toBe('1½');
    expect(formatQuantity(2.75, 'piece')).toBe('2¾');
    expect(formatQuantity(0.25, 'piece')).toBe('¼');
    expect(formatQuantity(0.99, 'piece')).toBe('1');
    expect(formatQuantity(12.4, 'piece')).toBe('12');
    expect(formatQuantity(0, 'piece')).toBe('0');
    expect(formatQuantity(2, 'cs')).toBe('2 c. à s.');
    expect(formatQuantity(1.5, 'cc')).toBe('1,5 c. à c.');
    expect(formatQuantity(1, 'pincee')).toBe('1 pincée');
    expect(formatQuantity(2, 'gousse')).toBe('2 gousses');
    expect(formatQuantity(0.5, 'botte')).toBe('½ botte');
    expect(formatQuantity(1, 'boite')).toBe('1 boîte');
  });

  it('formatIngredientLine : français naturel', () => {
    expect(formatIngredientLine(3, 'piece', I.oignon)).toBe('3 oignons');
    expect(formatIngredientLine(1, 'piece', I.oignon)).toBe('1 oignon');
    expect(formatIngredientLine(1.5, 'piece', I.oignon)).toBe('1½ oignon');
    expect(formatIngredientLine(0.5, 'piece', I.citron)).toBe('½ citron');
    expect(formatIngredientLine(250, 'g', I.farine)).toBe('250 g de farine');
    expect(formatIngredientLine(20, 'cl', I.huile_olive)).toBe("20 cl d'huile d'olive");
    expect(formatIngredientLine(2, 'cs', I.huile_olive)).toBe("2 c. à s. d'huile d'olive");
    expect(formatIngredientLine(2, 'gousse', I.ail)).toBe("2 gousses d'ail");
    expect(formatIngredientLine(1, 'pincee', I.sel)).toBe('1 pincée de sel');
    expect(formatIngredientLine(2, 'pincee', I.sel)).toBe('2 pincées de sel');
    expect(formatIngredientLine(0.5, 'g', I.sel)).toBe('1 pincée de sel');
    expect(formatIngredientLine(1, 'g', I.sel)).toBe('2 pincées de sel');
    expect(formatIngredientLine(1, 'kg', I.pomme_de_terre)).toBe('1 kg de pomme de terre');
    expect(formatIngredientLine(2, 'piece', I.oeuf)).toBe('2 œufs');
    expect(formatIngredientLine(3, 'piece', { name: 'Oignon', namePlural: 'Oignons' })).toBe('3 oignons');
    expect(formatIngredientLine(200, 'g', { name: 'haricots verts' })).toBe('200 g de haricots verts');
    expect(formatIngredientLine(0, 'piece', I.sel)).toBe('Sel');
    expect(formatIngredientLine(NaN, 'g', I.sel)).toBe('Sel');
    expect(formatIngredientLine(1, 'piece', {})).toBe('1');
  });

  it('helpers', () => {
    expect(formatNumberFr(1.25, 2)).toBe('1,25');
    expect(formatNumberFr(3)).toBe('3');
    expect(formatPieces(10)).toBe('10');
    expect(unitLabel('pincee', 1)).toBe('pincée');
    expect(unitLabel('pincee', 3)).toBe('pincées');
    expect(unitLabel('piece')).toBe('');
    expect(isCountUnit('gousse')).toBe(true);
    expect(isCountUnit('g')).toBe(false);
    expect(roundTo(1.23456, 2)).toBe(1.23);
  });
});

describe('portions', () => {
  it('householdPortions : adulte 1, enfant 0,6, demi-portion supérieure, min 1', () => {
    expect(householdPortions({ adults: 2, children: 1 })).toBe(3);
    expect(householdPortions({ adults: 1, children: 1 })).toBe(2);
    expect(householdPortions({ adults: 2, children: 2 })).toBe(3.5);
    expect(householdPortions({ adults: 1, children: 3 })).toBe(3); // 2,8 sans bruit flottant
    expect(householdPortions({ adults: 1, children: 2 })).toBe(2.5);
    expect(householdPortions({ adults: 2, children: 0 })).toBe(2);
    expect(householdPortions({ adults: 0, children: 0 })).toBe(1);
    expect(householdPortions({ adults: 0, children: 1 })).toBe(1);
    expect(householdPortions({ adults: -3, children: -1 })).toBe(1);
    expect(householdServings({ adults: 2, children: 2 })).toBe(4);
  });

  it('scaleQuantity / ceilHalf', () => {
    expect(scaleQuantity(400, 4, 3)).toBe(300);
    expect(scaleQuantity(1, 3, 2)).toBe(0.6667);
    expect(scaleQuantity(5, 0, 3)).toBe(5);
    expect(ceilHalf(2.25)).toBe(2.5);
    expect(ceilHalf(2.5)).toBe(2.5);
    expect(ceilHalf(2.5000000001)).toBe(2.5);
  });

  it('scaleRecipeIngredients arrondit les pièces à la demi-unité supérieure', () => {
    const scaled = scaleRecipeIngredients(R.carbonara, 3);
    expect(scaled.find((x) => x.ingredientId === 'pates')?.quantity).toBe(300);
    expect(scaled.find((x) => x.ingredientId === 'oeuf')?.quantity).toBe(2.5); // 2,25 → 2,5
    expect(scaled.find((x) => x.ingredientId === 'parmesan')?.quantity).toBe(45);
    const omelette = scaleRecipeIngredients(R.omelette, 2);
    expect(omelette.find((x) => x.ingredientId === 'persil')?.quantity).toBe(0.5); // 0,25 botte → ½
    // la recette d'origine n'est pas modifiée
    expect(R.carbonara.ingredients.find((x) => x.ingredientId === 'oeuf')?.quantity).toBe(3);
  });
});

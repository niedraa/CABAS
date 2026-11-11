-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 09 · Nouvelles valeurs d'énumération (données ouvertes réelles)
--
-- Ce fichier ne contient QUE des `alter type … add value` : une valeur
-- d'énumération ajoutée n'est utilisable qu'une fois la transaction validée.
-- Les migrations suivantes (contraintes, RPC, seed) peuvent donc s'en servir.
--
-- Ordre des valeurs = ordre de src/core/types.ts :
--   store_chain  : leclerc, carrefour, auchan, intermarche, superu, lidl, aldi,
--                  netto, monoprix, franprix (STORE_CHAINS, ordre d'affichage) ;
--   price_source : open_prices, partner, collect, estimate, demo (PriceSource).
-- ════════════════════════════════════════════════════════════════════════════

alter type public.store_chain add value if not exists 'superu' after 'intermarche';
alter type public.store_chain add value if not exists 'aldi' after 'lidl';
alter type public.store_chain add value if not exists 'netto' after 'aldi';
alter type public.store_chain add value if not exists 'franprix' after 'monoprix';

-- Prix ESTIMÉ (aucun relevé pour ce produit dans cette enseigne) : toujours
-- signalé « Estimé » à l'utilisateur, jamais de promotion.
alter type public.price_source add value if not exists 'estimate' before 'demo';

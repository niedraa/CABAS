# Cabas — Back-end Supabase

> Postgres + Auth + Storage + Edge Functions (Deno), **hébergé dans l'UE**.
> Ce document décrit le schéma, la sécurité (RLS), l'API des fonctions, les
> tâches planifiées, la conformité RGPD et les commandes de développement /
> déploiement.

```
supabase/
├── config.toml                  Configuration CLI (auth, storage, fonctions)
├── .env.example                 Modèle des secrets des fonctions (aucune valeur réelle)
├── migrations/                  Schéma versionné (appliqué dans l'ordre)
│   ├── 20260901000000_extensions_and_types.sql   pgcrypto + énumérations (= core/types.ts)
│   ├── 20260901000100_catalog.sql                Catalogue + historique des prix
│   ├── 20260901000200_user_data.sql              Profil, planning, liste, panier, commande, placard, budget, consentements
│   ├── 20260901000300_billing_and_notifications.sql  Abonnement, RevenueCat, notifications
│   ├── 20260901000400_functions_and_triggers.sql     Triggers + RPC (RGPD, prix, planning)
│   ├── 20260901000500_rls_policies.sql           Row Level Security
│   ├── 20260901000600_storage.sql                Bucket recipe-images (gardé)
│   └── 20260901000700_cron_jobs.sql              pg_cron + pg_net (gardé)
├── seed.sql                     Catalogue de démonstration (GÉNÉRÉ : npm run seed:generate)
├── tests/
│   ├── supabase-stub.sql        Bouchon minimal de Supabase (rôles, auth.users, auth.uid())
│   ├── run-sql-tests.mjs        Tests SQL sur PGlite (migrations + seed + RLS + RPC)
│   └── scripts.test.mjs         Tests des scripts de génération
└── functions/
    ├── deno.json                Import map (supabase-js, @std/assert), lint, fmt
    ├── _shared/                 cors, http, env, logger, auth, supabaseClient, mappers,
    │   │                        validation, catalog, anthropic, expoPush, time, notifications
    │   ├── core/                COPIE GÉNÉRÉE de src/core (npm run sync:shared) — ne pas éditer
    │   └── testing/fixtures.ts  Doublures de test (non déployées)
    ├── generate-meal-plan/      index.ts · handler.ts · repo.ts · handler.test.ts · integration.test.ts
    ├── optimize-basket/         index.ts · handler.ts · repo.ts · handler.test.ts
    ├── collect-prices/          index.ts · handler.ts · repo.ts · openPrices.ts · handler.test.ts
    ├── send-notifications/      index.ts · handler.ts · repo.ts · handler.test.ts
    ├── revenuecat-webhook/      index.ts · handler.ts · repo.ts · handler.test.ts
    └── account/                 index.ts · handler.ts · repo.ts · handler.test.ts
```

**Architecture des fonctions** : `index.ts` ne fait que câbler les dépendances
réelles (`Deno.serve`). Toute la logique est dans `handler.ts`, une fonction
**pure à dépendances injectées** (dépôt de données, `fetch`, horloge, LLM,
logger) testée avec des doublures en mémoire — sans réseau ni base. `repo.ts`
implémente le dépôt avec supabase-js. La logique métier (filtrage des
allergènes, moteur de repas, comparateur, panier…) est celle de `src/core`,
copiée telle quelle : **la même règle s'exécute sur le téléphone et sur le
serveur**.

---

## 1. Schéma

### 1.1 Vue d'ensemble

```
                         ┌──────────────── CATALOGUE (public, lecture seule) ────────────────┐
                         │                                                                    │
   ingredients ◄──────── recipe_ingredients ────────► recipes                                │
   (allergènes,          (recipe_id, position,         (steps jsonb, meal_types[],            │
    drapeaux régime)      quantity, unit)               equipment[], is_published)            │
        ▲                                                                                     │
        │ ingredient_id                                                                       │
   products (ean UNIQUE, pack_size/unit, MDD → store_chain)                                   │
        │                                                                                     │
        ├──► prices (PK product_id × store_id, prix courant, promo) ──trigger──► price_history│
        │          │                                                    (append-only)        │
        │          ▼                                                                          │
        │       stores (chain, frais drive/livraison, osm_location_ids)                       │
        └─────────────────────────────────────────────────────────────────────────────────────┘

   auth.users ──1:1──► profiles (foyer, régimes*, allergies*, budget, temps, ustensiles,
        │                         magasins, créneaux, health_data_consent_at)   * données art. 9
        │
        ├──1:1──► subscriptions (entitlement, is_trial, expires_at, product_id, will_renew,
        │                        store, original_transaction_id, updated_from_event_at)
        ├──1:1──► notification_preferences (rappel planning jour/heure, commande, baisses, fuseau)
        ├──1:N──► push_tokens (ExponentPushToken[…], plateforme)
        ├──1:N──► meal_plans (user_id, id) ──► planned_meals (FK composite (user_id, plan_id))
        │               ▲                                       └──► recipes
        │               └── shopping_lists (meal_plan_id) ──► shopping_list_items
        │                         ▲
        │                         └── basket_plans (snapshot jsonb du BasketPlan)
        ├──1:N──► order_handoffs (store, canal, url, lignes jsonb, total, statut)
        ├──1:N──► pantry_items (V2)        ├──1:N──► spending_entries (V2)
        ├──1:N──► price_watches (product × store, prix de référence) — Premium
        ├──1:N──► notification_queue (kind, titre, corps, dedupe_key UNIQUE, statut)
        └──1:N──► consents (journal append-only : health_data, terms, marketing…)

   revenuecat_events (id = event.id RevenueCat : idempotence ; payload minimisé)
```

### 1.2 Conventions

- **Énumérations Postgres = référentiels de `src/core/types.ts`** (allergen,
  diet, equipment, aisle, cuisine, unit, base_unit, meal_type, store_chain,
  price_source, entitlement…). Ajouter une valeur : nouvelle migration
  `alter type … add value`, puis `types.ts`.
- **Montants en centimes** (`integer`), dates jour en `date`, horodatages en
  `timestamptz`.
- **Ids du catalogue** : chaînes lisibles identiques à `src/data`
  (`rec_curry_pois_chiches`, `prd_oignon_jaune`, `leclerc`).
- **Ids utilisateur** : l'app est offline-first et crée ses ids localement
  (`plan_…`, `meal_…`, `order_<uuid>`) ⇒ colonnes `text` et **clé primaire
  composite `(user_id, id)`**. Les clés étrangères entre tables utilisateur
  sont composites : une ligne ne peut référencer qu'une ligne **du même
  utilisateur**.
- `updated_at` maintenu par le trigger `set_updated_at()`.
- Fonctions : `security definer` seulement si nécessaire, toujours
  `set search_path = ''` et noms qualifiés ; `EXECUTE` révoqué de `PUBLIC`.

### 1.3 Contraintes métier notables

| Contrainte | Où | Effet |
|---|---|---|
| `profiles_health_data_requires_consent` | profiles | Allergies / régimes non vides ⇒ `health_data_consent_at` obligatoire. Retrait du consentement : remettre à `null` **et** vider `allergens`/`diets` dans la même requête. |
| `products_store_brand_chain` | products | Une MDD a toujours une enseigne, une marque nationale jamais. |
| `ean ~ '^[0-9]{8,14}$'` UNIQUE | products | Code-barres valide et unique. |
| `price_cents > 0` | prices | Aucun prix nul/négatif (sinon panier « gratuit »). |
| `week_start` = lundi | meal_plans | Un planning = une semaine ISO ; `unique (user_id, week_start)`. |
| `price_history` append-only | trigger | UPDATE/DELETE refusés (même au propriétaire) ; purge uniquement par `run_maintenance()`. |
| `push_tokens.token` | check | Format `ExponentPushToken[…]` / `ExpoPushToken[…]`, unique. |
| `notification_queue.dedupe_key` UNIQUE | — | Un rappel / une alerte n'est jamais mis en file deux fois. |

### 1.4 Triggers et RPC

| Nom | Type | Rôle |
|---|---|---|
| `handle_new_user()` | trigger `auth.users` AFTER INSERT | Crée `profiles` (nom depuis les métadonnées ou l'e-mail), `notification_preferences`, `subscriptions` (free). |
| `log_health_data_consent()` | trigger profiles | Journalise chaque octroi / retrait du consentement santé dans `consents`. |
| `record_price_history()` | trigger prices | Historise à l'insertion et à chaque changement effectif (prix, promo, source). |
| `get_prices_for_ingredients(ingredient_ids text[], store_ids text[] = null)` | RPC (anon, authenticated) | Produits + prix courants des magasins actifs pour des ingrédients. |
| `save_meal_plan(p_plan jsonb)` | RPC (authenticated, RLS) | Enregistre un `MealPlan` core en une transaction (un planning par semaine, id existant réutilisé). |
| `effective_entitlement(uuid)` | RPC | `premium` si non expiré, sinon `free` (RLS : seulement sa propre ligne). |
| `export_my_data()` | RPC (authenticated) | RGPD art. 20 : toutes les données de `auth.uid()` en JSON. |
| `delete_my_account()` | RPC security definer (authenticated) | RGPD art. 17 : supprime toutes les données de `auth.uid()`, anonymise `revenuecat_events`. |
| `run_maintenance()` | service_role / cron | Purge notifications traitées > 30 j, historique des prix > 3 ans. |
| `schedule_cabas_jobs()` / `unschedule_cabas_jobs()` | postgres | (Dé)planifie les tâches pg_cron (voir §4). |

---

## 2. Row Level Security

RLS **activée sur toutes les tables** du schéma `public` (vérifié par les
tests). `service_role` a `BYPASSRLS` (Edge Functions système uniquement).

| Table | anon | authenticated | Écriture |
|---|---|---|---|
| ingredients, products, prices, price_history | SELECT | SELECT | service_role |
| recipes | SELECT si `is_published` | idem | service_role |
| recipe_ingredients | SELECT si la recette est publiée | idem | service_role |
| stores | SELECT si `is_active` | idem | service_role |
| profiles | — (droits révoqués) | CRUD si `auth.uid() = id` | propriétaire |
| meal_plans, planned_meals, shopping_lists, shopping_list_items, basket_plans, order_handoffs, pantry_items, spending_entries, notification_preferences, push_tokens | — | CRUD si `auth.uid() = user_id` | propriétaire |
| price_watches | — | SELECT/UPDATE/DELETE propriétaire ; INSERT propriétaire **et Premium** | propriétaire |
| consents | — | SELECT + INSERT (`source = 'app'`) ; ni UPDATE ni DELETE | append-only |
| subscriptions | — | SELECT de sa ligne | service_role (webhook) |
| notification_queue | — | SELECT de ses lignes | service_role |
| revenuecat_events | — | — (aucune politique, droits révoqués) | service_role |

Défense en profondeur : en plus de l'absence de politique, les droits
`INSERT/UPDATE/DELETE` sont révoqués à `anon`/`authenticated` sur le catalogue,
`subscriptions`, `notification_queue`, `consents` (UPDATE/DELETE), et **tous**
les droits sont révoqués à `anon` sur les tables personnelles.

---

## 3. Edge Functions — API

Base : `https://<project-ref>.supabase.co/functions/v1/<nom>`.
Erreurs : `{ "error": { "code": "…", "message": "…(FR)", "details"?: … } }`
avec un statut HTTP explicite (400 invalid_request / invalid_json, 401
unauthorized, 404, 405 method_not_allowed, 413 payload_too_large, 500
internal_error / server_misconfigured, 502). Aucune erreur interne n'est
renvoyée au client (journalisée, données sensibles masquées).

### 3.1 `generate-meal-plan` (JWT utilisateur)

```http
POST /functions/v1/generate-meal-plan
Authorization: Bearer <access_token>

{
  "weekStart": "2026-11-16",            // lundi, à moins d'un an
  "maxMeals": 9,                         // 1-14, facultatif (plafonné par l'offre)
  "lockedMeals": [                       // facultatif : repas à conserver
    { "id": "meal_x", "date": "2026-11-17", "type": "diner", "recipeId": "rec_dahl", "servings": 3 }
  ],
  "recentRecipeIds": ["rec_…"],          // facultatif (variété)
  "pantryIngredientIds": ["riz"],        // facultatif (anti-gaspi)
  "seed": "abc"                          // facultatif (reproductibilité)
}
```

```jsonc
200 {
  "plan": { "id": "plan_…", "weekStart": "2026-11-16", "generatedAt": "…", "source": "ai" | "rules",
            "meals": [{ "id", "date", "type", "recipeId", "servings", "locked"?, "reason"? }] },
  "meta": {
    "source": "ai",
    "entitlement": "free" | "premium",
    "maxMeals": 3, "clampedToFreeTier": true,
    "safeRecipeCount": 58,
    "llm": { "attempted": true, "ok": true, "model": "claude-haiku-5-5",
             "fallbackReason"?: "llm_not_configured" | "no_open_slots" | "no_candidates" | "budget_exhausted"
                              | "timeout" | "llm_error" | "llm_refusal" | "unparseable" | "empty_selection",
             "rejectedMeals": 0 },
    "safety": { "unsafeMealsReplaced": 0 },
    "persisted": true,
    "timings": { "loadMs": 40, "llmMs": 2100, "totalMs": 2300 }
  }
}
```

Chaîne de sécurité (critère n° 1 du dossier — *aucun plat contenant un
allergène déclaré*) :

1. **Filtrage serveur indépendant de l'IA** : seules les recettes sûres
   (`filterSafeRecipes` : allergènes, régimes, ingrédients connus, optionnels
   compris) entrent dans le moteur et dans la liste de candidats du LLM.
2. **Prompt sans donnée de santé** (`buildLlmPrompt`) : le LLM ne voit que des
   candidats déjà filtrés — minimisation RGPD.
3. **Revalidation de la réponse** (`parseLlmResponse`) : ids inconnus, créneaux
   invalides, doublons et recettes non sûres rejetés (`meta.llm.rejectedMeals`).
4. **Repli règles** (`generateMealPlan`) sur absence de clé, délai (7 s,
   `AbortController` + course), erreur HTTP, refus, JSON illisible.
5. **Dernier filet** `assertPlanSafe` sur le catalogue COMPLET : un repas non
   sûr est remplacé par les règles, sinon retiré ; un invariant final lève une
   erreur plutôt que de renvoyer un plat dangereux.

Budget : < 10 s (LLM ≤ 7 s, budget total 9 s ; le catalogue est mis en cache
5 min par instance). Appel Claude : `POST https://api.anthropic.com/v1/messages`,
`x-api-key`, `anthropic-version: 2023-06-01`, `max_tokens` 1500,
`output_config.effort: "low"`, réflexion désactivée sur Haiku.

### 3.2 `optimize-basket` (JWT utilisateur)

```http
POST /functions/v1/optimize-basket
{ "items": [ShoppingListItem…],          // 1-300 articles (core › ShoppingListItem)
  "mode": "cheapest" | "single_store",   // défaut cheapest
  "storeIds": ["leclerc", "lidl"],       // facultatif ; sinon magasins préférés ; sinon tous
  "channel": "drive" | "delivery",       // défaut drive (frais inclus)
  "maxStores": 2,                        // 1-4, mode cheapest
  "save": true, "listId": "list_…" }     // facultatif : instantané dans basket_plans
```

```jsonc
200 { "comparisons": [ItemComparison…],  // tous les magasins actifs (≥ 3 enseignes), prix au kilo, alternative MDD
      "plan": BasketPlan,                // restreint aux magasins retenus
      "meta": { "requestedMode": "cheapest", "mode": "single_store", "downgraded": true,
                "reason": "premium_required", "entitlement": "free", "channel": "drive",
                "allowedStoreIds": […], "storesCompared": 5, "itemsWithoutOffer": ["…"],
                "basketPlanId"?: "…" } }
```

Gratuit : comparateur complet + panier « un seul magasin ». Premium : panier
« le moins cher » multi-magasins. Les articles cochés sont ignorés.

### 3.3 `collect-prices` (cron, en-tête `x-cron-secret`)

```http
POST /functions/v1/collect-prices
x-cron-secret: <CRON_SECRET>
{ "limit": 200, "productIds"?: ["prd_…"], "dryRun"?: false }
→ 200 { "stats": { productsRequested, productsProcessed, observations, rejectedObservations,
                   unmatchedObservations, pricesUpserted, pricesSkippedOlder, errors, rateLimited,
                   stoppedEarly, priceDrops, notificationsQueued, dryRun, durationMs } }
```

- Source : **Open Prices** (`GET https://prices.openfoodfacts.org/api/v1/prices?product_code=<ean>&order_by=-date&date__gte=…`), données ODbL.
- Séquentiel, pause `OPEN_PRICES_DELAY_MS` (1 s) ; HTTP 429 : `Retry-After`
  respecté une fois, puis arrêt propre du lot ; budget de temps 120 s.
- Normalisation : EUR, prix au kilo / litre → prix du conditionnement, promo
  (`price_without_discount`), garde-fou 0,05 €–500 €, relevés > 60 j ignorés.
- Magasin : `stores.osm_location_ids` (exact) sinon enseigne déduite de
  `osm_brand` / `osm_name` (prix « national » de l'enseigne) ; MDD limitée à son
  enseigne ; un relevé plus ancien qu'un prix réel ne l'écrase pas (un prix
  `demo` est toujours remplacé).
- Baisses ≥ 5 % (`detectPriceDrops`) sur `price_watches` des utilisateurs
  **Premium** ayant activé « baisses de prix » → `notification_queue`
  (dédupliqué par prix).

### 3.4 `send-notifications` (cron, `x-cron-secret`)

```http
POST /functions/v1/send-notifications   x-cron-secret: <CRON_SECRET>   {}
→ 200 { "stats": { remindersQueued, planningCandidates, orderCandidates, processed, sent,
                   failed, skipped, retrying, messages, batches, tokensRemoved } }
```

- **Rappel de planification** : jour + heure de `notification_preferences`,
  dans le **fuseau de l'utilisateur** (Europe/Paris par défaut), s'il n'a pas
  encore de planning pour la semaine visée (lundi → semaine en cours, sinon la
  suivante). Dédupliqué par jour.
- **Rappel de commande** : vendredi à `ORDER_REMINDER_HOUR` (10 h locale), si
  le planning de la semaine suivante a une liste mais aucune commande préparée
  depuis sa génération.
- **File** (dont les baisses de prix) → Expo Push par lots de 100 ;
  `DeviceNotRegistered` ⇒ jeton supprimé ; erreurs transitoires
  (`MessageRateExceeded`, HTTP) ⇒ réessai, 5 tentatives max ; préférence
  désactivée entre-temps ⇒ `skipped`.

### 3.5 `revenuecat-webhook` (en-tête `Authorization`)

RevenueCat › Integrations › Webhooks : URL de la fonction, *Authorization
header* = `REVENUECAT_WEBHOOK_SECRET` (comparaison en temps constant ;
`Bearer <secret>` accepté aussi). `app_user_id` = id Supabase de l'utilisateur
(`Purchases.logIn(user.id)` dans l'app).

| Événement | Effet sur `subscriptions` |
|---|---|
| INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, SUBSCRIPTION_EXTENDED, REFUND_REVERSED | premium si `expiration_at_ms` futur, `is_trial` = `period_type` TRIAL, `will_renew` = true |
| PRODUCT_CHANGE | idem, `product_id` = `new_product_id` |
| NON_RENEWING_PURCHASE, TEMPORARY_ENTITLEMENT_GRANT | premium jusqu'à l'échéance, `will_renew` = false |
| CANCELLATION | `will_renew` = false, accès jusqu'à l'échéance (remboursement : échéance passée ⇒ free) |
| SUBSCRIPTION_PAUSED | `will_renew` = false, accès jusqu'à l'échéance |
| BILLING_ISSUE | `billing_issue_at`, accès jusqu'à la fin de la période de grâce |
| EXPIRATION | free, `will_renew` = false |
| TRANSFER | `transferred_from` ⇒ free ; `transferred_to` ⇒ premium si échéance future |
| TEST, autres types, autre entitlement | 200, ignoré (tracé dans `outcome`) |

Idempotence : `revenuecat_events.id` = `event.id` ; déjà traité ⇒ `200
{status:"duplicate"}` ; échec ⇒ 500 et retraitement à la relivraison.
Événements en retard (`event_timestamp_ms` < dernier appliqué) ignorés.
`subscriber_attributes` (e-mail…) n'est **pas** stocké.

### 3.6 `account` (JWT utilisateur) — RGPD

```http
POST /functions/v1/account   { "action": "export" }
→ 200 (Content-Disposition: attachment; filename="cabas-export-AAAA-MM-JJ.json")
      { "format": "cabas-export", "version": 1, "account": { id, email }, "profile", "consents",
        "mealPlans": [{…, "meals": […]}], "shoppingLists": [{…, "items": […]}], "basketPlans",
        "orderHandoffs", "pantryItems", "spendingEntries", "priceWatches", "pushTokens" (sans le jeton),
        "notifications", "subscription", "notificationPreferences" }

POST /functions/v1/account   { "action": "delete" }
→ 200 { "status": "deleted", "deleted": { "userId", "deleted": { "<table>": n, … } } }
→ 502 auth_deletion_failed : données supprimées mais compte auth non fermé (rejouer)
```

Suppression : `delete_my_account()` exécutée **avec le JWT** (ne peut viser
que `auth.uid()`), puis `auth.admin.deleteUser` (service_role) qui révoque les
sessions ; le reste part en cascade. L'abonnement App Store / Google Play
n'est pas résilié automatiquement (à faire par l'utilisateur — l'app le
rappelle).

---

## 4. Tâches planifiées (pg_cron + pg_net)

| Job | Planning (UTC) | Action |
|---|---|---|
| `cabas-collect-prices` | `17 4 * * *` (≈ 5 h 17 Paris) | `POST collect-prices {"limit": 200}` |
| `cabas-send-notifications` | `*/15 * * * *` | `POST send-notifications {}` |
| `cabas-maintenance` | `41 3 * * *` | `select public.run_maintenance()` |

Mise en place (une fois, éditeur SQL du dashboard) — les secrets restent dans
**Vault**, jamais dans une migration :

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'cabas_project_url');
select vault.create_secret('<valeur de CRON_SECRET>', 'cabas_cron_secret');
select public.schedule_cabas_jobs();      -- idempotent ; renvoie un statut lisible
-- arrêt : select public.unschedule_cabas_jobs();
-- suivi : select * from cron.job_run_details order by start_time desc limit 20;
```

La migration `…700_cron_jobs.sql` installe pg_cron/pg_net s'ils sont
disponibles et tente la planification (sans effet tant que Vault n'est pas
renseigné) ; elle est sans effet hors Supabase (tests PGlite).

---

## 5. RGPD

| Exigence | Mise en œuvre |
|---|---|
| Hébergement UE | Projet créé en région UE (`eu-west-3` Paris recommandé, ou `eu-central-1`). Les sous-traitants hors UE (Anthropic, Expo, RevenueCat) ne reçoivent **aucune donnée de santé**. |
| Consentement explicite (art. 9) | Contrainte `profiles_health_data_requires_consent` : allergies/régimes impossibles sans `health_data_consent_at`. Chaque octroi/retrait journalisé dans `consents` (trigger). L'app peut journaliser d'autres consentements (`terms`, `marketing`, `analytics`, `push`). |
| Minimisation | Prompt LLM sans allergies ni régimes ; logs masquant secrets, jetons, JWT, e-mail, champs santé ; `subscriber_attributes` RevenueCat non stockés ; export sans le jeton push brut. |
| Accès / portabilité (art. 15, 20) | `account` `export` → JSON complet. |
| Rectification | Profil modifiable à tout moment (RLS propriétaire). |
| Effacement (art. 17) | `account` `delete` → `delete_my_account()` + suppression auth ; cascades sur toutes les tables ; journal RevenueCat anonymisé (conservé pour l'idempotence et la comptabilité). |
| Sécurité | RLS partout, service_role réservé aux tâches système, secrets en variables d'environnement / Vault, comparaisons de secrets en temps constant. |
| Conservation | Notifications traitées : 30 j ; historique des prix (non personnel) : 3 ans. |

Colonnes sensibles commentées en base (`comment on column … 'DONNÉE DE
SANTÉ (RGPD art. 9)…'`).

---

## 6. Développement local

Prérequis : Node ≥ 22.18 (type stripping), Deno 2, CLI Supabase + Docker pour
la pile locale complète (facultatif : les tests n'en ont pas besoin).

```bash
# Fichiers générés
npm run sync:shared                 # src/core → supabase/functions/_shared/core (idempotent ; --check en CI)
npm run seed:generate               # src/data → supabase/seed.sql (idempotent ; --check en CI)

# Tests (sans Docker)
node supabase/tests/run-sql-tests.mjs          # migrations + seed + RLS + RPC sur PGlite
node --test supabase/tests/scripts.test.mjs    # scripts de génération
cd supabase/functions && deno test --allow-env --allow-read
cd supabase/functions && deno check */index.ts && deno lint && deno fmt --check

# Pile locale complète (Docker)
cp supabase/.env.example supabase/.env         # puis renseigner les secrets
supabase start                                 # Postgres, Auth, Storage, Studio (http://127.0.0.1:54323)
supabase db reset                              # migrations + seed.sql
supabase functions serve --env-file supabase/.env
curl -X POST http://127.0.0.1:54321/functions/v1/generate-meal-plan \
  -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
  -d '{"weekStart":"2026-11-16"}'
```

## 7. Déploiement

```bash
supabase login
supabase projects create cabas --org-id <org> --region eu-west-3 --db-password <mdp>   # UE (Paris)
supabase link --project-ref <project-ref>
supabase db push                                   # applique les migrations
supabase db push --include-seed                    # (optionnel) + catalogue de démo seed.sql
#   ou : psql "<chaîne de connexion du dashboard>" -f supabase/seed.sql
supabase secrets set --env-file supabase/.env      # ANTHROPIC_API_KEY, CRON_SECRET, …
supabase functions deploy generate-meal-plan optimize-basket account
supabase functions deploy collect-prices send-notifications revenuecat-webhook --no-verify-jwt
# puis : secrets Vault + select public.schedule_cabas_jobs();   (§4)
# puis : URL du webhook dans RevenueCat (§3.5) ; fournisseurs Apple/Google dans Auth.
```

Variables de l'app (voir `.env.example` à la racine) :
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — sans elles,
l'app fonctionne en mode démo hors-ligne.

---

## 8. Tests — ce qui est couvert

| Suite | Commande | Contenu |
|---|---|---|
| SQL (PGlite) | `node supabase/tests/run-sql-tests.mjs` | Tables, RLS sur toutes les tables, politiques, isolation A/B (lecture, écriture, insertion au nom d'autrui, FK composites), anon : catalogue oui / données perso non, handle_new_user, consentement santé + journal, save_meal_plan, abonnement en lecture seule, Premium requis pour price_watches, trigger + append-only de price_history, get_prices_for_ingredients, export/suppression RGPD, cascade auth, maintenance, garde cron. |
| Scripts | `node --test supabase/tests/scripts.test.mjs` | Réécriture des imports, échappement SQL, exécution réelle du SQL généré, fraîcheur des fichiers générés. |
| Edge Functions | `deno test --allow-env --allow-read` | Handlers (succès + échecs), dont : délai LLM → règles, LLM proposant un allergène → rejeté, limite gratuite, filet de sécurité face à un moteur défaillant, webhook 401 / doublon idempotent / ordre, DeviceNotRegistered, parsing Open Prices, 429 ; intégration sur le **vrai catalogue** (14 allergènes, 8 régimes, 200 profils combinés face à un LLM adversaire). |

### Bouchons PGlite (limites documentées)

PGlite n'embarque pas les services Supabase. `tests/supabase-stub.sql` recrée
le strict nécessaire : rôles `anon` / `authenticated` / `service_role`
(BYPASSRLS), `auth.users`, `auth.uid()` / `auth.role()` / `auth.jwt()` lisant
`request.jwt.claim.*` comme PostgREST, droits par défaut. Non testés en
PGlite (migrations gardées, sans effet) : bucket Storage, Vault, pg_cron,
pg_net. Les `repo.ts` (supabase-js → PostgREST) sont vérifiés par le
typage (`deno check`) mais pas exécutés contre un vrai PostgREST.

## 9. Limites connues / suites

- **Reçus Expo** (`/push/getReceipts`) non traités : les erreurs remontées
  uniquement au reçu (ex. jeton invalide détecté tardivement) ne suppriment
  pas encore le jeton.
- **Rattachement magasin Open Prices** : sans `osm_location_ids` renseignés,
  un relevé est appliqué à tous les magasins de l'enseigne (prix national
  approximatif). Renseigner les points de vente OSM des magasins pour un
  rattachement exact.
- **Limitation de débit** des fonctions utilisateur (coût LLM) : non
  implémentée côté fonction ; s'appuyer sur les limites de la passerelle
  Supabase ou ajouter un compteur par utilisateur.
- Commande V1 = panier pré-rempli + redirection (pas d'API partenaire drive).

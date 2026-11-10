-- ════════════════════════════════════════════════════════════════════════════
-- Bouchon MINIMAL de l'environnement Supabase pour les tests PGlite.
--
-- Reproduit uniquement ce dont les migrations Cabas dépendent :
--   • rôles anon / authenticated / service_role (service_role : BYPASSRLS) ;
--   • schéma auth : table auth.users (colonnes utilisées par handle_new_user),
--     fonctions auth.uid(), auth.role(), auth.jwt() lisant les réglages
--     `request.jwt.claim.sub` / `request.jwt.claims` comme PostgREST ;
--   • droits par défaut de Supabase sur le schéma public.
--
-- NON reproduit (documenté dans docs/BACKEND.md) : storage, vault, pg_cron,
-- pg_net (les migrations correspondantes sont gardées et deviennent sans effet).
-- ════════════════════════════════════════════════════════════════════════════

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema if not exists auth;
create schema if not exists extensions;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), auth.jwt() ->> 'sub'),
    ''
  )::uuid
$$;

create function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role')
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Droits par défaut de Supabase sur les objets créés dans public.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

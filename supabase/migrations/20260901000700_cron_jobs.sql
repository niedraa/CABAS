-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 08 · Tâches planifiées (pg_cron + pg_net)
--
-- Les Edge Functions « cron » (collect-prices, send-notifications) sont
-- appelées en HTTP par pg_net, avec l'en-tête `x-cron-secret`. L'URL du projet
-- et le secret sont lus dans Supabase Vault AU MOMENT DE L'EXÉCUTION : aucun
-- secret n'est écrit dans cette migration.
--
-- MISE EN PLACE (une fois par projet, éditeur SQL du dashboard) :
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'cabas_project_url');
--   select vault.create_secret('<même valeur que le secret CRON_SECRET des fonctions>', 'cabas_cron_secret');
--   select public.schedule_cabas_jobs();
--
-- `schedule_cabas_jobs()` est idempotente (cron.schedule remplace un job du
-- même nom). Pour tout arrêter : `select public.unschedule_cabas_jobs();`.
--
-- Planning (UTC) :
--   cabas-collect-prices      17 4 * * *    collecte Open Prices quotidienne (≈ 5 h 17 / 6 h 17 à Paris)
--   cabas-send-notifications  */15 * * * *  rappels (heure locale de chaque utilisateur) + file d'alertes
--   cabas-maintenance         41 3 * * *    purge (run_maintenance)
--
-- Gardes : si pg_cron / pg_net ne sont pas disponibles (tests PGlite), rien
-- n'est créé ; si les secrets Vault manquent, les fonctions existent mais la
-- planification est différée (message NOTICE).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.schedule_cabas_jobs()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_call text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 'pg_cron / pg_net non installés : rien planifié';
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    return 'Supabase Vault absent : rien planifié';
  end if;
  if (select count(*) from vault.decrypted_secrets where name in ('cabas_project_url', 'cabas_cron_secret')) < 2 then
    return 'Secrets Vault cabas_project_url / cabas_cron_secret manquants : rien planifié';
  end if;

  -- Modèle d'appel HTTP : URL et secret relus dans Vault à chaque exécution.
  v_call := $tpl$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'cabas_project_url') || '/functions/v1/%s',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cabas_cron_secret')
      ),
      body := '%s'::jsonb,
      timeout_milliseconds := 150000
    );
  $tpl$;

  perform cron.schedule('cabas-collect-prices', '17 4 * * *', format(v_call, 'collect-prices', '{"limit": 200}'));
  perform cron.schedule('cabas-send-notifications', '*/15 * * * *', format(v_call, 'send-notifications', '{}'));
  perform cron.schedule('cabas-maintenance', '41 3 * * *', 'select public.run_maintenance();');
  return 'ok : 3 tâches planifiées';
end;
$$;

create or replace function public.unschedule_cabas_jobs()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  j text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return 'pg_cron non installé';
  end if;
  foreach j in array array['cabas-collect-prices', 'cabas-send-notifications', 'cabas-maintenance'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
  return 'ok';
end;
$$;

revoke execute on function public.schedule_cabas_jobs() from public, anon, authenticated;
revoke execute on function public.unschedule_cabas_jobs() from public, anon, authenticated;

-- Installation des extensions quand elles sont disponibles (Supabase), puis
-- tentative de planification (sans effet tant que Vault n'est pas renseigné).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_cron';
    execute 'create extension if not exists pg_net with schema extensions';
    raise notice 'schedule_cabas_jobs : %', public.schedule_cabas_jobs();
  else
    raise notice 'pg_cron / pg_net indisponibles : tâches planifiées ignorées (environnement de test).';
  end if;
end;
$$;

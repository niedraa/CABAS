-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 07 · Storage : photos des recettes
--
-- Bucket PUBLIC `recipe-images` (lecture publique par URL, sans RLS) ; aucune
-- politique d'écriture sur storage.objects ⇒ seul service_role téléverse.
-- Les photos sont référencées par recipes.image_url.
--
-- Bloc gardé : le schéma `storage` n'existe que sur Supabase (pas dans les
-- tests PGlite), la migration est alors sans effet.
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'storage' and c.relname = 'buckets') then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('recipe-images', 'recipe-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
      on conflict (id) do update
        set public = excluded.public,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types
    $sql$;
  else
    raise notice 'Schéma storage absent : bucket recipe-images non créé (environnement de test).';
  end if;
end;
$$;

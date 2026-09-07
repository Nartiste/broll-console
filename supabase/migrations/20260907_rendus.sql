-- Console B-roll — les fichiers rendus d'un compte (gabarits en .mov, images fixes).
--
-- Un rendu prend jusqu'à trois minutes : on le fait une fois, on le garde.
-- Le navigateur téléverse le fichier sous le dossier de l'utilisateur
-- (rendus/<user_id>/<projet>/<fichier>) ; chacun ne lit et n'écrit que
-- chez lui. Bucket privé : le téléchargement passe par une URL signée.
--
-- À exécuter une fois dans Supabase → SQL Editor, après 20260907_projets.sql.

insert into storage.buckets (id, name, public, file_size_limit)
values ('rendus', 'rendus', false, 209715200)
on conflict (id) do nothing;

create policy "lire ses rendus" on storage.objects for select
  using (bucket_id = 'rendus' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "deposer ses rendus" on storage.objects for insert
  with check (bucket_id = 'rendus' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "remplacer ses rendus" on storage.objects for update
  using (bucket_id = 'rendus' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "supprimer ses rendus" on storage.objects for delete
  using (bucket_id = 'rendus' and (storage.foldername(name))[1] = auth.uid()::text);

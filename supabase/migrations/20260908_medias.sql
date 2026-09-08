-- Console B-roll — les médias d'un compte : vignettes validées et clips terminés.
--
-- Bucket PUBLIC en lecture : l'adresse d'une vignette est donnée en référence
-- au moteur vidéo, qui doit pouvoir la lire sans jeton. L'écriture reste
-- réservée au dossier de l'utilisateur (medias/<user_id>/…). Les adresses
-- contiennent l'identifiant du compte et du projet : impossibles à deviner.
--
-- À exécuter une fois dans Supabase → SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit)
values ('medias', 'medias', true, 209715200)
on conflict (id) do update set public = true;

drop policy if exists "lire les medias" on storage.objects;
drop policy if exists "deposer ses medias" on storage.objects;
drop policy if exists "remplacer ses medias" on storage.objects;
drop policy if exists "supprimer ses medias" on storage.objects;
create policy "lire les medias" on storage.objects for select
  using (bucket_id = 'medias');
create policy "deposer ses medias" on storage.objects for insert
  with check (bucket_id = 'medias' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "remplacer ses medias" on storage.objects for update
  using (bucket_id = 'medias' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "supprimer ses medias" on storage.objects for delete
  using (bucket_id = 'medias' and (storage.foldername(name))[1] = auth.uid()::text);

-- Console B-roll — les projets d'un compte.
--
-- Un projet entier tient dans une colonne jsonb : le script, le cadrage, la
-- charte, les gabarits, les décisions, la production. C'est l'objet que le
-- navigateur garde déjà en local ; le serveur en devient la copie de
-- référence dès qu'on est connecté. La clé est (user_id, id) : les
-- identifiants sont courts et générés côté client, ils n'ont pas à être
-- uniques entre deux comptes.
--
-- À exécuter une fois dans Supabase → SQL Editor.

create table if not exists public.projets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id      text not null,
  data    jsonb not null,
  maj     timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists projets_user_maj on public.projets (user_id, maj desc);

alter table public.projets enable row level security;

-- Chacun ne voit et ne touche que ses projets. Rien d'autre.
create policy "lire ses projets"      on public.projets for select using (auth.uid() = user_id);
create policy "creer ses projets"     on public.projets for insert with check (auth.uid() = user_id);
create policy "modifier ses projets"  on public.projets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "supprimer ses projets" on public.projets for delete using (auth.uid() = user_id);

-- Console B-roll — le compteur de dépense.
--
-- Chaque appel payant (modèle, images, vidéo, rendu) écrit une ligne avec
-- son coût estimé, sous le jeton de l'appelant. On ne peut qu'ajouter et lire
-- ses propres lignes : personne ne baisse son compteur. Le plafond global se
-- lit par une fonction qui somme tout le monde, sans exposer les lignes.
--
-- À exécuter une fois dans Supabase → SQL Editor.

create table if not exists public.depenses (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  quand   timestamptz not null default now(),
  poste   text not null,
  montant numeric(10, 4) not null check (montant >= 0),
  detail  text
);

create index if not exists depenses_user_quand on public.depenses (user_id, quand desc);
create index if not exists depenses_quand on public.depenses (quand desc);

alter table public.depenses enable row level security;

drop policy if exists "lire ses depenses" on public.depenses;
drop policy if exists "ajouter ses depenses" on public.depenses;
create policy "lire ses depenses"    on public.depenses for select using (auth.uid() = user_id);
create policy "ajouter ses depenses" on public.depenses for insert with check (auth.uid() = user_id);

create or replace function public.depense_globale_jour()
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(montant), 0) from public.depenses where quand > now() - interval '24 hours';
$$;
revoke all on function public.depense_globale_jour() from public;
grant execute on function public.depense_globale_jour() to authenticated;

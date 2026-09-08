-- Console B-roll — les tâches vidéo, suivies hors de l'onglet.
--
-- Chaque clip lancé chez Seedance devient une ligne : le serveur la crée au
-- lancement, la met à jour quand le moteur rappelle (callback) ou quand le
-- cron l'interroge, et y range l'adresse durable du clip une fois copié
-- sur le compte. L'onglet, s'il est ouvert, lit ces lignes ; s'il est fermé,
-- rien n'est perdu.

create table if not exists public.taches (
  id      text primary key,                       -- identifiant ModelArk
  user_id uuid not null references auth.users (id) on delete cascade,
  projet  text not null,
  n       integer not null,
  fichier text not null,
  statut  text not null default 'file',           -- file, en-cours, pret, echec
  video   text,                                   -- adresse durable (ou celle du moteur, provisoire)
  erreur  text,
  cree    timestamptz not null default now(),
  maj     timestamptz not null default now()
);

create index if not exists taches_user_projet on public.taches (user_id, projet);
create index if not exists taches_ouvertes on public.taches (statut) where statut in ('file', 'en-cours');

alter table public.taches enable row level security;

drop policy if exists "lire ses taches" on public.taches;
drop policy if exists "creer ses taches" on public.taches;
drop policy if exists "modifier ses taches" on public.taches;
create policy "lire ses taches"     on public.taches for select using (auth.uid() = user_id);
create policy "creer ses taches"    on public.taches for insert with check (auth.uid() = user_id);
create policy "modifier ses taches" on public.taches for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

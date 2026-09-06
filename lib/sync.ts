"use client";

/**
 * Synchronisation des projets avec le compte.
 *
 * Le navigateur reste la copie de travail — chaque clic écrit en local,
 * instantanément. Quand une session existe, la même écriture part vers
 * Supabase, groupée (un envoi par projet toutes les 800 ms au plus). À la
 * connexion, on tire les projets du compte et on propose d'y verser ceux qui
 * n'étaient que locaux. Le plus récent gagne, à la seconde près.
 *
 * Sans session ni configuration : tout marche comme avant, en local.
 */

import { supabase } from "./supabase";
import type { Projet } from "./store";

const CLE = "broll-console:projets";
const lireLocal = (): Projet[] => { try { return JSON.parse(localStorage.getItem(CLE) || "[]"); } catch { return []; } };
const ecrireLocal = (p: Projet[]) => { try { localStorage.setItem(CLE, JSON.stringify(p)); } catch { /* mode privé */ } };

export async function utilisateur(): Promise<{ id: string; email?: string } | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email } : null;
}

const enAttente = new Map<string, ReturnType<typeof setTimeout>>();

/** Envoi groupé d'un projet. Silencieux sans session : le local suffit. */
export function pousser(p: Projet) {
  const t = enAttente.get(p.id);
  if (t) clearTimeout(t);
  enAttente.set(p.id, setTimeout(async () => {
    enAttente.delete(p.id);
    const u = await utilisateur();
    const sb = supabase();
    if (!u || !sb) return;
    const versionCompte = { ...p, compte: u.id };
    const { error } = await sb.from("projets").upsert(
      { user_id: u.id, id: p.id, data: versionCompte, maj: new Date(p.maj || Date.now()).toISOString() },
      { onConflict: "user_id,id" });
    if (error) return;
    // Marquer la copie locale comme appartenant au compte, sans toucher au reste.
    ecrireLocal(lireLocal().map(x => (x.id === p.id ? { ...x, compte: u.id } : x)));
  }, 800));
}

export async function supprimerDistant(id: string) {
  const u = await utilisateur(); const sb = supabase();
  if (!u || !sb) return;
  await sb.from("projets").delete().eq("user_id", u.id).eq("id", id);
}

/** Tire les projets du compte et les fond dans le local — le plus récent gagne. */
export async function tirer(): Promise<{ recus: number; locaux: number } | null> {
  const u = await utilisateur(); const sb = supabase();
  if (!u || !sb) return null;
  const { data, error } = await sb.from("projets").select("id,data,maj").eq("user_id", u.id);
  if (error || !data) return null;
  const locaux = lireLocal();
  const parId = new Map(locaux.map(p => [p.id, p]));
  for (const ligne of data) {
    const distant = ligne.data as Projet;
    const local = parId.get(ligne.id);
    if (!local || (distant.maj || 0) >= (local.maj || 0)) parId.set(ligne.id, { ...distant, compte: u.id });
  }
  const fusion = [...parId.values()].sort((a, b) => b.cree - a.cree);
  ecrireLocal(fusion);
  return { recus: data.length, locaux: locaux.filter(p => !p.compte).length };
}

/** Verse dans le compte les projets qui n'étaient que locaux. */
export async function importerLocaux(): Promise<number> {
  const u = await utilisateur(); const sb = supabase();
  if (!u || !sb) return 0;
  const locaux = lireLocal();
  const orphelins = locaux.filter(p => !p.compte);
  if (!orphelins.length) return 0;
  const lignes = orphelins.map(p => ({ user_id: u.id, id: p.id, data: { ...p, compte: u.id }, maj: new Date(p.maj || p.cree).toISOString() }));
  const { error } = await sb.from("projets").upsert(lignes, { onConflict: "user_id,id" });
  if (error) return 0;
  ecrireLocal(locaux.map(p => (p.compte ? p : { ...p, compte: u.id })));
  return orphelins.length;
}

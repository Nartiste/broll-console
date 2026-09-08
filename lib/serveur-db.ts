import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * L'accès à Supabase depuis le serveur.
 *
 * Deux façons : avec le jeton de l'appelant (chacun ne touche qu'à ses
 * lignes, par RLS), ou avec la clé de service — réservée aux routes que
 * personne n'appelle pour son compte : le rappel du moteur vidéo et le cron.
 * Sans clé de service, ces deux-là se déclarent absents, et le suivi reste
 * dans l'onglet.
 */
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const serviceConfigure = () => Boolean(URL_SB && CLE_SERVICE);

export function clientJeton(jeton: string): SupabaseClient | null {
  if (!URL_SB || !CLE_SB || !jeton) return null;
  return createClient(URL_SB, CLE_SB, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });
}

export function clientService(): SupabaseClient | null {
  if (!URL_SB || !CLE_SERVICE) return null;
  return createClient(URL_SB, CLE_SERVICE, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** L'adresse publique du site, pour les rappels du moteur. */
export function origineSite(): string | null {
  const brute = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!brute) return null;
  return brute.startsWith("http") ? brute.replace(/\/$/, "") : `https://${brute}`;
}

export interface Tache {
  id: string; user_id: string; projet: string; n: number; fichier: string;
  statut: "file" | "en-cours" | "pret" | "echec"; video: string | null; erreur: string | null;
}

/** Copie un clip du moteur dans l'espace public du compte. Rend l'adresse durable, ou null. */
export async function mettreALabri(sb: SupabaseClient, t: Pick<Tache, "user_id" | "projet" | "fichier">, url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const corps = Buffer.from(await r.arrayBuffer());
    const chemin = `${t.user_id}/${t.projet}/${t.fichier}.mp4`;
    const { error } = await sb.storage.from("medias").upload(chemin, corps, { upsert: true, contentType: "video/mp4" });
    if (error) return null;
    return sb.storage.from("medias").getPublicUrl(chemin).data.publicUrl;
  } catch { return null; }
}

/** Traduit un statut ModelArk en statut de tâche. */
export function statutDe(s: string): Tache["statut"] {
  if (s === "succeeded") return "pret";
  if (s === "failed" || s === "cancelled" || s === "expired") return "echec";
  if (s === "running") return "en-cours";
  return "file";
}

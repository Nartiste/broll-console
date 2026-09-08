"use client";

import { supabase } from "./supabase";

/**
 * Les appels du navigateur vers l'API, avec le jeton du compte.
 *
 * Toute route payante exige un compte ; sans jeton, le serveur répond 401 et
 * l'interface le dit tel quel. La lecture de la réponse tolère une page
 * d'erreur HTML (délai dépassé chez Vercel) au lieu de planter sur du JSON.
 */
export const MESSAGE_CONNEXION = "Connectez-vous pour utiliser cette fonction : elle appelle un service payant.";

export async function jeton(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token || null;
}

export async function appelApi(url: string, init: RequestInit = {}): Promise<Response> {
  const j = await jeton();
  const headers = new Headers(init.headers || {});
  if (j) headers.set("Authorization", `Bearer ${j}`);
  return fetch(url, { ...init, headers });
}

/** Le corps JSON, ou un message d'erreur lisible si ce n'en est pas. */
export async function lireJson(r: Response): Promise<any> {
  const texte = await r.text();
  try { return JSON.parse(texte); } catch {
    if (r.status === 504) return { erreur: "Le serveur a mis trop de temps à répondre. Réessayez." };
    if (r.status === 413) return { erreur: "Fichier trop lourd pour être envoyé (4 Mo maximum par requête)." };
    return { erreur: r.ok ? "Réponse illisible." : `Erreur ${r.status}.` };
  }
}

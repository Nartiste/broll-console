"use client";

/**
 * Client Supabase côté navigateur — authentification par lien magique.
 *
 * Absent des variables d'environnement, le client est null et l'application
 * le dit : pas de faux « lien envoyé », pas de bouton qui fait semblant.
 * Les projets restent pour l'instant dans le navigateur ; la session sert à
 * savoir qui est là, la persistance serveur viendra ensuite.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && cle ? createClient(url, cle) : null;
  return client;
}

export const authConfiguree = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

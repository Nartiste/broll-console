import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { COUTS } from "./tarifs";

/**
 * Le garde des routes qui dépensent.
 *
 * Toute route qui appelle un modèle, un moteur d'images ou de vidéo, ou qui
 * fait tourner Chromium, passe par ici : qui appelle (jeton Supabase), a-t-il
 * le droit (liste des testeurs, si elle existe), à quel rythme (par adresse),
 * et combien a-t-il déjà dépensé aujourd'hui (plafond par compte et plafond
 * global). Sans compte, rien de payant ne part — jamais.
 *
 * Les dépenses sont écrites avec le jeton de l'appelant : la table n'accepte
 * que l'insertion et la lecture de ses propres lignes (RLS), jamais la
 * suppression. Personne ne peut baisser son compteur.
 */
export interface Appelant { id: string; email: string; jeton: string }

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLE_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const gardeConfiguree = () => Boolean(URL_SB && CLE_SB);

/** Les plafonds, en dollars par 24 h. */
export const PLAFONDS = {
  compte: Number(process.env.PLAFOND_JOUR_COMPTE) || 15,
  global: Number(process.env.PLAFOND_JOUR_GLOBAL) || 60,
};

/** Les adresses autorisées, si la variable est renseignée. Vide = tout compte. */
const TESTEURS = (process.env.TESTEURS || "").split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);

export const MESSAGE_CONNEXION = "Connectez-vous pour utiliser cette fonction : elle appelle un service payant.";

function client(jeton?: string): SupabaseClient {
  return createClient(URL_SB!, CLE_SB!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: jeton ? { headers: { Authorization: `Bearer ${jeton}` } } : undefined,
  });
}

/** Qui appelle, d'après l'en-tête Authorization. Null sans jeton valide. */
export async function appelant(req: Request): Promise<Appelant | null> {
  if (!gardeConfiguree()) return null;
  const brut = req.headers.get("authorization") || "";
  const jeton = brut.startsWith("Bearer ") ? brut.slice(7).trim() : "";
  if (!jeton) return null;
  const { data, error } = await client().auth.getUser(jeton);
  if (error || !data.user) return null;
  return { id: data.user.id, email: (data.user.email || "").toLowerCase(), jeton };
}

/* ---------------------------------------------------------- débit par adresse */

const SEAUX = new Map<string, { jetons: number; depuis: number }>();
const DEBIT = { parMinute: 30 };

function limiter(req: Request): boolean {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "?").split(",")[0].trim();
  const t = Date.now();
  const s = SEAUX.get(ip) || { jetons: DEBIT.parMinute, depuis: t };
  s.jetons = Math.min(DEBIT.parMinute, s.jetons + ((t - s.depuis) / 60_000) * DEBIT.parMinute);
  s.depuis = t;
  if (s.jetons < 1) { SEAUX.set(ip, s); return false; }
  s.jetons -= 1;
  SEAUX.set(ip, s);
  if (SEAUX.size > 5000) SEAUX.clear();
  return true;
}

/* ------------------------------------------------------------------ exiger */

type Verdict = { ok: true; qui: Appelant } | { ok: false; reponse: Response };

/**
 * Exige un compte. En développement sans Supabase, laisse passer un appelant
 * fictif pour pouvoir travailler ; en production sans Supabase, refuse tout.
 */
export async function exiger(req: Request): Promise<Verdict> {
  if (!limiter(req)) {
    return { ok: false, reponse: NextResponse.json({ erreur: "Trop d'appels d'affilée. Réessayez dans une minute." }, { status: 429 }) };
  }
  if (!gardeConfiguree()) {
    if (process.env.NODE_ENV !== "production") return { ok: true, qui: { id: "dev", email: "dev@local", jeton: "" } };
    return { ok: false, reponse: NextResponse.json({ erreur: "Authentification non configurée sur ce déploiement." }, { status: 503 }) };
  }
  const qui = await appelant(req);
  if (!qui) return { ok: false, reponse: NextResponse.json({ erreur: MESSAGE_CONNEXION }, { status: 401 }) };
  if (TESTEURS.length && !TESTEURS.includes(qui.email)) {
    return { ok: false, reponse: NextResponse.json({ erreur: "Ce compte n'est pas dans le panel de test. Demandez un accès." }, { status: 403 }) };
  }
  return { ok: true, qui };
}

/* ---------------------------------------------------------------- dépenser */

type Poste = keyof typeof COUTS | "production" | "vignettes";

/**
 * Enregistre une dépense estimée, après avoir vérifié les plafonds.
 * Refuse (402) si le compte ou le service a atteint son plafond du jour.
 */
export async function depenser(qui: Appelant, poste: Poste, montant: number, detail = ""): Promise<{ ok: true } | { ok: false; reponse: Response }> {
  if (qui.id === "dev" || !gardeConfiguree()) return { ok: true };
  const sb = client(qui.jeton);
  const depuis = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [mien, global] = await Promise.all([
    sb.from("depenses").select("montant").eq("user_id", qui.id).gt("quand", depuis),
    sb.rpc("depense_globale_jour"),
  ]);
  const dejaMoi = (mien.data || []).reduce((t, l: any) => t + Number(l.montant), 0);
  const dejaTous = Number(global.data ?? 0);
  if (dejaMoi + montant > PLAFONDS.compte) {
    return { ok: false, reponse: NextResponse.json(
      { erreur: `Plafond du jour atteint pour ce compte (${PLAFONDS.compte} $ sur 24 h, ${dejaMoi.toFixed(2)} $ déjà engagés). Réessayez demain, ou demandez à relever le plafond.` },
      { status: 402 }) };
  }
  if (dejaTous + montant > PLAFONDS.global) {
    return { ok: false, reponse: NextResponse.json(
      { erreur: `Plafond global du jour atteint (${PLAFONDS.global} $ sur 24 h). Le service reprend demain.` },
      { status: 402 }) };
  }
  const { error } = await sb.from("depenses").insert({ user_id: qui.id, poste, montant, detail: detail.slice(0, 200) });
  if (error) {
    // Sans table (migration non exécutée), on ne bloque pas le propriétaire, on le dit.
    console.warn("depenses :", error.message);
  }
  return { ok: true };
}

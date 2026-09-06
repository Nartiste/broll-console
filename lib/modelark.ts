/**
 * BytePlus ModelArk — les deux moteurs de génération.
 *
 *   Seedream (images)  : POST /images/generations           — synchrone
 *   Seedance (vidéo)   : POST /contents/generations/tasks   — asynchrone
 *                        GET  /contents/generations/tasks/{id}
 *
 * Une seule clé pour les deux étages du pipeline. Les vignettes de validation
 * sortent de Seedream ; seuls les inserts validés partent en Seedance.
 *
 * L'API vidéo est asynchrone par conception — une tâche, puis un statut. Elle
 * accepte aussi un `callback_url` : sur Vercel, préférer le webhook au polling,
 * une fonction serverless ne survit pas à une génération de plusieurs minutes.
 */

const BASE = process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
const CLE = process.env.ARK_API_KEY;

export const configure = () => Boolean(CLE);

const MODELE_IMAGE = process.env.ARK_MODEL_IMAGE || "dola-seedream-5-0-pro-260628";
const MODELE_VIDEO = process.env.ARK_MODEL_VIDEO || "dreamina-seedance-2-5-260628";

import { TARIFS } from "./tarifs";
export { TARIFS };

export interface Reponse<T> { ok: boolean; data?: T; erreur?: string }

async function appel<T>(chemin: string, init?: RequestInit): Promise<Reponse<T>> {
  if (!CLE) return { ok: false, erreur: "ARK_API_KEY absente. Renseignez-la dans les variables d'environnement." };
  try {
    const r = await fetch(`${BASE}${chemin}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CLE}`,
        ...(init?.headers || {}),
      },
    });
    const corps = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = corps?.error?.message || corps?.message || `HTTP ${r.status}`;
      return { ok: false, erreur: m };
    }
    return { ok: true, data: corps as T };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "Appel réseau impossible" };
  }
}

/* ------------------------------------------------------------------ images */

export interface Vignette { url: string; taille?: string }

/**
 * Une vignette de validation. C'est l'étage bon marché : on en génère trois par
 * insert, parce que choisir est plus rapide et plus juste que juger dans l'absolu.
 */
export async function genererImage(prompt: string, opts?: { taille?: string; reference?: string }) {
  return appel<{ data: Vignette[]; usage?: unknown }>("/images/generations", {
    method: "POST",
    body: JSON.stringify({
      model: MODELE_IMAGE,
      prompt,
      ...(opts?.reference ? { image: opts.reference } : {}),
      size: opts?.taille || "2K",
      response_format: "url",
      output_format: "jpeg",
      watermark: false,
    }),
  });
}

/* ------------------------------------------------------------------- vidéo */

export type StatutTache = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Tache {
  id: string;
  status: StatutTache;
  content?: { video_url?: string };
  error?: { message?: string };
}

/**
 * Lance un clip. L'image validée sert d'entrée `reference_image` : le clip
 * ressemble à la vignette approuvée, on ne juge plus une promesse.
 */
export async function lancerClip(params: {
  prompt: string;
  image?: string;
  duree: number;
  resolution?: string;
  ratio?: string;
  callback?: string;
}) {
  const content: unknown[] = [{ type: "text", text: params.prompt }];
  if (params.image) {
    content.push({ type: "image_url", image_url: { url: params.image }, role: "reference_image" });
  }
  return appel<{ id: string }>("/contents/generations/tasks", {
    method: "POST",
    body: JSON.stringify({
      model: MODELE_VIDEO,
      content,
      duration: Math.max(4, Math.min(15, Math.round(params.duree))),
      resolution: params.resolution || "1080p",
      ratio: params.ratio || "16:9",
      generate_audio: false,   // le son du montage vient de la voix, pas du clip
      watermark: false,
      ...(params.callback ? { callback_url: params.callback } : {}),
    }),
  });
}

export const etatClip = (id: string) =>
  appel<Tache>(`/contents/generations/tasks/${encodeURIComponent(id)}`);

/** Coût estimé d'un lot, avant de le lancer. */
export function estimer(clips: { duree: number }[], vignettes: number, resolution = "1080p") {
  const parSeconde = TARIFS.video[resolution] ?? TARIFS.video["1080p"];
  const secondes = clips.reduce((t, c) => t + c.duree, 0);
  return {
    secondes: Math.round(secondes),
    video: secondes * parSeconde,
    images: vignettes * TARIFS.image,
    total: secondes * parSeconde + vignettes * TARIFS.image,
    parSeconde,
  };
}

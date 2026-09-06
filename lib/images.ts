/**
 * Le fournisseur d'images est interchangeable.
 *
 * La vignette n'est pas un aperçu jetable : elle sert d'entrée `image-to-video`,
 * donc elle détermine à quoi ressemble le clip final. La qualité du modèle
 * d'images compte autant que celle du modèle vidéo — d'où cette couche, pour
 * pouvoir en changer, ou les comparer, sans toucher au reste.
 *
 * Contrainte qui gouverne le retour : le moteur vidéo lit l'image de référence
 * par URL publique. Gemini et OpenAI renvoient du base64 — il faut donc déposer
 * ces images quelque part avant de les passer en référence (Supabase Storage).
 * D'où `Image = { url } | { b64 }` et l'étape `publier()` en aval.
 */

export type Image = { url?: string; b64?: string; mime?: string };
export type Resultat = { ok: true; images: Image[] } | { ok: false; erreur: string };

export interface Fournisseur {
  id: string;
  nom: string;
  /** Renvoie une URL directement exploitable comme référence vidéo, ou du base64
   *  qu'il faudra publier avant de s'en servir. */
  rendUneUrl: boolean;
  configure(): boolean;
  generer(prompt: string, opts?: { taille?: string; reference?: string }): Promise<Resultat>;
}

const echec = (e: unknown): Resultat => ({
  ok: false,
  erreur: e instanceof Error ? e.message : "Appel impossible",
});

/* ---------------------------------------------------- Seedream — ModelArk */
/* Même clé et même facture que Seedance : un seul fournisseur pour les deux
   étages du pipeline. Renvoie une URL, donc utilisable en référence sans dépôt. */

const seedream: Fournisseur = {
  id: "seedream",
  nom: "Seedream (BytePlus ModelArk)",
  rendUneUrl: true,
  configure: () => Boolean(process.env.ARK_API_KEY),
  async generer(prompt, opts) {
    try {
      const base = process.env.ARK_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
      const r = await fetch(`${base}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ARK_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.ARK_MODEL_IMAGE || "dola-seedream-5-0-pro-260628",
          prompt,
          ...(opts?.reference ? { image: opts.reference } : {}),
          size: opts?.taille || "2K",
          response_format: "url",
          output_format: "jpeg",
          watermark: false,
        }),
      });
      const c = await r.json();
      if (!r.ok) return { ok: false, erreur: c?.error?.message || `HTTP ${r.status}` };
      return { ok: true, images: (c.data || []).map((d: any) => ({ url: d.url })) };
    } catch (e) { return echec(e); }
  },
};

/* ------------------------------------------------------- Gemini — Google */
/* POST /v1beta/models/{modele}:generateContent, clé en en-tête x-goog-api-key,
   `responseModalities: ["IMAGE"]`. Renvoie du base64 : dépôt requis. */

const gemini: Fournisseur = {
  id: "gemini",
  nom: "Gemini (Google)",
  rendUneUrl: false,
  configure: () => Boolean(process.env.GEMINI_API_KEY),
  async generer(prompt, opts) {
    try {
      const modele = process.env.GEMINI_MODEL_IMAGE || "gemini-2.5-flash-image";
      const parts: unknown[] = [{ text: prompt }];
      if (opts?.reference) {
        parts.unshift({ inline_data: { mime_type: "image/jpeg", data: opts.reference } });
      }
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY as string,
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseModalities: ["IMAGE"] },
          }),
        },
      );
      const c = await r.json();
      if (!r.ok) return { ok: false, erreur: c?.error?.message || `HTTP ${r.status}` };
      const images: Image[] = (c.candidates?.[0]?.content?.parts || [])
        .filter((p: any) => p.inlineData || p.inline_data)
        .map((p: any) => {
          const d = p.inlineData || p.inline_data;
          return { b64: d.data, mime: d.mimeType || d.mime_type || "image/png" };
        });
      return images.length
        ? { ok: true, images }
        : { ok: false, erreur: "Aucune image dans la réponse Gemini." };
    } catch (e) { return echec(e); }
  },
};

/* ------------------------------------------------------- OpenAI — images */
/* POST /v1/images/generations. gpt-image-1 renvoie du base64 : dépôt requis. */

const openai: Fournisseur = {
  id: "openai",
  nom: "OpenAI",
  rendUneUrl: false,
  configure: () => Boolean(process.env.OPENAI_API_KEY),
  async generer(prompt, opts) {
    try {
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL_IMAGE || "gpt-image-1",
          prompt,
          size: opts?.taille || "1536x1024",
          n: 1,
        }),
      });
      const c = await r.json();
      if (!r.ok) return { ok: false, erreur: c?.error?.message || `HTTP ${r.status}` };
      const images: Image[] = (c.data || []).map((d: any) =>
        d.b64_json ? { b64: d.b64_json, mime: "image/png" } : { url: d.url });
      return { ok: true, images };
    } catch (e) { return echec(e); }
  },
};

/* -------------------------------------------------------- Higgsfield */
/* Base https://api.higgsfield.ai, en-tête `Authorization: Key <id>:<secret>`
   (pas un Bearer). Génération ASYNCHRONE : la soumission renvoie un
   `request_id` et un `status_url` qu'il faut interroger — donc un tour de file
   d'attente de plus que les trois autres.
   Le chemin exact de la tâche texte-vers-image dépend du compte : il se règle
   par HIGGSFIELD_PATH_IMAGE plutôt que d'être deviné ici. */

const higgsfield: Fournisseur = {
  id: "higgsfield",
  nom: "Higgsfield",
  rendUneUrl: true,
  configure: () =>
    Boolean(process.env.HIGGSFIELD_KEY_ID && process.env.HIGGSFIELD_KEY_SECRET
            && process.env.HIGGSFIELD_PATH_IMAGE),
  async generer(prompt, opts) {
    try {
      const base = process.env.HIGGSFIELD_BASE_URL || "https://api.higgsfield.ai";
      const r = await fetch(`${base}${process.env.HIGGSFIELD_PATH_IMAGE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${process.env.HIGGSFIELD_KEY_ID}:${process.env.HIGGSFIELD_KEY_SECRET}`,
        },
        body: JSON.stringify({
          task: "text-to-image",
          prompt,
          ...(opts?.reference ? { image_url: opts.reference } : {}),
        }),
      });
      const c = await r.json();
      if (!r.ok) return { ok: false, erreur: c?.message || `HTTP ${r.status}` };
      // Réponse asynchrone : on remonte le status_url, la file le suivra.
      return c.status_url
        ? { ok: false, erreur: `asynchrone:${c.status_url}` }
        : { ok: true, images: [{ url: c.url || c.output?.[0]?.url }] };
    } catch (e) { return echec(e); }
  },
};

/* ------------------------------------------------------------------------ */

export const FOURNISSEURS: Fournisseur[] = [seedream, gemini, openai, higgsfield];

export const fournisseur = (id?: string): Fournisseur => {
  const choisi = FOURNISSEURS.find(f => f.id === (id || process.env.IMAGE_PROVIDER));
  if (choisi) return choisi;
  // À défaut, le premier qui est réellement configuré.
  return FOURNISSEURS.find(f => f.configure()) || seedream;
};

export const disponibles = () =>
  FOURNISSEURS.map(f => ({ id: f.id, nom: f.nom, configure: f.configure(), rendUneUrl: f.rendUneUrl }));

/**
 * Trois prompts pour un même insert, dans le registre visuel du projet.
 * Choisir est plus rapide et plus juste que juger dans l'absolu — et l'étage
 * image est l'étage bon marché, c'est là qu'il faut être généreux.
 */
export function troisPrompts(passage: string, registre: string): string[] {
  const sujet = passage.split("\n")[0].replace(/[.?!]$/, "").toLowerCase();
  return [
    `${registre}. Plan large : ${sujet}. Composition centrée, profondeur, aucun texte à l'image.`,
    `${registre}. Plan serré : ${sujet}. Faible profondeur de champ, cadrage décentré, aucun texte à l'image.`,
    `${registre}. Traitement abstrait : ${sujet}. Aucune figure lisible, texture et mouvement seuls, aucun texte à l'image.`,
  ];
}

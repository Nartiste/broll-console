"use client";

import { supabase } from "./supabase";
import { appelApi, lireJson } from "./api-client";

/**
 * Les fichiers rendus d'un gabarit — le .mov à fond transparent, l'image
 * fixe, et le zip complet avec les sources.
 *
 * Un rendu coûte jusqu'à trois minutes de serveur : on ne le refait jamais
 * pour rien. Chaque fichier obtenu est gardé ici, en mémoire, le temps de
 * l'onglet ; et, quand un compte est ouvert, déposé dans le stockage du
 * compte (rendus/<utilisateur>/<projet>/<fichier>), d'où il revient sur
 * n'importe quel appareil.
 */
export interface FichiersRendu { mov: Blob; png?: Blob; apercu?: Blob; zip: Blob; empreinte: string }

const CACHE = new Map<string, FichiersRendu>();
export const cle = (projetId: string, fichier: string) => `${projetId}/${fichier}`;
/** Le rendu en mémoire, s'il correspond encore au HTML courant. */
export const enCache = (k: string, empreinteAttendue: string) => {
  const f = CACHE.get(k);
  return f && f.empreinte === empreinteAttendue ? f : undefined;
};

/** Une empreinte courte du HTML : deux gabarits différents, deux rendus différents. */
export function empreinte(html: string): string {
  let h = 5381;
  for (let i = 0; i < html.length; i++) h = ((h << 5) + h + html.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + html.length.toString(36);
}

/** Fait rendre le gabarit par le serveur et en tire les fichiers utiles. */
export async function rendre(projetId: string, a: { html: string; fichier: string; duree: number }): Promise<FichiersRendu> {
  const r = await appelApi("/api/rendu", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: a.html, nom: a.fichier, fps: 24, duree: a.duree }),
  });
  if (!r.ok) throw new Error((await lireJson(r)).erreur || `Rendu refusé (${r.status})`);
  const zip = await r.blob();
  const JSZip = (await import("jszip")).default;
  const z = await JSZip.loadAsync(zip);
  // La version à poser sur le plan : sans le fond du gabarit quand il en a un.
  const alpha = Boolean(z.file(`${a.fichier}_alpha.mov`));
  const mov = await z.file(alpha ? `${a.fichier}_alpha.mov` : `${a.fichier}.mov`)?.async("blob");
  if (!mov) throw new Error("Le rendu ne contient pas de vidéo");
  const png = await z.file(alpha ? `${a.fichier}_alpha.png` : `${a.fichier}.png`)?.async("blob");
  const apercuBrut = await z.file(alpha ? `${a.fichier}_alpha_apercu.mp4` : `${a.fichier}_apercu.mp4`)?.async("blob");
  const apercu = apercuBrut ? apercuBrut.slice(0, apercuBrut.size, "video/mp4") : undefined;
  const f: FichiersRendu = { mov: mov.slice(0, mov.size, "video/quicktime"), png, apercu, zip, empreinte: empreinte(a.html) };
  CACHE.set(cle(projetId, a.fichier), f);
  return f;
}

/** Dépose le .mov et l'image fixe sur le compte. Null sans compte (ou sans espace de stockage). */
export async function deposer(projetId: string, fichier: string, f: FichiersRendu): Promise<{ mov: string; png?: string; apercu?: string } | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return null;
  const base = `${uid}/${projetId}/${fichier}`;
  const m = await sb.storage.from("rendus").upload(`${base}.mov`, f.mov, { upsert: true, contentType: "video/quicktime" });
  if (m.error) return null;
  let png: string | undefined;
  if (f.png) {
    const p = await sb.storage.from("rendus").upload(`${base}.png`, f.png, { upsert: true, contentType: "image/png" });
    if (!p.error) png = `${base}.png`;
  }
  // L'aperçu va dans l'espace public : c'est une adresse que la balise vidéo lit directement.
  let apercu: string | undefined;
  if (f.apercu) {
    const a = await sb.storage.from("medias").upload(`${base}-apercu.mp4`, f.apercu, { upsert: true, contentType: "video/mp4" });
    if (!a.error) apercu = sb.storage.from("medias").getPublicUrl(`${base}-apercu.mp4`).data.publicUrl;
  }
  return { mov: `${base}.mov`, png, apercu };
}

/** Un fichier déposé sur le compte, rapatrié. Null s'il n'y est pas (ou plus). */
export async function recuperer(chemin: string): Promise<Blob | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.storage.from("rendus").download(chemin);
  return error ? null : data;
}

/** Déclenche l'enregistrement d'un fichier par le navigateur. */
export function telecharger(blob: Blob, nom: string) {
  const u = URL.createObjectURL(blob);
  const l = document.createElement("a");
  l.href = u; l.download = nom; l.click();
  setTimeout(() => URL.revokeObjectURL(u), 10_000);
}

"use client";

import { supabase } from "./supabase";
import { appelApi } from "./api-client";

/**
 * Les médias d'un projet — vignettes et clips — mis à l'abri sur le compte.
 *
 * Les moteurs rendent des URL signées qui expirent en un jour, ou du base64
 * qui sature le stockage du navigateur. Dès qu'un compte est ouvert, chaque
 * image validée et chaque clip terminé sont recopiés dans l'espace du compte
 * (medias/<utilisateur>/<projet>/…), à une adresse publique et durable — celle
 * que la planche affiche, et celle que le moteur vidéo reçoit en référence.
 * Sans compte, on garde la source telle quelle.
 */

const HOTES_RELAYES = [/\.volces\.com$/, /\.bytepluses\.com$/, /\.byteplusapi\.com$/];

export const estDurable = (url: string | null | undefined) => Boolean(url && /\.supabase\.co\/storage\/v1\/object\/public\//.test(url));

/** Le contenu binaire d'une source : data-URI, adresse relayée, ou adresse directe. */
export async function blobDepuis(source: string): Promise<Blob | null> {
  try {
    if (source.startsWith("data:")) return await (await fetch(source)).blob();
    const hote = new URL(source).hostname;
    if (HOTES_RELAYES.some(h => h.test(hote))) {
      const r = await appelApi(`/api/production/fichier?url=${encodeURIComponent(source)}&nom=media`);
      return r.ok ? await r.blob() : null;
    }
    const r = await fetch(source);
    return r.ok ? await r.blob() : null;
  } catch { return null; }
}

/** Dépose un blob sur le compte et rend son adresse publique. Null sans compte ou en cas d'échec. */
export async function deposerMedia(projetId: string, nom: string, blob: Blob, contentType: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return null;
  const chemin = `${uid}/${projetId}/${nom}`;
  const { error } = await sb.storage.from("medias").upload(chemin, blob, { upsert: true, contentType });
  if (error) return null;
  return sb.storage.from("medias").getPublicUrl(chemin).data.publicUrl;
}

/**
 * Rend une adresse durable pour une source : la copie sur le compte si c'est
 * possible, sinon la source elle-même. Une source déjà durable est rendue telle quelle.
 */
export async function ancrer(projetId: string, nom: string, source: string, contentType: string): Promise<string> {
  if (estDurable(source)) return source;
  const blob = await blobDepuis(source);
  if (!blob) return source;
  return (await deposerMedia(projetId, nom, blob, contentType)) || source;
}

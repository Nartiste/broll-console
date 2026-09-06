import { NextResponse } from "next/server";
import { fournisseur } from "@/lib/images";

export const maxDuration = 300;

/**
 * Génère les vignettes d'un insert — l'étage bon marché, celui qu'on valide
 * AVANT de lancer la moindre vidéo.
 *
 * Deux usages, deux exigences :
 *   afficher la vignette dans la planche → une data URI suffit ;
 *   la passer en référence au moteur vidéo → il faut une URL publique.
 * D'où `reference`, qui vaut null quand l'image n'est pas encore déposée :
 * Gemini et OpenAI rendent du base64, utilisable pour décider tout de suite,
 * pas pour générer le clip tant que le dépôt de fichiers n'existe pas.
 */
export async function POST(req: Request) {
  const { prompts, provider, taille } = await req.json().catch(() => ({}));
  if (!Array.isArray(prompts) || !prompts.length) {
    return NextResponse.json({ erreur: "Aucun prompt fourni." }, { status: 400 });
  }
  const f = fournisseur(provider);
  if (!f.configure()) {
    return NextResponse.json(
      { erreur: `Fournisseur « ${f.nom} » non configuré. Attendu : ${f.variables.join(", ")}.` },
      { status: 400 });
  }

  const resultats = await Promise.all(
    prompts.slice(0, 6).map((p: string) => f.generer(p, { taille })));

  return NextResponse.json({
    fournisseur: f.id,
    depotRequis: !f.rendUneUrl,
    vignettes: resultats.map(r => r.ok
      ? {
          ok: true,
          images: r.images.map(im => ({
            // Affichable immédiatement, quelle que soit la forme du retour.
            affichage: im.url || `data:${im.mime || "image/png"};base64,${im.b64}`,
            // Exploitable comme référence vidéo seulement si c'est une vraie URL.
            reference: im.url || null,
          })),
        }
      : { ok: false, erreur: r.erreur }),
  });
}

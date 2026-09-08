import { NextResponse } from "next/server";
import { fournisseur } from "@/lib/images";
import { depenser, exiger } from "@/lib/garde";
import { TARIFS } from "@/lib/tarifs";

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
  const g = await exiger(req);
  if (!g.ok) return g.reponse;
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

  const lot = prompts.slice(0, 6).filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0);
  if (!lot.length) return NextResponse.json({ erreur: "Aucun prompt valide." }, { status: 400 });
  const d = await depenser(g.qui, "vignettes", lot.length * TARIFS.image, `${lot.length} images · ${f.id}`);
  if (!d.ok) return d.reponse;

  const resultats = await Promise.all(lot.map((p: string) => f.generer(p, { taille })));

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

import { NextResponse } from "next/server";
import { fournisseur } from "@/lib/images";

export const maxDuration = 300;

/**
 * Génère les vignettes d'un insert — l'étage bon marché, celui qu'on valide
 * AVANT de lancer la moindre vidéo.
 */
export async function POST(req: Request) {
  const { prompts, provider, taille } = await req.json().catch(() => ({}));
  if (!Array.isArray(prompts) || !prompts.length) {
    return NextResponse.json({ erreur: "Aucun prompt fourni." }, { status: 400 });
  }
  const f = fournisseur(provider);
  if (!f.configure()) {
    return NextResponse.json(
      { erreur: `Fournisseur « ${f.nom} » non configuré.` }, { status: 400 });
  }

  const resultats = await Promise.all(
    prompts.slice(0, 6).map((p: string) => f.generer(p, { taille })));

  return NextResponse.json({
    fournisseur: f.id,
    // Un fournisseur qui renvoie du base64 exige un dépôt avant de servir de
    // référence au moteur vidéo, qui lit l'image par URL publique.
    depotRequis: !f.rendUneUrl,
    vignettes: resultats.map(r => (r.ok ? { ok: true, images: r.images } : { ok: false, erreur: r.erreur })),
  });
}

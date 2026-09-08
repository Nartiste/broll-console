import { NextResponse } from "next/server";
import { configure, lancerClip } from "@/lib/modelark";
import { depenser, exiger } from "@/lib/garde";
import { TARIFS } from "@/lib/tarifs";

export const maxDuration = 120;

/**
 * Lance les clips des inserts VALIDÉS. C'est la seule route qui dépense pour
 * de bon : elle n'est appelée qu'après le tri, sur un clic confirmé, avec le
 * nombre de clips et l'ordre de grandeur du coût affichés avant.
 *
 * ModelArk est asynchrone : on soumet, on reçoit un identifiant de tâche, on
 * interroge ensuite. Les clips partent l'un après l'autre pour rester sous
 * les limites de débit ; la réponse dit, pour chacun, s'il est en file ou
 * pourquoi il a été refusé.
 */
export async function POST(req: Request) {
  const g = await exiger(req);
  if (!g.ok) return g.reponse;
  if (!configure()) return NextResponse.json({ erreur: "ARK_API_KEY absente : aucun clip ne peut partir." }, { status: 400 });
  const { articles, resolution } = await req.json().catch(() => ({}));
  if (!Array.isArray(articles) || !articles.length) {
    return NextResponse.json({ erreur: "Aucun clip à lancer." }, { status: 400 });
  }
  const res = typeof resolution === "string" && TARIFS.video[resolution] ? resolution : (process.env.ARK_VIDEO_RESOLUTION || "720p");
  const lot = articles.slice(0, 40);
  const secondes = lot.reduce((t: number, a: any) => t + Math.max(4, Math.min(15, Math.round(Number(a?.duree) || 4))), 0);
  const d = await depenser(g.qui, "production", secondes * TARIFS.video[res], `${lot.length} clips · ${secondes} s · ${res}`);
  if (!d.ok) return d.reponse;
  const resultats: { n: number; tache?: string; erreur?: string }[] = [];
  for (const a of lot) {
    if (typeof a?.prompt !== "string" || !a.prompt.trim()) { resultats.push({ n: a?.n, erreur: "Prompt vide." }); continue; }
    // L'image de référence fixe l'apparence ; le prompt vidéo doit dire ce qui
    // SE PASSE. Sans action décrite, le modèle rend un zoom sur une image fixe.
    const mouvement = typeof a.mouvement === "string" && a.mouvement.trim()
      ? a.mouvement.trim()
      : "Le sujet accomplit un geste visible et continu ; les éléments du décor vivent.";
    const r = await lancerClip({
      prompt: `${a.prompt} ANIMATION, pendant toute la durée : ${mouvement} Le sujet agit vraiment — mouvement du corps, des mains, du regard — et le décor réagit ; le mouvement de caméra reste secondaire et léger. Aucun texte à l'image.`,
      image: typeof a.image === "string" && /^https?:\/\//.test(a.image) ? a.image : undefined,
      duree: Number(a.duree) || 5,
      resolution: res,
    });
    resultats.push(r.ok ? { n: a.n, tache: r.data!.id } : { n: a.n, erreur: r.erreur });
  }
  return NextResponse.json({ resolution: res, resultats });
}

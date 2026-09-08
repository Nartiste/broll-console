import { NextResponse } from "next/server";
import { configure, extraireGabarit, type Reference } from "@/lib/anthropic";
import { nouvelId, type FormeMotion } from "@/lib/gabarits";
import { depenser, exiger } from "@/lib/garde";
import { COUTS } from "@/lib/tarifs";

export const maxDuration = 120;

/**
 * Un gabarit sur mesure : la capture d'un composant entre, sa structure en
 * HTML/CSS sort — avec les slots de la forme demandée, prête à recevoir le
 * contenu de n'importe quel insert.
 */
export async function POST(req: Request) {
  const g = await exiger(req);
  if (!g.ok) return g.reponse;
  if (!configure()) {
    return NextResponse.json({ erreur: "ANTHROPIC_API_KEY absente : l'extraction passe par le modèle." }, { status: 400 });
  }
  const form = await req.formData().catch(() => null);
  const fichiers = (form?.getAll("fichiers") || []).filter((f): f is File => f instanceof File);
  const consigne = String(form?.get("consigne") || "").trim();
  const forme = (String(form?.get("forme") || "") || undefined) as FormeMotion | undefined;
  let actuel: any, charte: any;
  try { const a = form?.get("actuel"); if (typeof a === "string" && a) actuel = JSON.parse(a); } catch { /* ignoré */ }
  try { const c = form?.get("charte"); if (typeof c === "string" && c) charte = JSON.parse(c); } catch { /* ignoré */ }

  if (!fichiers.length && !(consigne && actuel)) {
    return NextResponse.json({ erreur: "Il faut une capture du composant, ou une consigne sur un gabarit existant." }, { status: 400 });
  }

  const d = await depenser(g.qui, "gabarit", COUTS.gabarit, consigne || fichiers[0]?.name || "");
  if (!d.ok) return d.reponse;

  const refs: Reference[] = [];
  for (const f of fichiers.slice(0, 4)) {
    if (f.size > 12_000_000) continue;
    const bas = f.name.toLowerCase();
    const buf = Buffer.from(await f.arrayBuffer());
    if (/\.(png|jpe?g|webp|gif)$/.test(bas)) {
      const mime = bas.endsWith(".png") ? "image/png" : bas.endsWith(".webp") ? "image/webp" : bas.endsWith(".gif") ? "image/gif" : "image/jpeg";
      refs.push({ nom: f.name, type: "image", donnees: buf.toString("base64"), mime });
    } else {
      refs.push({ nom: f.name, type: "texte", donnees: buf.toString("utf-8") });
    }
  }

  try {
    const g = await extraireGabarit(refs, { forme, consigne, actuel, charte });
    return NextResponse.json({
      gabarit: { ...g, id: actuel?.id || nouvelId(), source: fichiers[0]?.name || actuel?.source, cree: actuel?.cree || Date.now() },
    });
  } catch (e) {
    return NextResponse.json({ erreur: `Extraction impossible : ${e instanceof Error ? e.message : "erreur"}` }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { configure, extraireCharte, type Reference } from "@/lib/anthropic";
import { depenser, exiger } from "@/lib/garde";
import { COUTS } from "@/lib/tarifs";

export const maxDuration = 120;

/**
 * Extrait une charte depuis des références : moodboard d'images, document de
 * charte en PDF ou Word, notes en texte. C'est le vrai point d'entrée du
 * produit — la charte n'est pas saisie, elle est déduite de la matière.
 */
export async function POST(req: Request) {
  const g = await exiger(req);
  if (!g.ok) return g.reponse;
  if (!configure()) {
    return NextResponse.json({ erreur: "ANTHROPIC_API_KEY absente : l'extraction de charte passe par le modèle." }, { status: 400 });
  }
  const form = await req.formData().catch(() => null);
  const fichiers = (form?.getAll("fichiers") || []).filter((f): f is File => f instanceof File);
  const consigne = String(form?.get("consigne") || "").trim();
  let actuelle: any = undefined;
  try { const a = form?.get("actuelle"); if (typeof a === "string" && a) actuelle = JSON.parse(a); } catch { /* ignorée */ }
  if (!fichiers.length && !consigne) {
    return NextResponse.json({ erreur: "Aucune référence ni consigne reçue." }, { status: 400 });
  }

  const d = await depenser(g.qui, "charte", COUTS.charte, consigne || fichiers.map(f => f.name).join(", "));
  if (!d.ok) return d.reponse;

  const refs: Reference[] = [];
  for (const f of fichiers.slice(0, 12)) {
    if (f.size > 15_000_000) continue;
    const nom = f.name;
    const bas = nom.toLowerCase();
    const buf = Buffer.from(await f.arrayBuffer());
    if (/\.(png|jpe?g|webp|gif)$/.test(bas)) {
      const mime = bas.endsWith(".png") ? "image/png" : bas.endsWith(".webp") ? "image/webp"
                 : bas.endsWith(".gif") ? "image/gif" : "image/jpeg";
      refs.push({ nom, type: "image", donnees: buf.toString("base64"), mime });
    } else if (bas.endsWith(".pdf")) {
      refs.push({ nom, type: "pdf", donnees: buf.toString("base64") });
    } else if (bas.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      refs.push({ nom, type: "texte", donnees: (await mammoth.extractRawText({ buffer: buf })).value });
    } else {
      refs.push({ nom, type: "texte", donnees: buf.toString("utf-8") });
    }
  }
  if (!refs.length && !consigne) {
    return NextResponse.json({ erreur: "Aucune référence exploitable (images, PDF, Word ou texte)." }, { status: 422 });
  }

  try {
    const charte = await extraireCharte(refs, { consigne, actuelle });
    return NextResponse.json({ charte, references: refs.map(r => r.nom) });
  } catch (e) {
    return NextResponse.json({ erreur: `Extraction impossible : ${e instanceof Error ? e.message : "erreur"}` }, { status: 502 });
  }
}

import { NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * Extraction du texte d'un script déposé.
 *
 * Un script s'écrit dans un traitement de texte et s'exporte en PDF — c'est
 * la forme naturelle, pas le fichier .txt. L'extraction se fait ici plutôt que
 * dans le navigateur : les bibliothèques pèsent lourd, et le format prompteur
 * ne survit qu'à une lecture ligne par ligne soignée.
 */

/** Le format prompteur tient dans le retour à la ligne : une idée par ligne,
 *  un blanc entre les blocs de souffle. Toute la suite du pipeline en dépend,
 *  donc on reconstruit ces sauts à partir de la géométrie de la page. */
function texteDuPdf(pages: { items: { str: string; transform: number[] }[] }[]) {
  const lignes: string[] = [];
  for (const page of pages) {
    let yCourant: number | null = null;
    let ligne = "";
    for (const item of page.items) {
      const y = Math.round(item.transform[5]);
      if (yCourant === null || Math.abs(y - yCourant) < 3) {
        ligne += item.str;
      } else {
        // Un saut vertical franc marque un blanc entre deux blocs.
        const saut = yCourant - y;
        lignes.push(ligne.trim());
        if (saut > 22) lignes.push("");
        ligne = item.str;
      }
      yCourant = y;
    }
    if (ligne.trim()) lignes.push(ligne.trim());
    lignes.push("");
  }
  return lignes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const fichier = form?.get("fichier");
  if (!(fichier instanceof File)) {
    return NextResponse.json({ erreur: "Aucun fichier reçu." }, { status: 400 });
  }
  if (fichier.size > 12_000_000) {
    return NextResponse.json({ erreur: "Fichier trop lourd (12 Mo maximum)." }, { status: 400 });
  }

  const nom = fichier.name.toLowerCase();
  const donnees = Buffer.from(await fichier.arrayBuffer());

  try {
    let texte = "";

    if (nom.endsWith(".pdf")) {
      // unpdf embarque pdf.js sans worker : c'est ce qui le rend utilisable
      // dans une fonction serverless, où aucun worker ne peut être lancé.
      const { getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(new Uint8Array(donnees));
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const contenu = await page.getTextContent();
        pages.push({ items: contenu.items as any });
      }
      texte = texteDuPdf(pages as any);
    } else if (nom.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer: donnees });
      texte = r.value;
    } else {
      texte = donnees.toString("utf-8");
    }

    texte = texte.replace(/\r\n?/g, "\n").trim();
    if (texte.length < 80) {
      return NextResponse.json(
        { erreur: "Aucun texte exploitable dans ce fichier. S'il s'agit d'un PDF scanné, il ne contient que des images." },
        { status: 422 });
    }

    // Le format prompteur se reconnaît : des lignes courtes, des crochets.
    const lignes = texte.split("\n").filter(l => l.trim());
    const directives = (texte.match(/\[[^\]]+\]/g) || []).length;
    const motsParLigne = lignes.length
      ? (texte.match(/[\wÀ-ÿ'’]+/g) || []).length / lignes.length : 0;

    return NextResponse.json({
      texte,
      source: nom.split(".").pop(),
      prompteur: directives >= 3 || motsParLigne < 9,
      directives,
      avertissement: directives === 0
        ? "Aucune directive entre crochets trouvée : l'analyse aura moins de prise sur le rythme et l'arc du script."
        : null,
    });
  } catch (e) {
    return NextResponse.json(
      { erreur: `Lecture impossible : ${e instanceof Error ? e.message : "format non reconnu"}` },
      { status: 422 });
  }
}

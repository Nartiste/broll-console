import { NextResponse } from "next/server";
import { analyser, CADRAGE_DEFAUT, type Cadrage } from "@/lib/analyse";
import { analyserAvecClaude, configure } from "@/lib/anthropic";

export const maxDuration = 300;

/**
 * Analyse un script. Le palier modèle si la clé est là, le palier déterministe
 * sinon — l'application reste utilisable sans aucune clé, elle juge juste moins bien.
 */
export async function POST(req: Request) {
  const { script, cadrage, registre, titre } = await req.json().catch(() => ({}));
  if (typeof script !== "string" || script.trim().length < 80) {
    return NextResponse.json({ erreur: "Script absent ou trop court." }, { status: 400 });
  }

  const c: Cadrage = { ...CADRAGE_DEFAUT, ...(cadrage || {}) };
  const r = registre || "photographie documentaire sobre, lumière naturelle";

  if (!configure()) {
    return NextResponse.json({
      palier: "deterministe",
      avertissement: "ANTHROPIC_API_KEY absente : analyse déterministe, libellés approximatifs.",
      plan: analyser(script, c, r, titre || "Sans titre"),
    });
  }

  try {
    return NextResponse.json({
      palier: "modele",
      plan: await analyserAvecClaude(script, c, r, titre || "Sans titre"),
    });
  } catch (e) {
    // Le déterministe est le filet : on ne laisse jamais l'utilisateur sans plan.
    return NextResponse.json({
      palier: "deterministe",
      avertissement: `Analyse par modèle indisponible (${e instanceof Error ? e.message : "erreur"}). Repli sur le palier déterministe.`,
      plan: analyser(script, c, r, titre || "Sans titre"),
    });
  }
}

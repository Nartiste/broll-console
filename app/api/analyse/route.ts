import { NextResponse } from "next/server";
import { CADRAGE_DEFAUT, choixDeterministes, composer, type Cadrage } from "@/lib/analyse";
import { analyserAvecClaude, configure, type Effort } from "@/lib/anthropic";

export const maxDuration = 300;

/**
 * Analyse un script et renvoie les CHOIX — le jugement — en plus du plan.
 *
 * Le client garde les choix et recompose lui-même le plan à chaque réglage
 * du cadrage : les curseurs restent instantanés, et le modèle n'est rappelé
 * que si on le lui demande. Le palier déterministe est le filet.
 */
export async function POST(req: Request) {
  const { script, cadrage, registre, titre, effort } = await req.json().catch(() => ({}));
  const niveau: Effort | undefined = ["low", "medium", "high"].includes(effort) ? effort : undefined;
  const debut = Date.now();
  if (typeof script !== "string" || script.trim().length < 80) {
    return NextResponse.json({ erreur: "Script absent ou trop court." }, { status: 400 });
  }
  const c: Cadrage = { ...CADRAGE_DEFAUT, ...(cadrage || {}) };
  const r = registre || "photographie documentaire sobre, lumière naturelle";
  const t = titre || "Sans titre";

  const repli = (avertissement: string) => {
    const choix = choixDeterministes(script, r);
    return NextResponse.json({ palier: "deterministe", avertissement, titre: t, choix,
                               plan: composer(script, c, choix, t) });
  };

  if (!configure()) return repli("ANTHROPIC_API_KEY absente : analyse déterministe, libellés approximatifs.");

  try {
    const { choix, titre: titreModele } = await analyserAvecClaude(script, r, t, c.partBroll, niveau);
    return NextResponse.json({ palier: "modele", titre: titreModele, choix,
                               duree_ms: Date.now() - debut, effort: niveau || process.env.ANALYSE_EFFORT || "medium",
                               plan: composer(script, c, choix, titreModele) });
  } catch (e) {
    return repli(`Analyse par modèle indisponible (${e instanceof Error ? e.message : "erreur"}). Repli sur le palier déterministe.`);
  }
}

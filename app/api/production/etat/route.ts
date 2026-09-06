import { NextResponse } from "next/server";
import { configure, etatClip } from "@/lib/modelark";

export const dynamic = "force-dynamic";

/** L'état de plusieurs tâches d'un coup — la planche interroge toutes les dix secondes. */
export async function GET(req: Request) {
  if (!configure()) return NextResponse.json({ erreur: "ARK_API_KEY absente." }, { status: 400 });
  const ids = (new URL(req.url).searchParams.get("ids") || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 60);
  const etats = await Promise.all(ids.map(async id => {
    const r = await etatClip(id);
    if (!r.ok) return { id, statut: "inconnu", erreur: r.erreur };
    const t = r.data!;
    return { id, statut: t.status, video: t.content?.video_url || null, erreur: t.error?.message || null };
  }));
  return NextResponse.json({ etats }, { headers: { "Cache-Control": "no-store" } });
}

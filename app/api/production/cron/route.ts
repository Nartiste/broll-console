import { NextResponse } from "next/server";
import { etatClip } from "@/lib/modelark";
import { clientService, mettreALabri, statutDe } from "@/lib/serveur-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Toutes les dix minutes, Vercel fait avancer les tâches ouvertes — que
 * l'onglet soit là ou non. Un clip prêt est copié sur le compte avant que
 * l'adresse du moteur n'expire.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ erreur: "Refusé." }, { status: 403 });
  const sb = clientService();
  if (!sb) return NextResponse.json({ erreur: "Clé de service absente." }, { status: 503 });
  const { data: ouvertes } = await sb.from("taches").select("*").in("statut", ["file", "en-cours"]).order("cree").limit(30);
  let avancees = 0;
  for (const t of ouvertes || []) {
    const r = await etatClip(t.id);
    if (!r.ok) continue;
    const statut = statutDe(r.data!.status);
    if (statut === t.statut) continue;
    const brute = r.data!.content?.video_url;
    const video = statut === "pret" && brute ? (await mettreALabri(sb, t, brute)) || brute : t.video;
    await sb.from("taches").update({ statut, video, erreur: r.data!.error?.message || null, maj: new Date().toISOString() }).eq("id", t.id);
    avancees++;
  }
  return NextResponse.json({ ouvertes: ouvertes?.length || 0, avancees });
}

import { NextResponse } from "next/server";
import { clientService, mettreALabri, statutDe } from "@/lib/serveur-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Le moteur vidéo rappelle ici quand un clip est fini. Personne d'autre :
 * le secret est dans l'adresse, et sans clé de service la route se déclare
 * absente (le suivi reste alors dans l'onglet).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const s = new URL(req.url).searchParams.get("s") || "";
  if (!secret || s !== secret) return NextResponse.json({ erreur: "Refusé." }, { status: 403 });
  const sb = clientService();
  if (!sb) return NextResponse.json({ erreur: "Clé de service absente." }, { status: 503 });
  const corps = await req.json().catch(() => ({}));
  const id = String(corps?.id || "");
  if (!id) return NextResponse.json({ erreur: "Tâche absente." }, { status: 400 });
  const { data: t } = await sb.from("taches").select("*").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ ok: true, inconnue: true });
  const statut = statutDe(String(corps?.status || ""));
  const brute = corps?.content?.video_url as string | undefined;
  const video = statut === "pret" && brute ? (await mettreALabri(sb, t, brute)) || brute : t.video;
  await sb.from("taches").update({ statut, video, erreur: corps?.error?.message || null, maj: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}

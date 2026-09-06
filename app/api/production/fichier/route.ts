import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Relais de téléchargement : les clips vivent chez ModelArk, dont le stockage
 * ne répond pas aux requêtes croisées du navigateur. On ne relaie QUE ces
 * hôtes-là — ce n'est pas un proxy général.
 */
const HOTES = [/\.volces\.com$/, /\.bytepluses\.com$/, /\.byteplusapi\.com$/];

export async function GET(req: Request) {
  const u = new URL(req.url);
  const cible = u.searchParams.get("url") || "";
  const nom = (u.searchParams.get("nom") || "clip").replace(/[^\w.-]+/g, "_");
  let hote = "";
  try { hote = new URL(cible).hostname; } catch { return NextResponse.json({ erreur: "URL invalide." }, { status: 400 }); }
  if (!HOTES.some(h => h.test(hote))) return NextResponse.json({ erreur: "Hôte non relayé." }, { status: 403 });
  const r = await fetch(cible);
  if (!r.ok || !r.body) return NextResponse.json({ erreur: `Source indisponible (${r.status}).` }, { status: 502 });
  return new Response(r.body, {
    headers: {
      "Content-Type": r.headers.get("content-type") || "video/mp4",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

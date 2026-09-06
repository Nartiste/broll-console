import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** L'empreinte du build qui répond. Comparée à celle embarquée dans la page. */
export async function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD || "dev" },
    { headers: { "Cache-Control": "no-store" } });
}

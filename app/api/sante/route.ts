import { NextResponse } from "next/server";
import { disponibles } from "@/lib/images";
import { configure as arkConfigure } from "@/lib/modelark";
import { configure as claudeConfigure } from "@/lib/anthropic";

/** Ce qui est branché et ce qui manque — avant de dépenser quoi que ce soit. */
export async function GET() {
  return NextResponse.json({
    analyse: {
      deterministe: true,
      modele: claudeConfigure(),
      manque: claudeConfigure() ? null : "ANTHROPIC_API_KEY",
    },
    images: disponibles(),
    video: {
      seedance: arkConfigure(),
      manque: arkConfigure() ? null : "ARK_API_KEY",
    },
  });
}

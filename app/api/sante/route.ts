import { NextResponse } from "next/server";
import { disponibles } from "@/lib/images";
import { configure as arkConfigure } from "@/lib/modelark";
import { configure as claudeConfigure } from "@/lib/anthropic";
import { exiger, gardeConfiguree, PLAFONDS } from "@/lib/garde";

/**
 * Ce qui est branché et ce qui manque, aux noms exacts des variables.
 *
 * Une variable mal orthographiée ne provoque aucune erreur : elle est
 * simplement absente, et le moteur reste muet. Cette route existe pour que le
 * diagnostic prenne dix secondes au lieu d'une soirée.
 */
export async function GET(req: Request) {
  const g = await exiger(req);
  if (!g.ok) return g.reponse;
  const images = disponibles();
  const choisi = process.env.IMAGE_PROVIDER || null;
  const actif = images.find(i => i.id === choisi) || images.find(i => i.configure) || null;

  const manquant: string[] = [];
  if (!claudeConfigure()) manquant.push("ANTHROPIC_API_KEY");
  if (!arkConfigure()) manquant.push("ARK_API_KEY");
  if (!actif?.configure) manquant.push("un fournisseur d'images configuré");
  if (choisi && !images.some(i => i.id === choisi)) {
    manquant.push(`IMAGE_PROVIDER=« ${choisi} » inconnu — attendu : ${images.map(i => i.id).join(", ")}`);
  }

  return NextResponse.json({
    pret: manquant.length === 0,
    manquant,
    analyse: {
      palier: claudeConfigure() ? "modele" : "deterministe",
      variable: "ANTHROPIC_API_KEY",
      configure: claudeConfigure(),
    },
    images: {
      choisi,
      actif: actif?.id || null,
      depotRequis: actif ? actif.depotRequis : null,
      fournisseurs: images,
    },
    video: {
      moteur: "Seedance (BytePlus ModelArk)",
      variable: "ARK_API_KEY",
      configure: arkConfigure(),
    },
  });
}

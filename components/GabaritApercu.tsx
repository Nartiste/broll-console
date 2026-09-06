"use client";

import { useMemo } from "react";
import { document as documentGabarit, type Gabarit } from "@/lib/gabarits";

/**
 * Rendu d'un gabarit sur mesure dans une iframe isolée : sans script, sans
 * accès à la page, sans réseau. Le HTML vient d'un modèle et le contenu d'un
 * script — l'isolation est la règle, pas la précaution.
 *
 * Les tailles du gabarit sont en vw : à l'intérieur de l'iframe, 1vw vaut
 * 1 % de la largeur de l'iframe, donc le composant se met à l'échelle seul.
 */
export default function GabaritApercu({
  gabarit, params, vars, sombre = false,
}: { gabarit: Gabarit; params: Record<string, any>; vars: Record<string, string>; sombre?: boolean }) {
  const doc = useMemo(() => documentGabarit(gabarit, params, vars, sombre), [gabarit, params, vars, sombre]);
  return (
    <iframe
      title={gabarit.nom}
      sandbox=""
      srcDoc={doc}
      style={{ width: "100%", height: "100%", border: 0, display: "block", pointerEvents: "none", background: "transparent" }}
    />
  );
}

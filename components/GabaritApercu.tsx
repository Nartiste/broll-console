"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { document as documentGabarit, type Gabarit } from "@/lib/gabarits";

/**
 * Rendu d'un gabarit sur mesure dans une iframe isolée : sans script, sans
 * accès à la page, sans réseau. Le HTML vient d'un modèle et le contenu d'un
 * script — l'isolation est la règle, pas la précaution.
 *
 * Les tailles du gabarit sont en vw : à l'intérieur de l'iframe, 1vw vaut
 * 1 % de la largeur de l'iframe, donc le composant se met à l'échelle seul.
 *
 * Animé, le gabarit ne joue que lorsqu'il entre dans le champ : une planche
 * de trente vignettes qui jouent toutes au chargement, c'est trente
 * animations finies avant qu'on les regarde. Il rejoue à chaque entrée dans
 * le champ et au survol.
 */
export default function GabaritApercu({
  gabarit, params, vars, sombre = false, anime = false,
}: { gabarit: Gabarit; params: Record<string, any>; vars: Record<string, string>; sombre?: boolean; anime?: boolean }) {
  const doc = useMemo(() => documentGabarit(gabarit, params, vars, sombre, { anime }), [gabarit, params, vars, sombre, anime]);
  const cadre = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!anime);
  const [prise, setPrise] = useState(0);

  useEffect(() => {
    if (!anime || !cadre.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); setPrise(p => p + 1); }
      else setVisible(false);
    }, { threshold: 0.4 });
    obs.observe(cadre.current);
    return () => obs.disconnect();
  }, [anime]);

  return (
    <div ref={cadre} style={{ width: "100%", height: "100%" }}
         onMouseEnter={() => { if (anime) setPrise(p => p + 1); }}
         title={anime ? "Survoler pour rejouer" : undefined}>
      {visible && (
        <iframe
          key={prise}
          title={gabarit.nom}
          sandbox=""
          srcDoc={doc}
          style={{ width: "100%", height: "100%", border: 0, display: "block", pointerEvents: "none", background: "transparent" }}
        />
      )}
    </div>
  );
}

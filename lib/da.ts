/**
 * La direction artistique est une CONFIGURATION, jamais du code en dur.
 *
 * L'outil est destiné à plusieurs clients : le chrome de l'application reste
 * neutre, et seule la planche se rend dans la DA du projet. Une DA vit dans
 * `data/<projet>/da.json`, hors du dépôt.
 */

import type { Gabarit } from "./gabarits";

export interface DA {
  nom: string;
  fond: string;
  encre: string;
  accent: string;
  secondaire: string;
  fondSombre: string;
  encreSombre: string;
  policeTitre: string;
  policeUtil: string;
  graisseTitre: number;
  interlettrage: string;   // ex. "-0.04em"
  rayon: number;           // rayon des cartes, en px
  rayonPilule: number;
  rotation: string;        // superposition, ex. "-3deg"
  registre: string;        // le monde visuel des B-roll générés
  resume?: string;         // ce que la charte est, en trois phrases
  sources?: string[];      // les références dont elle a été extraite
  mesure?: { accent: string; fond: string; sur: string };  // dérive relevée sur un rendu réel
  gabarits?: Gabarit[];    // les composants sur mesure, extraits de références
}

/** DA neutre par défaut. Aucune identité de marque dans le dépôt. */
export const DA_NEUTRE: DA = {
  nom: "Neutre",
  fond: "#F4F4F2",
  encre: "#16181B",
  accent: "#19A88F",
  secondaire: "#6E7479",
  fondSombre: "#131518",
  encreSombre: "#EAEBED",
  policeTitre: "'Public Sans', system-ui, sans-serif",
  policeUtil: "'JetBrains Mono', ui-monospace, monospace",
  graisseTitre: 800,
  interlettrage: "-0.02em",
  rayon: 16,
  rayonPilule: 100,
  rotation: "0deg",
  registre: "photographie documentaire sobre, lumière naturelle",
};

/** Les variables CSS que consomme la planche. Appliquées en ligne sur le
 *  conteneur : deux projets ouverts côte à côte gardent chacun sa charte. */
/** Les mêmes variables, en dictionnaire simple — pour les injecter dans une
 *  iframe, où les variables CSS de la page ne pénètrent pas. */
export function variablesBrutes(da: DA): Record<string, string> {
  return {
    "--da-fond": da.fond, "--da-encre": da.encre, "--da-accent": da.accent,
    "--da-secondaire": da.secondaire, "--da-fond-sombre": da.fondSombre,
    "--da-encre-sombre": da.encreSombre, "--da-titre": da.policeTitre,
    "--da-util": da.policeUtil, "--da-graisse": String(da.graisseTitre),
    "--da-interlettrage": da.interlettrage, "--da-rayon": `${da.rayon}px`,
    "--da-pilule": `${da.rayonPilule}px`, "--da-rotation": da.rotation,
  };
}

export function variables(da: DA): React.CSSProperties {
  return {
    ["--da-fond" as any]: da.fond,
    ["--da-encre" as any]: da.encre,
    ["--da-accent" as any]: da.accent,
    ["--da-secondaire" as any]: da.secondaire,
    ["--da-fond-sombre" as any]: da.fondSombre,
    ["--da-encre-sombre" as any]: da.encreSombre,
    ["--da-titre" as any]: da.policeTitre,
    ["--da-util" as any]: da.policeUtil,
    ["--da-graisse" as any]: String(da.graisseTitre),
    ["--da-interlettrage" as any]: da.interlettrage,
    ["--da-rayon" as any]: `${da.rayon}px`,
    ["--da-pilule" as any]: `${da.rayonPilule}px`,
  };
}

/** Convertit un hex en HSL, pour mesurer une dérive de saturation. */
function hsl(hex: string): [number, number, number] {
  const m = hex.replace("#", "").match(/.{2}/g)!.map(h => parseInt(h, 16) / 255);
  const [r, g, b] = m;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0))
          : max === g ? (b - r) / d + 2
          : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Contrôle de conformité d'un rendu à la charte.
 *
 * Mesuré sur les clips de référence : le modèle rend la bonne famille de
 * teinte mais s'effondre en saturation. Sans recalage automatique après
 * génération, on livre des plans systématiquement hors charte — invisible
 * plan par plan, sensible sur quinze minutes.
 */
export function derive(attendu: string, mesure: string) {
  const [h1, s1] = hsl(attendu), [h2, s2] = hsl(mesure);
  const ecartTeinte = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  return {
    teinte: { attendu: h1, mesure: h2, ecart: ecartTeinte, ok: ecartTeinte <= 15 },
    saturation: { attendu: s1, mesure: s2, ok: Math.abs(s1 - s2) <= 12 },
  };
}

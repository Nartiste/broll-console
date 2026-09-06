/**
 * Gabarits sur mesure.
 *
 * Les neuf gabarits intégrés sont des mises en page génériques peintes à la
 * charte : leur FORME n'appartient pas au client. Un gabarit sur mesure part
 * d'une référence — la capture d'un bouton, d'une carte, d'un bandeau — dont
 * on extrait la structure en HTML/CSS. Il garde les mêmes emplacements de
 * contenu qu'un gabarit intégré (les « slots »), pour que la planche puisse
 * y verser le contenu de chaque insert sans rien changer d'autre.
 *
 * Le rendu reste déterministe : c'est du HTML, pas une génération.
 */

import type { Forme } from "./analyse";

export type FormeMotion = Exclude<Forme, "scene">;

export interface Gabarit {
  id: string;
  nom: string;
  forme: FormeMotion;
  description: string;
  html: string;      // avec des slots {{…}}
  css: string;       // styles scopés sous .g
  source?: string;   // nom du fichier de référence
  cree: number;
}

/** Les slots que chaque forme doit remplir. C'est le contrat entre le
 *  gabarit et l'analyse : les mêmes noms que `params` des inserts. */
export const SLOTS: Record<FormeMotion, string> = {
  "liste-3":     "{{titre}} · {{#items}}{{.}}{{/items}} (3 éléments)",
  "liste-5":     "{{titre}} · {{#items}}{{.}}{{/items}} (5 éléments)",
  "mot-choc":    "{{mot}} · {{sous}}",
  "chiffre":     "{{valeur}} · {{legende}}",
  "duo-chiffres":"{{a.v}} {{a.l}} · {{b.v}} {{b.l}}",
  "avant-apres": "{{avant.v}} {{avant.l}} · {{apres.v}} {{apres.l}}",
  "opposition":  "{{gauche.0}} {{gauche.1}} · {{droite.0}} {{droite.1}}",
  "barres":      "{{#items}}{{label}} {{pct}}{{/items}}",
  "pyramide":    "{{#niveaux}}{{.}}{{/niveaux}} (du socle au sommet)",
};

/** Contenu d'exemple par forme, pour prévisualiser un gabarit hors planche. */
export const EXEMPLES: Record<FormeMotion, Record<string, any>> = {
  "liste-3":     { titre: "La règle des 3C", items: ["Compétence", "Cohérence", "Confiance"] },
  "liste-5":     { titre: "Le framework", items: ["Expertise", "Éducation", "Preuve", "Anticipation", "Systématisation"] },
  "mot-choc":    { mot: "UN MYTHE DANGEREUX", sous: "L'authenticité telle qu'on vous la vend" },
  "chiffre":     { valeur: "73 %", legende: "ont choisi la maîtrise du sujet" },
  "duo-chiffres":{ a: { v: "2 000", l: "abonnés" }, b: { v: "0", l: "client payant" } },
  "avant-apres": { avant: { v: "50 €", l: "la consultation" }, apres: { v: "300 €", l: "la séance" } },
  "opposition":  { gauche: ["Votre humanité", "crée la sympathie"], droite: ["Votre expertise", "crée la confiance"] },
  "barres":      { items: [{ label: "Maîtrise du sujet", pct: 73 }, { label: "Authenticité", pct: 12 }] },
  "pyramide":    { niveaux: ["L'évidence", "La pédagogie", "L'anticipation", "La systématisation"] },
};

const echapper = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));

const lire = (obj: any, chemin: string) =>
  chemin === "." ? obj : chemin.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

/**
 * Rendu minimal : {{clé}}, {{a.b}}, {{#liste}}…{{.}}…{{/liste}} et
 * {{#liste}}…{{champ}}…{{/liste}}. Tout est échappé — le HTML du gabarit
 * vient d'un modèle, le contenu vient d'un script : ni l'un ni l'autre ne
 * doit pouvoir injecter quoi que ce soit.
 */
export function rendre(html: string, params: Record<string, any>): string {
  const boucle = html.replace(/{{#([\w.]+)}}([\s\S]*?){{\/\1}}/g, (_, cle, corps) => {
    const liste = lire(params, cle);
    if (!Array.isArray(liste)) return "";
    return liste.map((el, i) =>
      corps.replace(/{{([\w.]+)}}/g, (__: string, c: string) => {
        if (c === ".") return echapper(el);
        if (c === "index") return String(i + 1);
        const v = typeof el === "object" && el !== null ? lire(el, c) : lire(params, c);
        return echapper(v);
      })).join("");
  });
  return boucle.replace(/{{([\w.]+)}}/g, (_, c) => echapper(lire(params, c)));
}

/** Le document complet à afficher dans une iframe isolée. Les variables de
 *  charte sont injectées ici : elles ne traversent pas la frontière d'une iframe. */
export function document(g: Gabarit, params: Record<string, any>, vars: Record<string, string>, sombre = false): string {
  const v = { ...vars };
  if (sombre) {
    v["--da-fond"] = vars["--da-fond-sombre"];
    v["--da-encre"] = vars["--da-encre-sombre"];
  }
  const racine = Object.entries(v).map(([k, val]) => `${k}:${val}`).join(";");
  return `<!doctype html><meta charset="utf-8"><style>
:root{${racine}}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--da-fond);color:var(--da-encre);font-family:var(--da-titre);font-size:4vw}
*{box-sizing:border-box}
.g{width:100%;height:100%;position:relative}
${g.css}
</style><div class="g">${rendre(g.html, params)}</div>`;
}

export const nouvelId = () => Math.random().toString(36).slice(2, 9);

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

/** Ce que chaque forme est, dit pour un humain. Les identifiants (liste-3,
 *  mot-choc…) sont un contrat entre l'analyse et le rendu — pas un vocabulaire
 *  d'interface. Personne ne choisit un gabarit sur un nom de variable. */
export const LIBELLES: Record<FormeMotion, { nom: string; quoi: string }> = {
  "liste-3":      { nom: "Liste de 3",     quoi: "Trois éléments nommés — une règle des 3C, trois piliers." },
  "liste-5":      { nom: "Liste de 5",     quoi: "Un framework en cinq points." },
  "mot-choc":     { nom: "Mot-choc",       quoi: "Une formule seule à l'écran, en capitales." },
  "chiffre":      { nom: "Chiffre",        quoi: "Une valeur et sa légende." },
  "duo-chiffres": { nom: "Deux chiffres",  quoi: "Deux valeurs mises en regard." },
  "avant-apres":  { nom: "Avant / après",  quoi: "Une trajectoire chiffrée, d'hier à aujourd'hui." },
  "opposition":   { nom: "Opposition",     quoi: "Deux idées face à face, l'une l'emporte." },
  "barres":       { nom: "Barres",         quoi: "Des pourcentages comparés." },
  "pyramide":     { nom: "Pyramide",       quoi: "Des niveaux, du socle au sommet." },
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
/**
 * L'entrée animée d'un gabarit, en CSS pur : le cadre se pose, puis chaque
 * élément de premier niveau monte et apparaît, l'un après l'autre. Tout est
 * piloté par une seule variable, --t : l'animation est mise en pause et
 * décalée de -t secondes, ce qui la FIGE exactement à l'instant t. Un rendu
 * image par image devient une suite de captures déterministes.
 */
export const DUREE_ANIMATION = 2.5;

const ANIMATION = `
:root{--t:0s}
.g{animation:g-cadre .55s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(-1 * var(--t));animation-play-state:paused}
.g > *{animation:g-elem .6s cubic-bezier(.2,.8,.2,1) both;animation-play-state:paused}
.g > *:nth-child(1){animation-delay:calc(.25s - var(--t))}
.g > *:nth-child(2){animation-delay:calc(.35s - var(--t))}
.g > *:nth-child(3){animation-delay:calc(.45s - var(--t))}
.g > *:nth-child(4){animation-delay:calc(.55s - var(--t))}
.g > *:nth-child(5){animation-delay:calc(.65s - var(--t))}
.g > *:nth-child(6){animation-delay:calc(.75s - var(--t))}
.g > *:nth-child(n+7){animation-delay:calc(.85s - var(--t))}
.g > * > *{animation:g-elem .5s cubic-bezier(.2,.8,.2,1) both;animation-play-state:paused}
.g > * > *:nth-child(1){animation-delay:calc(.5s - var(--t))}
.g > * > *:nth-child(2){animation-delay:calc(.6s - var(--t))}
.g > * > *:nth-child(3){animation-delay:calc(.7s - var(--t))}
.g > * > *:nth-child(4){animation-delay:calc(.8s - var(--t))}
.g > * > *:nth-child(5){animation-delay:calc(.9s - var(--t))}
.g > * > *:nth-child(n+6){animation-delay:calc(1s - var(--t))}
@keyframes g-cadre{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes g-elem{from{opacity:0;transform:translateY(1.2vw)}to{opacity:1;transform:none}}
`;

export function document(
  g: Gabarit, params: Record<string, any>, vars: Record<string, string>, sombre = false,
  opts: { anime?: boolean; transparent?: boolean } = {},
): string {
  const v = { ...vars };
  if (sombre) {
    v["--da-fond"] = vars["--da-fond-sombre"];
    v["--da-encre"] = vars["--da-encre-sombre"];
  }
  const racine = Object.entries(v).map(([k, val]) => `${k}:${val}`).join(";");
  // Transparent : le fond de page disparaît, seul ce que le gabarit peint reste — l'alpha
  // du PNG est alors vrai, et le motion se superpose au plan dans le montage.
  const fond = opts.transparent ? "transparent" : "var(--da-fond)";
  return `<!doctype html><meta charset="utf-8"><style>
:root{${racine}}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${fond};color:var(--da-encre);font-family:var(--da-titre);font-size:4vw}
*{box-sizing:border-box}
.g{width:100%;height:100%;position:relative}
${g.css}
${opts.anime ? ANIMATION : ""}
</style><div class="g">${rendre(g.html, params)}</div>`;
}

export const nouvelId = () => Math.random().toString(36).slice(2, 9);

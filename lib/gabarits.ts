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
  /** Le mouvement propre du composant : @keyframes g-… et règles .g … {animation}.
   *  Absent, le gabarit reçoit l'entrée générique (cadre puis cascade). */
  animation?: string;
  /** Durée totale de l'animation, état final compris (s). */
  duree?: number;
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
 * L'entrée animée générique d'un gabarit, en CSS pur : le cadre se pose, puis
 * chaque élément monte et apparaît, l'un après l'autre — à 0,3 s d'écart, assez
 * pour qu'on voie 1, puis 2, puis 3 arriver. Un gabarit sur mesure
 * peut apporter son propre mouvement (`animation`) : il remplace celle-ci.
 *
 * Le rendu image par image ne dépend pas de ces règles : il fige la page à
 * l'instant t par l'API Web Animations, quelles que soient les animations
 * présentes. Ici, tout joue naturellement dans l'aperçu.
 */
export const DUREE_ANIMATION = 3.2;
export const dureeDe = (g?: Pick<Gabarit, "duree"> | null) => g?.duree && g.duree > 0 ? g.duree : DUREE_ANIMATION;

const ANIMATION = `
.g{animation:g-cadre .6s cubic-bezier(.2,.9,.2,1) both}
.g > *{animation:g-elem .6s cubic-bezier(.2,.9,.2,1) both}
.g > *:nth-child(1){animation-delay:.2s}
.g > *:nth-child(2){animation-delay:.5s}
.g > *:nth-child(3){animation-delay:.8s}
.g > *:nth-child(4){animation-delay:1.1s}
.g > *:nth-child(5){animation-delay:1.4s}
.g > *:nth-child(6){animation-delay:1.7s}
.g > *:nth-child(n+7){animation-delay:2s}
.g > * > *{animation:g-elem .55s cubic-bezier(.2,.9,.2,1) both}
.g > * > *:nth-child(1){animation-delay:.45s}
.g > * > *:nth-child(2){animation-delay:.8s}
.g > * > *:nth-child(3){animation-delay:1.15s}
.g > * > *:nth-child(4){animation-delay:1.5s}
.g > * > *:nth-child(5){animation-delay:1.85s}
.g > * > *:nth-child(n+6){animation-delay:2.2s}
.g > * > * > *{animation:g-elem .5s cubic-bezier(.2,.9,.2,1) both}
.g > * > * > *:nth-child(1){animation-delay:.7s}
.g > * > * > *:nth-child(2){animation-delay:1.05s}
.g > * > * > *:nth-child(3){animation-delay:1.4s}
.g > * > * > *:nth-child(4){animation-delay:1.75s}
.g > * > * > *:nth-child(n+5){animation-delay:2.1s}
@keyframes g-cadre{from{opacity:0;transform:scale(.9) translateY(2vw)}to{opacity:1;transform:none}}
@keyframes g-elem{from{opacity:0;transform:translateY(3.5vw) scale(.9)}to{opacity:1;transform:none}}
`;

/** Les familles nommées d'une pile CSS, sans les génériques : ce qu'on peut demander à Google Fonts. */
export function famillesDe(pile: string | undefined): string[] {
  if (!pile) return [];
  // Génériques CSS et polices système : Google Fonts ne les a pas, et une seule famille
  // inconnue fait échouer toute la feuille demandée.
  const generiques = /^(serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|cursive|fantasy|inherit|initial|helvetica( neue)?|arial|times( new roman)?|georgia|verdana|tahoma|trebuchet ms|courier( new)?|menlo|monaco|consolas|segoe ui|sf pro( display| text)?|san francisco|-apple-system|blinkmacsystemfont|avenir( next)?|futura|gill sans|optima|impact|calibri|cambria)$/i;
  return pile.split(",").map(f => f.trim().replace(/^['"]|['"]$/g, "")).filter(f => f && !generiques.test(f)).slice(0, 2);
}

/** La feuille Google Fonts pour les polices de la charte. Vide si elles sont toutes génériques. */
export function lienPolices(vars: Record<string, string>): string {
  const familles = [...new Set([...famillesDe(vars["--da-titre"]), ...famillesDe(vars["--da-util"])])];
  if (!familles.length) return "";
  const q = familles.map(f => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800;900`).join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">`;
}

export type Variante = "clair" | "sombre" | "inverse";

export function document(
  g: Gabarit, params: Record<string, any>, vars: Record<string, string>, variante: boolean | Variante = false,
  opts: { anime?: boolean; transparent?: boolean; sansFond?: boolean } = {},
): string {
  const v = { ...vars };
  const mode: Variante = variante === true ? "sombre" : variante === false ? "clair" : variante;
  if (mode === "sombre") {
    v["--da-fond"] = vars["--da-fond-sombre"];
    v["--da-encre"] = vars["--da-encre-sombre"];
  }
  if (mode === "inverse") {
    // La troisième lecture : le cadre prend l'accent, l'accent devient l'encre sombre.
    v["--da-fond"] = vars["--da-accent"];
    v["--da-encre"] = vars["--da-fond-sombre"];
    v["--da-accent"] = vars["--da-fond-sombre"];
    v["--da-fond-sombre"] = vars["--da-encre-sombre"];
  }
  const racine = Object.entries(v).map(([k, val]) => `${k}:${val}`).join(";");
  // Transparent : le fond de page disparaît, seul ce que le gabarit peint reste — l'alpha
  // du PNG est alors vrai, et le motion se superpose au plan dans le montage.
  const fond = opts.transparent ? "transparent" : "var(--da-fond)";
  return `<!doctype html><meta charset="utf-8">${lienPolices(vars)}<style>
:root{${racine}}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${fond};color:var(--da-encre);font-family:var(--da-titre);font-size:4vw}
*{box-sizing:border-box}
.g{width:100%;height:100%;position:relative}
${g.css}
${opts.anime ? (g.animation?.trim() ? g.animation : ANIMATION) : ""}
${opts.sansFond ? ".g{background:transparent!important;box-shadow:none!important}" : ""}
</style><div class="g">${rendre(g.html, params)}</div>`;
}

/** Le gabarit peint-il tout le cadre ? Alors son PNG est opaque et ne se
 *  superpose pas à un plan : on propose aussi une version sans ce fond. */
export const peintLeFond = (css: string) => /\.g\s*\{[^}]*\bbackground/.test(css);

export const nouvelId = () => Math.random().toString(36).slice(2, 9);

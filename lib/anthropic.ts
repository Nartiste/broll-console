/**
 * Palier 2 — l'analyse par modèle.
 *
 * Le palier déterministe lit des marques : les crochets du prompteur, les
 * capitales, les chiffres. Il ne comprend rien, et ça se voit — libellés
 * tronqués au milieu d'une phrase, imageabilité devinée au lexique.
 *
 * Ici, Claude lit le script et JUGE : ce qui mérite une image, ce qui se filme
 * contre ce qui se dessine, et le contenu exact à verser dans chaque gabarit.
 * Il ne calcule aucun timecode — l'arithmétique reste déterministe, et le plan
 * repasse par le même `composer()`. Le modèle décide du fond, pas du rythme.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { blocsDuScript, type Choix } from "./analyse";
import { troisPrompts } from "./images";
import type { DA } from "./da";
import { SLOTS, type FormeMotion, type Gabarit } from "./gabarits";

export const configure = () => Boolean(process.env.ANTHROPIC_API_KEY);

const FORMES = [
  "scene", "liste-3", "liste-5", "mot-choc", "chiffre",
  "duo-chiffres", "avant-apres", "opposition", "barres", "pyramide",
] as const;

/* Schéma à plat : chaque gabarit ne remplit que les champs qui le concernent.
   Plus lisible pour le modèle qu'un objet libre, et strictement validé. */
const Retenu = z.object({
  bloc: z.number().int().describe("index du bloc, tel que fourni"),
  moteur: z.enum(["broll", "motion"]),
  forme: z.enum(FORMES),
  score: z.number().int().min(0).max(99).describe("mérite de ce passage à recevoir une image"),
  imageabilite: z.number().int().min(0).max(99).describe("ce passage peut-il devenir une image unique"),
  abstraction: z.number().int().min(0).max(99).describe("saturation en notions qui ne se filment pas"),
  pourquoi: z.string().describe("une phrase, en français, qui justifie le choix"),

  sujet: z.string().describe("pour TOUS les inserts, motion compris : la scène concrète et filmable qui illustre ce passage, en une proposition — l'auteur peut préférer une image à un gabarit"),
  mouvement: z.string().describe("pour TOUS : ce qui BOUGE pendant le clip — le geste du sujet, ce que font les objets, la vie du décor — une phrase au présent, concrète ; jamais seulement un mouvement de caméra"),
  titre: z.string().nullable(),
  items: z.array(z.string()).nullable().describe("liste-3, liste-5, pyramide"),
  mot: z.string().nullable().describe("mot-choc : la formule, en capitales"),
  sous: z.string().nullable(),
  valeur: z.string().nullable().describe("chiffre : la valeur telle qu'affichée"),
  legende: z.string().nullable(),
  aValeur: z.string().nullable(), aLegende: z.string().nullable(),
  bValeur: z.string().nullable(), bLegende: z.string().nullable(),
  gaucheTitre: z.string().nullable(), gaucheSous: z.string().nullable(),
  droiteTitre: z.string().nullable(), droiteSous: z.string().nullable(),
  barres: z.array(z.object({ label: z.string(), pct: z.number().int() })).nullable(),
});

const Sortie = z.object({
  titre: z.string().describe("titre court de la vidéo, tiré du script"),
  retenus: z.array(Retenu),
});

const CONSIGNE = `Tu prépares l'habillage visuel d'une vidéo YouTube face caméra, tournée au prompteur en plan fixe.

Le script t'est donné découpé en blocs numérotés, avec les directives de prompteur qui les précèdent ([PAUSE], [ACCENTUER], [COMPTER], [NOUVELLE SECTION], [REGARD CAMÉRA]...). Ces directives sont écrites par l'auteur : elles portent l'arc et le rythme, sers-t'en.

Note chaque bloc qui mérite une image, et pour chacun choisis UN des deux moteurs.

**B-roll** — une image générée. Réserve-le à ce qui se filme : une scène, un personnage, un lieu, un geste, un objet. Donne alors « sujet » : la scène à montrer, en une proposition concrète et visuelle. Jamais de texte à l'écran.

**Motion design** — un gabarit typographique rendu à la charte. Réserve-le à ce qui NE se filme pas : une liste, un pourcentage, un framework, une opposition de concepts, une formule choc. L'abstrait ne se filme pas, il se dessine.

Le choix du moteur se déduit du croisement imageabilité × abstraction. Concret et imageable → broll. Abstrait et non imageable → motion.

Gabarits et champs à remplir :
- liste-3 / liste-5 : titre + items (3 ou 5). Des libellés COURTS et autonomes, jamais une phrase coupée.
- pyramide : items, du socle au sommet, 4 maximum.
- mot-choc : mot (la formule, en capitales, 5 mots maximum) + sous (la mise en bouche).
- chiffre : valeur + legende.
- duo-chiffres : aValeur/aLegende et bValeur/bLegende — deux chiffres mis en regard.
- avant-apres : aValeur/aLegende (avant) et bValeur/bLegende (après).
- opposition : gaucheTitre/gaucheSous contre droiteTitre/droiteSous.
- barres : barres, avec un label court et un pourcentage entier.

Règles de fond :
1. **Les libellés sont réécrits, jamais découpés.** Tu peux reformuler pour tenir en trois mots ; tu ne dois pas couper une phrase en plein milieu.
2. **Sois sélectif sur le mérite, pas sur le moteur.** Note bas les passages de transition. Mais la vidéo est en plan fixe : le B-roll est la seule variation visuelle, et une part visée de B-roll t'est donnée. Approche-toi de cette part — en cherchant, dans les passages abstraits, la scène concrète qui les incarne (un personnage, un geste, un lieu) plutôt qu'en les envoyant tous en gabarit. C'est une cible, pas un quota : si le script ne s'y prête vraiment pas, dis-le dans « pourquoi ».
3. **Ne rends aucun timecode ni aucune durée** — ils sont calculés ailleurs.
6. **Le mouvement est une action, pas un zoom.** Pour chaque insert, « mouvement » décrit ce qui se passe à l'image pendant le clip : le sujet fait quelque chose de visible et continu (il se lève, tourne la tête, tape, verse, marche), les objets réagissent, le décor vit. Une phrase qui ne décrit qu'un mouvement de caméra est refusée.
5. **Un sujet visuel pour chaque insert, motion compris.** Le moteur que tu choisis est une proposition ; l'auteur peut préférer, pour n'importe quel passage, une image générée à un gabarit. Donne donc toujours « sujet » : la scène concrète — un personnage, un geste, un lieu, un objet — qui incarnerait ce passage à l'image.
4. Tout en français.`;

/** Traduit la sortie plate du modèle en paramètres de gabarit. */
function versParams(r: z.infer<typeof Retenu>): Record<string, unknown> | undefined {
  switch (r.forme) {
    case "liste-3": case "liste-5":
      return { titre: r.titre || "", items: r.items || [] };
    case "pyramide":
      return { niveaux: (r.items || []).slice(0, 4) };
    case "mot-choc":
      return { mot: r.mot || "", sous: r.sous || "" };
    case "chiffre":
      return { valeur: r.valeur || "", legende: r.legende || "" };
    case "duo-chiffres":
      return { a: { v: r.aValeur || "", l: r.aLegende || "" },
               b: { v: r.bValeur || "", l: r.bLegende || "" } };
    case "avant-apres":
      return { avant: { v: r.aValeur || "", l: r.aLegende || "" },
               apres: { v: r.bValeur || "", l: r.bLegende || "" } };
    case "opposition":
      return { gauche: [r.gaucheTitre || "", r.gaucheSous || ""],
               droite: [r.droiteTitre || "", r.droiteSous || ""] };
    case "barres":
      return { items: r.barres || [] };
    default:
      return undefined;
  }
}

export type Effort = "low" | "medium" | "high";

/**
 * L'effort pèse directement sur la durée : sur un script de 1 600 mots,
 * « high » se compte en minutes. « medium » est la valeur par défaut — la
 * qualité tient, l'attente devient supportable. Réglable par l'appelant
 * (et par ANALYSE_EFFORT côté serveur) pour mesurer plutôt que supposer.
 */
export async function analyserAvecClaude(
  script: string,
  registre: string,
  titreDefaut: string,
  partBroll = 40,
  effort: Effort = (process.env.ANALYSE_EFFORT as Effort) || "medium",
): Promise<{ choix: Choix[]; titre: string }> {
  const client = new Anthropic();
  const blocs = blocsDuScript(script);

  const corpus = blocs
    .map(b => `### bloc ${b.i}${b.directives.length ? `  [${b.directives.join("] [")}]` : ""}\n${b.texte}`)
    .join("\n\n");

  const reponse = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(Sortie), effort },
    system: CONSIGNE,
    messages: [{
      role: "user",
      content: `Registre visuel du projet, pour les sujets de B-roll : ${registre}\n` +
               `Part de B-roll visée : environ ${partBroll} % des inserts retenus.\n\nLe script, par blocs :\n\n${corpus}`,
    }],
  });

  const sortie = reponse.parsed_output;
  if (!sortie) throw new Error("Le modèle n'a pas renvoyé de plan exploitable.");

  const choix: Choix[] = sortie.retenus
    .filter(r => blocs[r.bloc])
    .map(r => ({
      bloc: r.bloc,
      moteur: r.moteur,
      forme: r.forme,
      score: r.score,
      imageabilite: r.imageabilite,
      abstraction: r.abstraction,
      pourquoi: r.pourquoi,
      params: versParams(r),
      // Des vignettes pour tous : le moteur est une proposition, l'image reste possible.
      variantes: troisPrompts(r.sujet || blocs[r.bloc].texte, registre),
      mouvement: r.mouvement,
    }));

  // Le rythme reste déterministe : le modèle a jugé le fond, pas l'allocation.
  // C'est l'appelant qui compose — et qui recompose à chaque réglage du
  // cadrage, sans repasser par le modèle.
  return { choix, titre: sortie.titre || titreDefaut };
}

/* ------------------------------------------------------------ la charte */

const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/).describe("couleur hexadécimale, ex. #1A1A1A");

const Charte = z.object({
  nom: z.string().describe("nom court de la direction artistique, 2 à 4 mots"),
  resume: z.string().describe("trois phrases : l'esthétique, ce qui la rend reconnaissable, ce qu'elle refuse"),
  fond: Hex.describe("fond principal, mode clair"),
  encre: Hex.describe("texte principal sur le fond clair"),
  accent: Hex.describe("LA couleur d'accent — celle qui signe la marque"),
  secondaire: Hex.describe("texte secondaire"),
  fondSombre: Hex.describe("fond du mode sombre"),
  encreSombre: Hex.describe("texte sur le fond sombre"),
  policeTitre: z.string().describe("famille de police des titres, telle qu'on l'écrirait en CSS, avec repli"),
  policeUtil: z.string().describe("police utilitaire pour étiquettes et chiffres, en CSS, avec repli"),
  graisseTitre: z.number().int().min(300).max(900).describe("graisse des titres : 400, 700, 800 ou 900"),
  interlettrage: z.string().describe("letter-spacing des titres en em, ex. -0.04em"),
  rayon: z.number().int().min(0).max(48).describe("rayon des cartes en px"),
  rayonPilule: z.number().int().min(0).max(100).describe("rayon des badges : 100 pour une pilule, 4 pour un rectangle"),
  rotation: z.string().describe("rotation des superpositions en deg, ex. -3deg, ou 0deg"),
  registre: z.string().describe("le monde visuel des B-roll générés, en une phrase de prompt : matière, lumière, palette, caméra. Ce texte préfixera chaque génération."),
  sources: z.array(z.string()).describe("pour chaque référence fournie, en une ligne, ce qu'elle a apporté à la charte"),
});

const CONSIGNE_CHARTE = `Tu extrais une direction artistique exploitable par une machine à partir de références visuelles et documentaires.

On te donne un moodboard — captures d'écran, rendus repérés chez d'autres créateurs, photos — et parfois un document de charte. Tu en déduis une charte COMPLÈTE et COHÉRENTE : palette, typographie, formes, et le registre visuel des images à générer.

Règles :
1. **Un document de charte fait foi** sur les valeurs qu'il fixe (codes couleur, polices). Le moodboard précise le reste — et surtout le registre des images.
2. **Tranche.** Une charte est une décision, pas une moyenne. Si les références divergent, choisis la direction dominante et dis-le dans le résumé.
3. **Les valeurs sont concrètes.** Des hex à six chiffres, des polices nommées, des nombres. Rien d'approximatif.
4. **Le registre est un prompt.** C'est la phrase qui sera placée devant chaque génération d'image : décris la matière, la lumière, la palette, le style de caméra, ce qui doit toujours y être et ce qui ne doit jamais y être. Vise 25 à 45 mots.
5. Tout en français.`;

export interface Reference {
  nom: string;
  type: "image" | "pdf" | "texte";
  donnees: string;     // base64 pour image et pdf, texte brut sinon
  mime?: string;
}

/**
 * Deux usages :
 *   - des références seules → on déduit une charte ;
 *   - une charte de départ + une consigne (« plus sombre », « moins de grille »,
 *     « du rose en plus du vert ») → on la réécrit. C'est le geste du sur-mesure :
 *     on parle à la charte, on ne remplit pas des cases.
 */
export async function extraireCharte(
  refs: Reference[],
  opts: { consigne?: string; actuelle?: DA } = {},
): Promise<DA & { resume: string; sources: string[] }> {
  const client = new Anthropic();

  const contenu: Anthropic.ContentBlockParam[] = [];
  if (opts.actuelle) {
    contenu.push({
      type: "text",
      text: "Charte actuelle du projet (à faire évoluer, pas à repartir de zéro) :\n" +
            JSON.stringify(opts.actuelle, null, 2),
    });
  }
  for (const r of refs) {
    contenu.push({ type: "text", text: `Référence : ${r.nom}` });
    if (r.type === "image") {
      contenu.push({
        type: "image",
        source: { type: "base64", media_type: (r.mime || "image/png") as any, data: r.donnees },
      });
    } else if (r.type === "pdf") {
      contenu.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: r.donnees },
      });
    } else {
      contenu.push({ type: "text", text: r.donnees.slice(0, 40_000) });
    }
  }
  if (opts.consigne?.trim()) {
    contenu.push({
      type: "text",
      text: `Consigne de l'auteur : « ${opts.consigne.trim()} »\n` +
            "Applique-la à la charte actuelle. Ne change que ce que la consigne implique, " +
            "garde tout le reste à l'identique, et note dans `sources` ce que la consigne a modifié.",
    });
  } else {
    contenu.push({ type: "text", text: "Déduis la charte." });
  }

  const reponse = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(Charte), effort: "high" },
    system: CONSIGNE_CHARTE,
    messages: [{ role: "user", content: contenu }],
  });

  const c = reponse.parsed_output;
  if (!c) throw new Error("Le modèle n'a pas renvoyé de charte exploitable.");
  return c;
}


/* ---------------------------------------------------------- les gabarits */

const FORMES_MOTION = [
  "liste-3", "liste-5", "mot-choc", "chiffre", "duo-chiffres",
  "avant-apres", "opposition", "barres", "pyramide",
] as const;

const GabaritSchema = z.object({
  nom: z.string().describe("nom court du composant, ex. « Bouton pilule », « Carte pivotée »"),
  forme: z.enum(FORMES_MOTION).describe("la forme de contenu que ce composant sait porter"),
  description: z.string().describe("deux phrases : ce que la référence montre, et comment le gabarit la transpose"),
  html: z.string().describe("le HTML du composant, à l'intérieur de .g, avec les slots {{…}} de la forme"),
  css: z.string().describe("le CSS, chaque règle préfixée par .g"),
  animation: z.string().describe("le CSS du mouvement : des @keyframes nommés g-… et des règles .g … { animation: … } — l'entrée du composant, puis son mouvement propre ; aucune boucle infinite"),
  duree: z.number().describe("durée totale du mouvement en secondes, état final compris — entre 2 et 6"),
});

const CONSIGNE_GABARIT = `Tu transposes un composant graphique — montré sur une capture d'écran — en gabarit HTML/CSS réutilisable.

Le gabarit sera rendu tel quel, en HTML, dans un canevas 16:9, puis rempli avec le contenu d'un script vidéo. Il doit ressembler à la référence : mêmes proportions, même façon d'empiler les éléments, même caractère (arrondis, bordures, ombres, lueurs, rotations, espacements). C'est la STRUCTURE de la référence qui compte — pas ses mots, qui seront remplacés.

Contraintes techniques, toutes obligatoires :
1. **Tailles en vw uniquement** (1vw = 1 % de la largeur du canevas). Jamais de px, jamais de rem. Le texte doit rester lisible : titres entre 5vw et 12vw, texte courant entre 2.2vw et 3.5vw.
2. **Couleurs et polices par les variables de charte**, jamais en dur : var(--da-fond), var(--da-encre), var(--da-accent), var(--da-secondaire), var(--da-fond-sombre), var(--da-encre-sombre), var(--da-titre), var(--da-util), var(--da-graisse), var(--da-interlettrage), var(--da-rayon), var(--da-pilule), var(--da-rotation). Si la référence a une couleur qui n'est pas dans la charte, rapproche-la de l'accent.
3. **Chaque règle CSS commence par .g** (ex. « .g .bouton »). Le HTML est le contenu de .g, sans balise html/body.
4. **Aucun script, aucune image externe, aucune URL, aucun @import, aucune police web.** Des formes CSS (dégradés, ombres, bordures, pseudo-éléments) reproduisent ce que la référence montre.
5. **Les slots sont exactement ceux de la forme demandée** — ni plus, ni moins. Syntaxe : {{cle}}, {{a.v}}, et pour les listes {{#items}}…{{.}}…{{/items}} (chaque élément est {{.}}, son numéro {{index}}) ou {{#items}}…{{label}} {{pct}}…{{/items}} pour des objets.
6. Le composant occupe le canevas de façon composée — centré, avec des marges — et ne déborde jamais.
7. **Le composant bouge, et son mouvement raconte le contenu.** Dans le champ animation, en CSS pur (@keyframes nommés g-…, règles préfixées .g, animation-fill-mode both, jamais infinite) : d'abord une entrée franche et courte (0,3–0,6 s : le cadre se pose, les éléments arrivent en cascade, décalés de 0,1 à 0,15 s), puis un mouvement PROPRE qui dure — c'est lui qu'on regarde. Des étapes ou une liste : l'état actif (pilule, surbrillance, couleur d'accent) PASSE de l'élément 1 au 2 puis au 3, chacun tenu environ 0,8 s, et ne revient pas en arrière. Un chiffre : il grossit ou se révèle avec poids. Des barres : elles poussent depuis zéro, l'une après l'autre. Avant / après ou opposition : le second volet arrive après le premier, en contraste. Un mot-choc : il claque (échelle, contraste), puis respire à peine. Tout mouvement se termine sur un état final lisible et stable, tenu au moins 0,5 s. Amplitude nette (déplacements en vw, échelles 0,9→1, opacités), courbes cubic-bezier(.2,.9,.2,1) — pas de tremblements, pas de rebonds enfantins. Le champ duree = durée totale, entre 2 et 6 s.
8. Tout en français.`;

export async function extraireGabarit(
  refs: Reference[],
  opts: { forme?: FormeMotion; consigne?: string; actuel?: Gabarit; charte?: DA } = {},
): Promise<Omit<Gabarit, "id" | "cree" | "source">> {
  const client = new Anthropic();
  const contenu: Anthropic.ContentBlockParam[] = [];

  if (opts.charte) {
    contenu.push({ type: "text", text: `Charte du projet (pour information) : ${opts.charte.nom} — ${opts.charte.resume || ""}` });
  }
  if (opts.actuel) {
    contenu.push({ type: "text", text: "Gabarit actuel, à faire évoluer :\n" + JSON.stringify(
      { nom: opts.actuel.nom, forme: opts.actuel.forme, html: opts.actuel.html, css: opts.actuel.css }, null, 2) });
  }
  for (const r of refs) {
    contenu.push({ type: "text", text: `Référence : ${r.nom}` });
    if (r.type === "image") {
      contenu.push({ type: "image", source: { type: "base64", media_type: (r.mime || "image/png") as any, data: r.donnees } });
    } else {
      contenu.push({ type: "text", text: r.donnees.slice(0, 20_000) });
    }
  }
  const forme = opts.forme;
  const contrat = forme
    ? `Forme demandée : ${forme}. Slots à utiliser, exactement : ${SLOTS[forme]}.`
    : `Choisis la forme que ce composant sait le mieux porter, parmi : ${FORMES_MOTION.join(", ")}. Puis utilise exactement ses slots :\n` +
      Object.entries(SLOTS).map(([f, s]) => `- ${f} : ${s}`).join("\n");
  contenu.push({ type: "text", text: contrat });
  if (opts.consigne?.trim()) {
    contenu.push({ type: "text", text: `Consigne de l'auteur : « ${opts.consigne.trim()} ». Applique-la ; ne change que ce qu'elle implique.` });
  } else {
    contenu.push({ type: "text", text: "Transpose la référence en gabarit." });
  }

  const reponse = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(GabaritSchema), effort: "high" },
    system: CONSIGNE_GABARIT,
    messages: [{ role: "user", content: contenu }],
  });
  const g = reponse.parsed_output;
  if (!g) throw new Error("Le modèle n'a pas renvoyé de gabarit exploitable.");

  // Ceinture et bretelles : le rendu est isolé dans une iframe sans script,
  // mais on refuse quand même tout ce qui n'a rien à y faire.
  const html = g.html.replace(/<\s*(script|iframe|object|embed|link|meta|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
                     .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*\/?>/gi, "")
                     .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
                     .replace(/(src|href)\s*=\s*("[^"]*"|'[^']*')/gi, "");
  const purger = (c: string) => c.replace(/@import[^;]*;/gi, "").replace(/url\([^)]*\)/gi, "none").replace(/expression\([^)]*\)/gi, "");
  const css = purger(g.css);
  const animation = purger(g.animation || "").replace(/\binfinite\b/gi, "1");
  const duree = Math.max(1.5, Math.min(8, Number(g.duree) || 2.5));
  return { nom: g.nom, forme: g.forme, description: g.description, html, css, animation, duree };
}

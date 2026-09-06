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

  sujet: z.string().nullable().describe("broll : le sujet visuel en une proposition"),
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
2. **Sois sélectif.** Note bas les passages de transition. Il vaut mieux proposer moins et mieux : la sélection finale se fait ensuite sous contrainte de rythme, et elle prend les meilleurs scores.
3. **Ne rends aucun timecode ni aucune durée** — ils sont calculés ailleurs.
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

export async function analyserAvecClaude(
  script: string,
  registre: string,
  titreDefaut: string,
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
    output_config: { format: zodOutputFormat(Sortie), effort: "high" },
    system: CONSIGNE,
    messages: [{
      role: "user",
      content: `Registre visuel du projet, pour les sujets de B-roll : ${registre}\n\nLe script, par blocs :\n\n${corpus}`,
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
      variantes: r.moteur === "broll"
        ? troisPrompts(r.sujet || blocs[r.bloc].texte, registre)
        : undefined,
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

export async function extraireCharte(refs: Reference[]): Promise<DA & { resume: string; sources: string[] }> {
  const client = new Anthropic();

  const contenu: Anthropic.ContentBlockParam[] = [];
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
  contenu.push({ type: "text", text: "Déduis la charte." });

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

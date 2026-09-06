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
import { blocsDuScript, composer, type Cadrage, type Choix, type Plan } from "./analyse";
import { troisPrompts } from "./images";

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
  cadrage: Cadrage,
  registre: string,
  titreDefaut: string,
): Promise<Plan> {
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
  return composer(script, cadrage, choix, sortie.titre || titreDefaut);
}

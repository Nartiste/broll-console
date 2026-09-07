"use client";

/**
 * Stockage des projets.
 *
 * Mode démo : tout vit dans le navigateur, aucun compte requis — on peut
 * déposer un script et voir le résultat immédiatement. Le passage à Supabase
 * remplace ce module sans toucher aux composants : même signature, même forme
 * de données.
 */

import { analyser, composer, CADRAGE_DEFAUT, type Cadrage, type Choix, type Plan } from "./analyse";
import { DA_NEUTRE, type DA } from "./da";
import { pousser, supprimerDistant } from "./sync";

export type Etat = "oui" | "presque" | "non" | null;

export interface Decision {
  etat: Etat;
  variante: number;
  raisons: string[];
  note: string;
  /** Les vignettes réellement générées, une par variante. Absentes tant que
   *  rien n'a été lancé : la planche montre alors un aperçu factice, marqué. */
  images?: (string | null)[];
  /** Le moteur retenu par l'auteur, s'il diffère de la proposition du modèle. */
  moteur?: "broll" | "motion";
  /** Le mouvement du clip, retouché par l'auteur. */
  mouvement?: string;
}

export type StatutProd = "attente" | "file" | "en-cours" | "pret" | "echec" | "sans-objet";

export interface ArticleProd {
  n: number;
  fichier: string;          // NN-titre-court, sans extension
  moteur: "broll" | "motion";
  forme: string;
  duree: number;
  statut: StatutProd;
  tache?: string;           // identifiant ModelArk
  video?: string;           // URL du clip une fois prêt
  erreur?: string;
  prompt?: string;
  mouvement?: string;       // ce qui bouge pendant le clip
  image?: string | null;    // la vignette validée, référence du clip
  html?: string;            // gabarit sur mesure rendu, autonome
  dureeAnim?: number;       // durée du mouvement du gabarit (s)
}

export interface Production {
  lancee: number;
  resolution: string;
  articles: ArticleProd[];
}

export interface Projet {
  id: string;
  titre: string;
  cree: number;
  script: string;
  cadrage: Cadrage;
  da: DA;
  decisions: Record<number, Decision>;
  /** Le jugement, tel que renvoyé par l'analyse. Absent tant qu'elle n'a pas tourné. */
  choix?: Choix[];
  palier?: "modele" | "deterministe";
  avertissement?: string | null;
  /** La dernière production lancée : tâches, états, fichiers. Survit au rechargement. */
  production?: Production;
  /** Dernière modification (ms). Le plus récent gagne à la synchronisation. */
  maj?: number;
  /** Le compte auquel le projet appartient — absent tant qu'il n'est que local. */
  compte?: string;
}

const CLE = "broll-console:projets";

const lire = (): Projet[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CLE) || "[]"); } catch { return []; }
};

const ecrire = (p: Projet[]) => {
  try { localStorage.setItem(CLE, JSON.stringify(p)); } catch { /* mode privé */ }
};

export const projets = lire;

export const projet = (id: string) => lire().find(p => p.id === id) || null;

/** Le titre se déduit de la première ligne parlée du script. */
function titreDepuis(script: string, secours: string) {
  const l = script.split("\n").map(s => s.trim())
    .find(s => s && !s.startsWith("[") && s.length > 12);
  if (!l) return secours;
  return l.length > 58 ? l.slice(0, 56).trimEnd() + "…" : l;
}

export function creer(script: string, nomFichier = "Nouveau projet"): Projet {
  const p: Projet = {
    id: Math.random().toString(36).slice(2, 9),
    titre: titreDepuis(script, nomFichier.replace(/\.[^.]+$/, "")),
    cree: Date.now(),
    script,
    cadrage: { ...CADRAGE_DEFAUT },
    da: { ...DA_NEUTRE },
    decisions: {},
    maj: Date.now(),
  };
  ecrire([p, ...lire()]);
  pousser(p);
  return p;
}

export function majProjet(id: string, patch: Partial<Projet>) {
  const tous = lire();
  const i = tous.findIndex(p => p.id === id);
  if (i < 0) return null;
  tous[i] = { ...tous[i], ...patch, maj: Date.now() };
  ecrire(tous);
  pousser(tous[i]);
  return tous[i];
}

export function supprimer(id: string) {
  ecrire(lire().filter(p => p.id !== id));
  supprimerDistant(id);
}

/** Le plan se recompose localement à partir des choix : les curseurs du
 *  cadrage restent instantanés, le modèle n'est pas rappelé. */
export const planDe = (p: Projet): Plan =>
  p.choix ? composer(p.script, p.cadrage, p.choix, p.titre)
          : analyser(p.script, p.cadrage, p.da.registre, p.titre);

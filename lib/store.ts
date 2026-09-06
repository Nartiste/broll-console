"use client";

/**
 * Stockage des projets.
 *
 * Mode démo : tout vit dans le navigateur, aucun compte requis — on peut
 * déposer un script et voir le résultat immédiatement. Le passage à Supabase
 * remplace ce module sans toucher aux composants : même signature, même forme
 * de données.
 */

import { analyser, CADRAGE_DEFAUT, type Cadrage, type Plan } from "./analyse";
import { DA_NEUTRE, type DA } from "./da";

export type Etat = "oui" | "presque" | "non" | null;

export interface Decision {
  etat: Etat;
  variante: number;
  raisons: string[];
  note: string;
}

export interface Projet {
  id: string;
  titre: string;
  cree: number;
  script: string;
  cadrage: Cadrage;
  da: DA;
  decisions: Record<number, Decision>;
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
  };
  ecrire([p, ...lire()]);
  return p;
}

export function majProjet(id: string, patch: Partial<Projet>) {
  const tous = lire();
  const i = tous.findIndex(p => p.id === id);
  if (i < 0) return null;
  tous[i] = { ...tous[i], ...patch };
  ecrire(tous);
  return tous[i];
}

export function supprimer(id: string) {
  ecrire(lire().filter(p => p.id !== id));
}

export const planDe = (p: Projet): Plan =>
  analyser(p.script, p.cadrage, p.da.registre, p.titre);

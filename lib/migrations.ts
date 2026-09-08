import { analyser, composer, type Insert } from "./analyse";
import type { Projet } from "./store";

/**
 * Les projets enregistrés hier doivent s'ouvrir aujourd'hui. Chaque version
 * du schéma a sa migration, appliquée à la lecture — en local comme depuis le
 * compte — et écrite à la prochaine sauvegarde.
 *
 * v2 — les décisions sont indexées par le bloc de script (stable), plus par
 *      le rang de l'insert dans le plan (qui change à chaque recomposition).
 */
export const VERSION_PROJET = 2;

function plan(p: Projet): Insert[] {
  try {
    return (p.choix ? composer(p.script, p.cadrage, p.choix, p.titre) : analyser(p.script, p.cadrage, p.da.registre, p.titre)).inserts;
  } catch { return []; }
}

export function migrer(p: Projet): Projet {
  const v = p.version || 1;
  if (v >= VERSION_PROJET) return p;
  let q = { ...p };
  if (v < 2) {
    // Rang → bloc, d'après le plan tel qu'il se recompose aujourd'hui.
    const inserts = plan(q);
    const parBloc: Projet["decisions"] = {};
    for (const [n, d] of Object.entries(q.decisions || {})) {
      const i = inserts.find(x => x.n === Number(n));
      if (i) parBloc[i.bloc] = d;
    }
    q = { ...q, decisions: parBloc };
  }
  return { ...q, version: VERSION_PROJET };
}

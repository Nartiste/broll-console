/**
 * Étage d'analyse : un script au format prompteur entre, un plan d'inserts sort.
 *
 * Deux étages séparés, et c'est la décision de conception qui gouverne tout le
 * fichier : on NOTE tous les passages (le mérite), puis on SÉLECTIONNE sous
 * contrainte (le rythme). Une classification passage par passage produirait
 * toujours le même défaut — dense en introduction, désert ensuite.
 *
 * Ce qui est implémenté ici est le palier déterministe : les formes
 * grammaticales, les directives du prompteur, les chiffres, les capitales.
 * Aucune inférence, aucun appel de modèle. Le palier suivant (imageabilité et
 * rôle rhétorique jugés par un modèle) viendra enrichir les mêmes structures.
 */

export type Moteur = "broll" | "motion";
export type Forme =
  | "scene" | "liste-3" | "liste-5" | "mot-choc" | "chiffre"
  | "duo-chiffres" | "avant-apres" | "opposition" | "barres" | "pyramide";

export interface Cadrage {
  plafond: number;      // nombre maximum d'inserts
  dureeMax: number;     // durée maximum d'un insert, en secondes
  ecartMin: number;     // jamais deux inserts plus rapprochés
  ecartMax: number;     // jamais plus de face caméra pure que ça
  debit: number;        // mots par minute — à calibrer sur une vidéo passée
  /** Part de B-roll visée, en % des inserts. Sur un plan fixe, le B-roll
   *  porte toute la variation visuelle : sans cible, un jugement sélectif
   *  bascule tout en motion design. Une cible, pas un quota. */
  partBroll: number;
}

export const CADRAGE_DEFAUT: Cadrage = {
  plafond: 30, dureeMax: 12, ecartMin: 6, ecartMax: 30, debit: 135, partBroll: 40,
};

export interface Insert {
  n: number;
  section: string;
  moteur: Moteur;
  forme: Forme;
  texte: string[];
  mots: number;
  entree: number;       // secondes
  duree: number;        // secondes
  score: number;
  imageabilite: number;
  abstraction: number;
  pourquoi: string;
  variantes?: string[];             // trois prompts d'image, pour tous
  params?: Record<string, any>;     // motion : les paramètres du gabarit
  /** Ce qui bouge pendant le clip : le geste du sujet, la vie du décor. Une
   *  image animée par un simple zoom n'est pas une vidéo — c'est ce champ
   *  qui fait la différence à la génération. */
  mouvement?: string;
}

export interface Plan {
  titre: string;
  script: { mots: number; duree: number; debit: number };
  cadrage: Cadrage;
  inserts: Insert[];
  ecartes: number;
  alertes: { apres: number; type: "serre" | "desert"; valeur: number }[];
}

const PAUSE_SECONDES = 1.5;

const compteMots = (t: string) => (t.match(/[\wÀ-ÿ'’%€]+/g) || []).length;

/** Suffixes des noms abstraits français. Un passage qui en est saturé ne se
 *  filme pas — il se dessine. C'est ce qui aiguille vers le motion design. */
const SUFFIXES_ABSTRAITS =
  /(ité|tion|sion|isme|ence|ance|ude|té|ment|logie)s?$/i;

/** Marqueurs de concret : ce qui a un corps, une action, un lieu. */
const MOTS_CONCRETS = new RegExp(
  "\\b(regarde|filme|marche|court|assis|debout|tient|pose|ouvre|ferme|écrit|" +
  "tape|parle|montre|prend|jette|casse|explose|construit|bureau|salon|écran|" +
  "table|rue|ville|studio|caméra|téléphone|ordinateur|papier|livre|café|" +
  "canapé|scène|salle|porte|fenêtre|main|mains|visage|foule|pyjama|glace)\\b",
  "i");

interface Bloc {
  lignes: string[];
  texte: string;
  debutMot: number;
  mots: number;
  directives: string[];
  section: string;
}

/** Découpe le script en blocs de souffle et récolte les directives qui les
 *  précèdent. Le format prompteur porte déjà l'arc, le rythme et les
 *  énumérations : on lit des marques au lieu de deviner des intentions. */
function decouper(script: string): { blocs: Bloc[]; totalMots: number; pauses: number[] } {
  const lignes = script.split("\n");
  const blocs: Bloc[] = [];
  const pauses: number[] = [];
  let courant: string[] = [];
  let directives: string[] = [];
  let section = "Ouverture";
  let mots = 0;
  let debutMot = 0;

  const fermer = () => {
    if (!courant.length) return;
    const texte = courant.join("\n");
    const n = compteMots(texte);
    blocs.push({ lignes: [...courant], texte, debutMot, mots: n, directives: [...directives], section });
    mots += n;
    directives = [];
    courant = [];
  };

  for (const brute of lignes) {
    const l = brute.trim();
    if (!l) { fermer(); debutMot = mots; continue; }

    const dir = l.match(/^\[(.+)\]$/);
    if (dir) {
      fermer();
      debutMot = mots;
      const d = dir[1].toUpperCase();
      directives.push(d);
      if (d.startsWith("PAUSE")) pauses.push(mots);
      if (d.startsWith("NOUVELLE SECTION")) {
        const nom = d.split("-").slice(1).join("-").trim();
        section = nom ? nom.charAt(0) + nom.slice(1).toLowerCase() : "Section";
        directives = [];
      }
      continue;
    }
    if (!courant.length) debutMot = mots;
    courant.push(l);
  }
  fermer();
  return { blocs, totalMots: mots, pauses };
}

/** Extrait les mots en capitales — le script marque lui-même ses accents. */
const capitales = (t: string) =>
  (t.match(/\b[A-ZÀ-Þ][A-ZÀ-Þ'’-]{2,}\b/g) || []).filter(m => m.length > 2);

const nombres = (t: string) =>
  (t.match(/\b\d[\d\s  ]*(?:%|€|euros?)?\b/g) || [])
    .map(s => s.trim()).filter(s => s.length > 0);

const pourcentages = (t: string) => (t.match(/\b\d{1,3}\s?%/g) || []);

/** Détecte une énumération : soit une directive [COMPTER], soit des lignes
 *  numérotées, soit une formule « la règle des N ». */
function enumeration(b: Bloc): string[] | null {
  const numerotees = b.lignes
    .map(l => l.match(/^(?:Niveau\s*\d+\s*:|Un|Deux|Trois|Quatre|Cinq)\s*:\s*(.+)$/i))
    .filter(Boolean).map(m => m![1].trim());
  if (numerotees.length >= 3) return numerotees;

  const compte = b.directives.some(d => d.startsWith("COMPTER"));
  if (compte) {
    const items = b.lignes.filter(l => compteMots(l) <= 4 && !/[:?]$/.test(l));
    if (items.length >= 3) return items.slice(0, 5);
  }
  const regle = b.texte.match(/règle des (\d)/i);
  if (regle) {
    const n = parseInt(regle[1], 10);
    const items = b.lignes.filter(l => compteMots(l) <= 3);
    if (items.length >= n) return items.slice(-n);
  }
  return null;
}

/** Détecte une opposition binaire : « ne … pas X … mais Y ». */
function opposition(b: Bloc): { gauche: string[]; droite: string[] } | null {
  const idx = b.lignes.findIndex(l => /\bne\b.*\bpas\b|\bjamais\b|\bau lieu de\b/i.test(l));
  if (idx < 0 || b.lignes.length < idx + 2) return null;
  const g = b.lignes.slice(idx, idx + 2);
  const d = b.lignes.slice(idx + 2, idx + 4);
  if (!d.length) return null;
  return { gauche: [g[0], g[1] || ""], droite: [d[0], d[1] || ""] };
}

function note(b: Bloc) {
  const caps = capitales(b.texte);
  const nb = nombres(b.texte);
  const mots = (b.texte.toLowerCase().match(/[a-zà-ÿ'’-]+/g) || []);
  const abstraits = mots.filter(m => m.length > 5 && SUFFIXES_ABSTRAITS.test(m)).length;
  const concrets = (b.texte.match(MOTS_CONCRETS) || []).length;
  // Un prénom isolé en début de bloc annonce presque toujours un personnage.
  const personnage = /^[A-ZÀ-Þ][a-zà-ÿ]{2,}\b/.test(b.lignes[0] || "") &&
                     !caps.includes((b.lignes[0] || "").split(/\s/)[0]);

  const abstraction = Math.min(95, Math.round(12 + (abstraits / Math.max(mots.length, 1)) * 340));
  const imageabilite = Math.min(96, Math.round(
    18 + concrets * 22 + (personnage ? 34 : 0) - abstraits * 3));

  let score = 42;
  score += Math.min(18, caps.length * 5);
  score += Math.min(14, nb.length * 7);
  if (b.directives.some(d => d.startsWith("ACCENTUER"))) score += 12;
  if (b.directives.some(d => d.startsWith("PAUSE"))) score += 8;
  if (b.directives.some(d => d.startsWith("COMPTER"))) score += 22;
  if (b.directives.some(d => d.startsWith("DONNÉES") || d.startsWith("DONNEES"))) score += 10;
  if (b.directives.some(d => d.includes("TON "))) score += 6;
  if (b.directives.some(d => d.startsWith("REGARD CAMÉRA"))) score += 5;
  score += Math.round(Math.max(imageabilite, abstraction) / 12);

  return { score: Math.min(99, score), imageabilite: Math.max(4, imageabilite), abstraction, caps, nb };
}

/** Aiguillage entre les deux moteurs : le croisement imageabilité × abstraction.
 *  Ce qui se filme part en génération. Ce qui ne se filme pas — une liste, un
 *  pourcentage, un framework — part en gabarit. */
function aiguiller(b: Bloc, m: ReturnType<typeof note>):
  { moteur: Moteur; forme: Forme; params?: any; pourquoi: string } {

  const items = enumeration(b);
  if (items) {
    const estPyramide = /pyramide|niveau/i.test(b.texte);
    if (estPyramide)
      return { moteur: "motion", forme: "pyramide",
        params: { niveaux: items.slice(0, 4) },
        pourquoi: "Framework nommé à niveaux, signalé par une directive de comptage." };
    return { moteur: "motion", forme: items.length >= 5 ? "liste-5" : "liste-3",
      params: { titre: b.section, items: items.slice(0, 5) },
      pourquoi: "Énumération détectée — forme grammaticale, aucune inférence nécessaire." };
  }

  const pct = pourcentages(b.texte);
  if (pct.length >= 2)
    return { moteur: "motion", forme: "barres",
      params: { items: pct.slice(0, 3).map((p, i) => ({
        label: (b.lignes[i * 2 + 1] || b.lignes[0] || "").slice(0, 40), pct: parseInt(p, 10) })) },
      pourquoi: "Deux pourcentages opposés : la preuve chiffrée doit être vue, pas entendue." };

  if (m.nb.length >= 2) {
    const avantApres = /aujourd'hui|désormais|maintenant|il y a \w+ (ans|mois)/i.test(b.texte);
    if (avantApres)
      return { moteur: "motion", forme: "avant-apres",
        params: { avant: { v: m.nb[0], l: "avant" }, apres: { v: m.nb[1], l: "aujourd'hui" } },
        pourquoi: "Trajectoire chiffrée : la progression doit s'animer, pas s'afficher." };
    return { moteur: "motion", forme: "duo-chiffres",
      params: { a: { v: m.nb[0], l: (b.lignes[0] || "").replace(m.nb[0], "").trim().slice(0, 28) },
                b: { v: m.nb[1], l: (b.lignes[b.lignes.length - 1] || "").replace(m.nb[1], "").trim().slice(0, 28) } },
      pourquoi: "Deux chiffres mis en regard — gabarit chiffre-clé." };
  }

  const opp = opposition(b);
  if (opp && m.abstraction > 40)
    return { moteur: "motion", forme: "opposition", params: opp,
      pourquoi: "Structure binaire explicite dans la phrase." };

  if (m.nb.length === 1 && m.abstraction < 60)
    return { moteur: "motion", forme: "chiffre",
      params: { valeur: m.nb[0], legende: (b.lignes[b.lignes.length - 1] || "").slice(0, 40) },
      pourquoi: "Chiffre isolé : il conclut la démonstration, il doit rester à l'écran." };

  if (m.abstraction >= 55 && m.imageabilite < 45 && m.caps.length)
    return { moteur: "motion", forme: "mot-choc",
      params: { mot: m.caps.slice(0, 3).join(" "), sous: (b.lignes[0] || "").slice(0, 52) },
      pourquoi: "Abstrait et non imageable : ça ne se filme pas, ça se dessine." };

  return { moteur: "broll", forme: "scene",
    pourquoi: m.imageabilite > 60
      ? "Passage concret et imageable — cas d'école du plan généré."
      : "Repêché pour tenir le rythme : au-delà de l'écart maximum sans image." };
}

/** Trois prompts par insert. Choisir est plus rapide et plus juste que juger
 *  dans l'absolu — et l'étage image est l'étage bon marché du pipeline. */
function prompts(b: Bloc, registre: string): string[] {
  const sujet = (b.lignes[0] || "").replace(/[.?!]$/, "").toLowerCase();
  return [
    `${registre} — plan large : ${sujet}. Composition centrée, mouvement de caméra lent.`,
    `${registre} — plan serré : ${sujet}. Faible profondeur de champ, cadrage décentré.`,
    `${registre} — abstrait : ${sujet}. Aucune figure lisible, texture et mouvement seuls.`,
  ];
}

/** Ce qu'un étage de notation produit pour un bloc : le mérite et le rendu.
 *  Le palier déterministe et le palier modèle remplissent la même structure —
 *  seule la qualité du jugement change, jamais la suite du pipeline. */
export interface Choix {
  bloc: number;                 // index dans blocsDuScript()
  moteur: Moteur;
  forme: Forme;
  score: number;
  imageabilite: number;
  abstraction: number;
  pourquoi: string;
  params?: Record<string, any>;
  variantes?: string[];
  mouvement?: string;
}

/** Les blocs de souffle du script, numérotés — l'unité que les deux paliers notent. */
export function blocsDuScript(script: string) {
  return decouper(script).blocs.map((b, i) => ({
    i, texte: b.texte, lignes: b.lignes, section: b.section,
    directives: b.directives, mots: b.mots,
  }));
}

/**
 * Étage 2 — la sélection sous contrainte, commune aux deux paliers.
 * La note dit le mérite, la sélection dit le rythme.
 */
export function composer(
  script: string,
  cadrage: Cadrage,
  choix: Choix[],
  titre = "Sans titre",
): Plan {
  const { blocs, totalMots, pauses } = decouper(script);

  const timecode = (posMot: number) =>
    (posMot / cadrage.debit) * 60 + PAUSE_SECONDES * pauses.filter(p => p <= posMot).length;

  const dureeTotale = timecode(totalMots);

  const candidats = choix
    .filter(c => blocs[c.bloc])
    .map(c => {
      const b = blocs[c.bloc];
      return {
        ...c, src: b,
        entree: timecode(b.debutMot),
        duree: Math.min((b.mots / cadrage.debit) * 60, cadrage.dureeMax),
      };
    });

  // Étage 2 — sélectionner sous contrainte. Le meilleur d'abord, en respectant
  // l'écart minimum : c'est la note qui décide, pas l'ordre de lecture.
  const retenus: typeof candidats = [];
  const libre = (c: typeof candidats[0]) =>
    retenus.every(r => c.entree + c.duree + cadrage.ecartMin <= r.entree ||
                       r.entree + r.duree + cadrage.ecartMin <= c.entree);

  for (const c of [...candidats].sort((a, b) => b.score - a.score)) {
    if (retenus.length >= cadrage.plafond) break;
    if (libre(c)) retenus.push(c);
  }

  // Repêchage : c'est lui qui transforme une liste de bonnes idées en montage
  // tenu. Sur un plan fixe, le B-roll porte toute la variation visuelle —
  // l'écart maximum compte plus que l'écart minimum.
  retenus.sort((a, b) => a.entree - b.entree);
  let fin = 0;
  for (const r of [...retenus, { entree: dureeTotale, duree: 0 } as any]) {
    if (r.entree - fin > cadrage.ecartMax) {
      const trou = candidats
        .filter(c => !retenus.includes(c) && c.entree > fin && c.entree < r.entree)
        .sort((a, b) => b.score - a.score)[0];
      if (trou && retenus.length < cadrage.plafond) {
        retenus.push(trou);
        retenus.sort((a, b) => a.entree - b.entree);
      }
    }
    fin = r.entree + r.duree;
  }
  retenus.sort((a, b) => a.entree - b.entree);

  const inserts: Insert[] = retenus.map((c, i) => ({
    n: i + 1,
    section: c.src.section,
    moteur: c.moteur,
    forme: c.forme,
    texte: c.src.lignes,
    mots: c.src.mots,
    entree: Math.round(c.entree * 10) / 10,
    duree: Math.round(c.duree * 10) / 10,
    score: c.score,
    imageabilite: c.imageabilite,
    abstraction: c.abstraction,
    pourquoi: c.pourquoi,
    variantes: c.variantes,
    params: c.params,
    mouvement: c.mouvement,
  }));

  const alertes: Plan["alertes"] = [];
  for (let i = 0; i < inserts.length - 1; i++) {
    const trou = Math.round((inserts[i + 1].entree - (inserts[i].entree + inserts[i].duree)) * 10) / 10;
    if (trou < cadrage.ecartMin) alertes.push({ apres: inserts[i].n, type: "serre", valeur: trou });
    else if (trou > cadrage.ecartMax) alertes.push({ apres: inserts[i].n, type: "desert", valeur: trou });
  }

  return {
    titre,
    script: { mots: totalMots, duree: Math.round(dureeTotale * 10) / 10, debit: cadrage.debit },
    cadrage, inserts, ecartes: candidats.length - inserts.length, alertes,
  };
}

/**
 * Palier 1 — l'analyse déterministe.
 *
 * Elle ne comprend rien : elle lit les directives du prompteur, les capitales,
 * les chiffres et les énumérations. C'est suffisant pour les formes
 * grammaticales, et insuffisant pour juger ce qui mérite une image — d'où le
 * palier modèle, qui remplit exactement la même structure `Choix`.
 */
export function choixDeterministes(
  script: string,
  registre = "3D stylisée, lignes lumineuses sur fond sombre",
): Choix[] {
  const { blocs } = decouper(script);

  return blocs
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.mots >= 3)
    .map(({ b, i }) => {
      const m = note(b);
      const a = aiguiller(b, m);
      return {
        bloc: i,
        moteur: a.moteur,
        forme: a.forme,
        score: m.score,
        imageabilite: m.imageabilite,
        abstraction: m.abstraction,
        pourquoi: a.pourquoi,
        params: a.params,
        variantes: prompts(b, registre),   // pour tous : l'image reste possible
        mouvement: `Le sujet accomplit, en continu et de façon visible, ce que dit le passage : « ${(b.lignes[0] || "").replace(/[.?!]$/, "")} ». Le décor vit — lumière, particules, écran — et la caméra avance légèrement, sans porter seule le mouvement.`,
      };
    });
}

export function analyser(
  script: string,
  cadrage: Cadrage = CADRAGE_DEFAUT,
  registre = "3D stylisée, lignes lumineuses sur fond sombre",
  titre = "Sans titre",
): Plan {
  return composer(script, cadrage, choixDeterministes(script, registre), titre);
}

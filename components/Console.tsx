"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { composer, analyser, CADRAGE_DEFAUT } from "@/lib/analyse";
import { derive, variables, variablesBrutes, type DA } from "@/lib/da";
import { EXEMPLES, LIBELLES, SLOTS, type FormeMotion, type Gabarit } from "@/lib/gabarits";
import { Comp } from "./Vignette";
import GabaritApercu from "./GabaritApercu";
import Production from "./Production";
import { majProjet, type Decision, type Etat, type Projet } from "@/lib/store";
import Vignette from "./Vignette";

const RAISONS = ["hors charte", "trop littéral", "mauvais sujet", "trop générique", "cadrage"];
const VIDE: Decision = { etat: null, variante: 0, raisons: [], note: "" };

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function Console({ initial }: { initial: Projet }) {
  const [projet, setProjet] = useState(initial);
  const [porte, setPorte] = useState<1 | 2 | 3>(() => {
    if (typeof window === "undefined") return 1;
    const e = Number(new URLSearchParams(window.location.search).get("etape"));
    return e === 2 || e === 3 ? e : 1;
  });
  const [vise, setVise] = useState(1);
  const [charge, setCharge] = useState<string | null>(null);
  const [prodOuverte, setProdOuverte] = useState(false);
  const modale = useRef<HTMLDialogElement>(null);

  /* Le plan se recompose localement à partir des choix : les curseurs
     restent instantanés. Le modèle n'est appelé qu'une fois — au montage,
     ou sur demande — et le déterministe sert d'attente et de filet. */
  const plan = useMemo(
    () => projet.choix
      ? composer(projet.script, projet.cadrage, projet.choix, projet.titre)
      : analyser(projet.script, projet.cadrage, projet.da.registre, projet.titre),
    [projet.script, projet.cadrage, projet.choix, projet.da.registre, projet.titre],
  );

  const [analyse, setAnalyse] = useState<"repos" | "en-cours" | "erreur">("repos");
  const [charteEtat, setCharteEtat] = useState<"repos" | "en-cours" | "erreur">("repos");
  const [charteErreur, setCharteErreur] = useState<string | null>(null);
  const refsInput = useRef<HTMLInputElement>(null);
  const [consigne, setConsigne] = useState("");
  const [gabEtat, setGabEtat] = useState<"repos" | "en-cours" | "erreur">("repos");
  const [gabErreur, setGabErreur] = useState<string | null>(null);
  const [gabForme, setGabForme] = useState<FormeMotion | "">("");
  const [gabConsigne, setGabConsigne] = useState<Record<string, string>>({});
  const gabInput = useRef<HTMLInputElement>(null);
  const vars = useMemo(() => variablesBrutes(projet.da), [projet.da]);
  const gabaritPour = (forme: string) => projet.da.gabarits?.find(g => g.forme === forme);

  /* Les vignettes ne se génèrent jamais toutes seules : c'est une dépense,
     petite mais réelle, donc un geste explicite — par insert, ou pour tous. */
  const [generation, setGeneration] = useState<Record<number, "en-cours" | "erreur">>({});
  const [genErreur, setGenErreur] = useState<string | null>(null);

  async function genererVignettes(n: number) {
    if (analyse === "en-cours") return;   // le plan va changer sous nos pieds
    const ins = plan.inserts.find(i => i.n === n);
    if (!ins || ins.moteur !== "broll" || !ins.variantes?.length) return;
    setGeneration(g => ({ ...g, [n]: "en-cours" })); setGenErreur(null);
    try {
      const note = dec(n).note?.trim();
      const prompts = note ? ins.variantes.map(p => `${p} Retouche demandée : ${note}.`) : ins.variantes;
      const r = await fetch("/api/vignettes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts }),
      });
      const c = await r.json();
      if (!r.ok) throw new Error(c.erreur || "Génération impossible");
      const images = (c.vignettes as any[]).map(v => (v.ok ? v.images?.[0]?.affichage || null : null));
      const rate = (c.vignettes as any[]).find(v => !v.ok);
      if (rate && images.every(x => !x)) throw new Error(rate.erreur || "Génération refusée");
      majDec(n, { images });
      setGeneration(g => { const { [n]: _, ...reste } = g; return reste; });
    } catch (e) {
      setGeneration(g => ({ ...g, [n]: "erreur" }));
      setGenErreur(e instanceof Error ? e.message : "Génération impossible");
    }
  }

  async function genererToutes() {
    const cibles = plan.inserts.filter(i => i.moteur === "broll" && dec(i.n).etat !== "non" && !dec(i.n).images);
    if (!cibles.length) return;
    if (!confirm(`Générer ${cibles.length * 3} images (${cibles.length} inserts × 3 variantes) ? Ordre de grandeur : ${(cibles.length * 3 * 0.03).toFixed(2)} $ hors quota gratuit.`)) return;
    for (const i of cibles) await genererVignettes(i.n);
  }

  async function extraireGabarit(fichiers: File[], opts: { consigne?: string; actuel?: Gabarit } = {}) {
    if (!fichiers.length && !(opts.consigne && opts.actuel)) return;
    setGabEtat("en-cours"); setGabErreur(null);
    try {
      const corps = new FormData();
      fichiers.forEach(f => corps.append("fichiers", f));
      if (gabForme && !opts.actuel) corps.append("forme", gabForme);
      if (opts.consigne) corps.append("consigne", opts.consigne);
      if (opts.actuel) corps.append("actuel", JSON.stringify(opts.actuel));
      corps.append("charte", JSON.stringify({ nom: projet.da.nom, resume: projet.da.resume }));
      const r = await fetch("/api/gabarit", { method: "POST", body: corps });
      const c = await r.json();
      if (!r.ok) throw new Error(c.erreur || "Extraction impossible");
      const g: Gabarit = c.gabarit;
      const autres = (projet.da.gabarits || []).filter(x => x.id !== g.id);
      majDa({ gabarits: [...autres, g] });
      setGabEtat("repos");
      if (opts.actuel) setGabConsigne(q => ({ ...q, [g.id]: "" }));
    } catch (e) {
      setGabEtat("erreur");
      setGabErreur(e instanceof Error ? e.message : "Extraction impossible");
    }
  }

  const [depuis, setDepuis] = useState<number | null>(null);
  const [chrono, setChrono] = useState(0);
  useEffect(() => {
    if (depuis === null) return;
    const t = setInterval(() => setChrono(Math.round((Date.now() - depuis) / 1000)), 1000);
    return () => clearInterval(t);
  }, [depuis]);

  /* `da` en argument : après une extraction de charte, l'état React n'est pas
     encore à jour dans cette fermeture — on passe la charte fraîche plutôt
     que d'analyser avec l'ancien registre. */
  async function lancerAnalyse(daFraiche?: DA) {
    const da = daFraiche || projet.da;
    setAnalyse("en-cours"); setDepuis(Date.now()); setChrono(0);
    try {
      const r = await fetch("/api/analyse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: projet.script, cadrage: projet.cadrage,
                               registre: da.registre, titre: projet.titre }),
      });
      const c = await r.json();
      if (!r.ok) throw new Error(c.erreur || "Analyse impossible");
      const patch = { choix: c.choix, palier: c.palier, avertissement: c.avertissement || null,
                      titre: c.titre || projet.titre };
      setProjet(p => ({ ...p, ...patch }));
      majProjet(projet.id, patch);
      setAnalyse("repos"); setDepuis(null);
    } catch { setAnalyse("erreur"); setDepuis(null); }
  }

  useEffect(() => { if (!projet.choix) lancerAnalyse(); /* eslint-disable-line */ }, []);

  async function extraireCharte(fichiers: FileList | File[], consigneTexte = "") {
    const liste = Array.from(fichiers);
    if (!liste.length && !consigneTexte.trim()) return;
    setCharteEtat("en-cours"); setCharteErreur(null);
    try {
      const corps = new FormData();
      liste.forEach(f => corps.append("fichiers", f));
      if (consigneTexte.trim()) corps.append("consigne", consigneTexte.trim());
      // On part toujours de la charte en place : une consigne la fait évoluer,
      // des références neuves la complètent, jamais de retour à zéro silencieux.
      corps.append("actuelle", JSON.stringify(projet.da));
      const r = await fetch("/api/charte", { method: "POST", body: corps });
      const c = await r.json();
      if (!r.ok) throw new Error(c.erreur || "Extraction impossible");
      const da: DA = { ...projet.da, ...c.charte };
      // Les prompts de B-roll portent le registre : une nouvelle charte
      // invalide le jugement précédent, on relance l'analyse.
      const patch = { da, choix: undefined, palier: undefined };
      setProjet(p => ({ ...p, ...patch }));
      majProjet(projet.id, patch);
      setCharteEtat("repos");
      setConsigne("");
      lancerAnalyse(da);
    } catch (e) {
      setCharteEtat("erreur");
      setCharteErreur(e instanceof Error ? e.message : "Extraction impossible");
    }
  }

  const dec = (n: number): Decision => projet.decisions[n] || VIDE;

  function majDec(n: number, patch: Partial<Decision>) {
    const decisions = { ...projet.decisions, [n]: { ...dec(n), ...patch } };
    setProjet(p => ({ ...p, decisions }));
    majProjet(projet.id, { decisions });
  }

  /* La charte extraite est une proposition, pas un verdict : chaque valeur
     se corrige à la main, et la correction est conservée. */
  function majDa(patch: Partial<DA>) {
    const da = { ...projet.da, ...patch };
    setProjet(p => ({ ...p, da }));
    majProjet(projet.id, { da });
  }

  function majCadrage(patch: Partial<Projet["cadrage"]>) {
    const cadrage = { ...projet.cadrage, ...patch };
    setProjet(p => ({ ...p, cadrage }));
    majProjet(projet.id, { cadrage });
  }

  /* Trier vite protège la qualité des décisions : à la souris, on abandonne au
     bout de dix minutes et on valide tout pour en finir. */
  useEffect(() => {
    function clavier(e: KeyboardEvent) {
      if (porte !== 3) return;
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      const i = plan.inserts.findIndex(x => x.n === vise);
      let suivant = vise;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        suivant = plan.inserts[Math.min(i + 1, plan.inserts.length - 1)].n;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        suivant = plan.inserts[Math.max(i - 1, 0)].n;
      } else if ("123".includes(e.key)) {
        const k = ({ "1": "oui", "2": "presque", "3": "non" } as const)[e.key as "1" | "2" | "3"];
        const actuel = dec(vise).etat;
        majDec(vise, { etat: actuel === k ? null : k });
        if (actuel !== k && i < plan.inserts.length - 1) suivant = plan.inserts[i + 1].n;
      } else if ("abcABC".includes(e.key)) {
        majDec(vise, { variante: "abc".indexOf(e.key.toLowerCase()) });
        return;
      } else return;
      e.preventDefault();
      setVise(suivant);
      document.getElementById(`insert-${suivant}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    addEventListener("keydown", clavier);
    return () => removeEventListener("keydown", clavier);
  });

  const compte = (k: Etat) => plan.inserts.filter(i => dec(i.n).etat === k).length;
  const reste = plan.inserts.length - compte("oui") - compte("presque") - compte("non");
  const brolls = plan.inserts.filter(i => i.moteur === "broll" && dec(i.n).etat !== "non");
  const motions = plan.inserts.filter(i => i.moteur === "motion" && dec(i.n).etat !== "non");
  const secondes = brolls.reduce((t, i) => t + Math.min(i.duree, projet.cadrage.dureeMax), 0);

  const conformite = projet.da.mesure ? derive(projet.da.accent, projet.da.mesure.accent) : null;

  function produire() {
    setCharge(JSON.stringify({
      projet: projet.titre,
      cadrage: projet.cadrage,
      da: projet.da.nom,
      inserts: plan.inserts.filter(i => dec(i.n).etat && dec(i.n).etat !== "non").map(i => ({
        n: i.n, entree: i.entree, duree: i.duree, moteur: i.moteur, forme: i.forme,
        decision: dec(i.n).etat, variante: "ABC"[dec(i.n).variante],
        source: i.moteur === "motion" ? i.params : i.variantes?.[dec(i.n).variante],
        retouche: dec(i.n).note || undefined,
      })),
      diagnostic_da: plan.inserts.reduce((acc: Record<string, number>, i) => {
        dec(i.n).raisons.forEach(r => (acc[r] = (acc[r] || 0) + 1));
        return acc;
      }, {}),
    }, null, 2));
    modale.current?.showModal();
  }

  return (
    <div style={variables(projet.da)}>
      <header>
        <div>
          <Link href="/studio" className="muet" style={{ fontSize: 13, textDecoration: "none" }}>← Projets</Link>
          <h1 style={{ marginTop: 4 }}>{projet.titre}</h1>
          <div className="chiffres mono muet" style={{ display: "flex", gap: 14, fontSize: 12, marginTop: 6 }}>
            <span>{plan.script.mots} mots</span>
            <span>≈ {tc(plan.script.duree)}</span>
            <span>{plan.inserts.length} inserts</span>
            <span>{plan.ecartes} passages écartés</span>
            <span>{plan.alertes.length} alerte(s) de rythme</span>
          </div>
        </div>
        <div className="droite" style={{ alignItems: "center" }}>
          <span className="pilule" title={projet.avertissement || ""}>
            {analyse === "en-cours" ? `analyse en cours · ${chrono} s`
              : projet.palier === "modele" ? "jugé par le modèle"
              : analyse === "erreur" ? "analyse par modèle indisponible"
              : "analyse déterministe"}
          </span>
          <button className="btn fantome" disabled={analyse === "en-cours"} onClick={() => lancerAnalyse()}>
            Réanalyser
          </button>
        </div>
      </header>

      <div className="etapes">
        {([[1, "Cadrage"], [2, "Charte"], [3, "Planche"]] as const).map(([n, l]) => (
          <button key={n} aria-current={porte === n} onClick={() => setPorte(n)}>
            <span className="n">Étape {n}</span> {l}
          </button>
        ))}
      </div>
      <p className="muet" style={{ marginTop: -12, marginBottom: 20, fontSize: 13.5 }}>
        {porte === 1 && "Bornez le coût avant la première génération : combien d'inserts, combien de secondes, quelle part de B-roll."}
        {porte === 2 && "Montrez votre charte — elle est déduite de vos références —, corrigez-la, puis ajoutez vos propres composants."}
        {porte === 3 && "Triez les inserts un par un. Rien n'est généré, rien n'est facturé sans votre clic."}
      </p>

      {porte === 1 && (
        <div className="reglages">
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn fantome" style={{ padding: "8px 14px", fontSize: 13 }}
                    onClick={() => majCadrage({ ...CADRAGE_DEFAUT })}>
              Revenir aux réglages par défaut
            </button>
            <span className="muet" style={{ fontSize: 12.5 }}>
              30 inserts · 12 s maximum · 40 % de B-roll · 135 mots/min. Les curseurs se règlent ensuite un par un.
            </span>
          </div>
          <div className="carte reglage">
            <span className="eyebrow">Nombre maximum d&apos;inserts</span>
            <div className="val">{projet.cadrage.plafond}<small>inserts</small></div>
            <input type="range" min={8} max={60} value={projet.cadrage.plafond}
                   onChange={e => majCadrage({ plafond: +e.target.value })} />
            <div className="bornes"><span>8</span><span>60</span></div>
            <p>
              {plan.inserts.length} retenus sur {plan.inserts.length + plan.ecartes} passages notés.
              La sélection prend les meilleurs, puis repêche là où un trou dépasse l&apos;écart maximum.
            </p>
          </div>

          <div className="carte reglage">
            <span className="eyebrow">Durée maximum par insert</span>
            <div className="val">{projet.cadrage.dureeMax}<small>secondes</small></div>
            <input type="range" min={3} max={30} value={projet.cadrage.dureeMax}
                   onChange={e => majCadrage({ dureeMax: +e.target.value })} />
            <div className="bornes"><span>3 s</span><span>30 s</span></div>
            <p>
              La durée réelle de chaque insert se déduit du nombre de mots du passage couvert.
              Ce curseur ne fait que plafonner.
            </p>
          </div>

          <div className="carte devis">
            <span className="eyebrow">Ce que ça engage</span>
            <div className="l"><span>Images de validation</span><b>{plan.inserts.length * 3}</b></div>
            <div className="l"><span>Clips à générer</span><b>{brolls.length}</b></div>
            <div className="l"><span>Secondes de vidéo</span><b>{secondes.toFixed(0)} s</b></div>
            <div className="l"><span>Rendus motion</span><b>{motions.length} · sans coût</b></div>
            <p className="note">
              Compté en unités de génération, pas en euros : reportez le tarif de votre plan pour
              obtenir un montant. Les rendus motion ne consomment rien — ce sont des rendus
              déterministes, pas des générations.
            </p>
          </div>

          <div className="carte reglage">
            <span className="eyebrow">Part de B-roll visée</span>
            <div className="val">{projet.cadrage.partBroll ?? 40}<small>% des inserts</small></div>
            <input type="range" min={0} max={100} step={5} value={projet.cadrage.partBroll ?? 40}
                   onChange={e => majCadrage({ partBroll: +e.target.value })} />
            <div className="bornes"><span>tout en motion</span><span>tout en B-roll</span></div>
            <p>
              Une cible transmise au jugement, pas un quota. En plan fixe, le B-roll porte toute la variation
              visuelle. Ce réglage change le jugement, pas seulement le rythme : cliquez « Réanalyser » pour l&apos;appliquer.
              Actuellement : {plan.inserts.filter(i => i.moteur === "broll").length} B-roll sur {plan.inserts.length}.
              {(projet.cadrage.partBroll ?? 40) < 25 && (
                <span style={{ color: "var(--signal)", display: "block", marginTop: 6 }}>
                  Sous 25 %, attendez-vous à peu ou pas d&apos;images — et sans image, pas de clip.
                </span>
              )}
            </p>
          </div>

          <div className="carte reglage" style={{ gridColumn: "1 / -1" }}>
            <span className="eyebrow">Débit de parole</span>
            <div className="val">{projet.cadrage.debit}<small>mots par minute</small></div>
            <input type="range" min={100} max={190} value={projet.cadrage.debit}
                   onChange={e => majCadrage({ debit: +e.target.value })} />
            <div className="bornes"><span>100</span><span>190</span></div>
            <p>
              Tous les timecodes et toutes les durées en dépendent. À mesurer une fois, sur une
              vidéo déjà montée : nombre de mots du script divisé par la durée réelle.
              Ici : {plan.script.mots} mots donnent {tc(plan.script.duree)} de montage.
            </p>
          </div>
        </div>
      )}

      {porte === 2 && (
        <div className="duo">
          <div className="carte">
            <span className="eyebrow">Références</span>
            <h3 style={{ marginTop: 8 }}>D&apos;où vient la charte</h3>
            <div
              className={"depot"}
              style={{ marginTop: 14, padding: "26px 18px" }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); extraireCharte(e.dataTransfer.files); }}
            >
              <h3 style={{ fontSize: 16 }}>
                {charteEtat === "en-cours" ? "Lecture des références…" : "Déposez votre moodboard et votre charte"}
              </h3>
              <p>
                Captures de typographies, rendus repérés ailleurs, photos de référence, document de
                charte en PDF ou Word. La charte n&apos;est pas saisie : elle est déduite de la matière.
              </p>
              {charteErreur && <p style={{ color: "var(--alerte)", marginTop: 8 }}>{charteErreur}</p>}
              <div className="ou">
                <button className="btn" disabled={charteEtat === "en-cours"}
                        onClick={() => refsInput.current?.click()}>
                  {charteEtat === "en-cours" ? "Extraction…" : "Choisir des fichiers"}
                </button>
              </div>
              <input ref={refsInput} type="file" multiple hidden
                     accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.txt,.md"
                     onChange={e => { if (e.target.files) extraireCharte(e.target.files); }} />
            </div>
            <div className="eyebrow" style={{ marginTop: 18 }}>Ajuster avec une consigne</div>
            <textarea className="champ" style={{ marginTop: 8, minHeight: 64, resize: "vertical" }}
                      placeholder="Plus sombre. Moins de grille au sol. Du rose néon en plus du vert. Des titres moins écrasés…"
                      value={consigne} onChange={e => setConsigne(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) extraireCharte([], consigne); }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
              <button className="btn" disabled={charteEtat === "en-cours" || !consigne.trim()}
                      onClick={() => extraireCharte([], consigne)}>
                {charteEtat === "en-cours" ? "Réécriture…" : "Réécrire la charte"}
              </button>
              <span className="muet" style={{ fontSize: 12 }}>⌘↵ · ne change que ce que la consigne implique</span>
            </div>

            {projet.da.sources?.length ? (
              <>
                <div className="eyebrow" style={{ marginTop: 16 }}>Ce que chaque référence a apporté</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--encre-2)", lineHeight: 1.5 }}>
                  {projet.da.sources.map((x, i) => <li key={i}>{x}</li>)}
                </ul>
              </>
            ) : null}
          </div>

          <div className="carte">
            <span className="eyebrow">Charte du projet</span>
            <input className="champ" style={{ marginTop: 8, fontFamily: "var(--titre)", fontWeight: 800, fontSize: 19 }}
                   value={projet.da.nom} onChange={e => majDa({ nom: e.target.value })} />
            {projet.da.resume && <p className="pourquoi" style={{ marginTop: 8 }}>{projet.da.resume}</p>}

            <div className="nuancier">
              {([["Fond", "fond", projet.da.encre],
                 ["Encre", "encre", projet.da.fond],
                 ["Accent", "accent", projet.da.fondSombre],
                 ["Secondaire", "secondaire", projet.da.fond],
                 ["Fond sombre", "fondSombre", projet.da.encreSombre],
                 ["Encre sombre", "encreSombre", projet.da.fondSombre]] as const).map(([l, k, t]) => (
                <label className="teinte" key={k} style={{ background: projet.da[k], color: t, cursor: "pointer", position: "relative" }}>
                  <span>{l}</span>
                  <input type="text" value={projet.da[k]} spellCheck={false}
                         onChange={e => { const v = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) majDa({ [k]: v } as any); }}
                         style={{ background: "transparent", border: "none", color: "inherit", font: "inherit",
                                  fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 700, width: "100%", padding: 0 }} />
                  <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(projet.da[k]) ? projet.da[k] : "#000000"}
                         onChange={e => majDa({ [k]: e.target.value.toUpperCase() } as any)}
                         style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                         aria-label={`Choisir la couleur ${l}`} />
                </label>
              ))}
            </div>

            <div style={{ marginTop: 14, fontFamily: projet.da.policeTitre, fontWeight: projet.da.graisseTitre,
                          letterSpacing: projet.da.interlettrage, fontSize: 26, lineHeight: 1 }}>
              Aperçu du titre
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
              <div>
                <label className="eyebrow">Police des titres</label>
                <input className="champ" style={{ marginTop: 6 }} value={projet.da.policeTitre}
                       onChange={e => majDa({ policeTitre: e.target.value })} />
              </div>
              <div>
                <label className="eyebrow">Police utilitaire</label>
                <input className="champ" style={{ marginTop: 6 }} value={projet.da.policeUtil}
                       onChange={e => majDa({ policeUtil: e.target.value })} />
              </div>
              <div>
                <label className="eyebrow">Graisse des titres</label>
                <select className="champ" style={{ marginTop: 6 }} value={projet.da.graisseTitre}
                        onChange={e => majDa({ graisseTitre: +e.target.value })}>
                  {[400, 500, 600, 700, 800, 900].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="eyebrow">Interlettrage</label>
                <input className="champ" style={{ marginTop: 6 }} value={projet.da.interlettrage}
                       onChange={e => majDa({ interlettrage: e.target.value })} />
              </div>
              <div>
                <label className="eyebrow">Rayon des cartes (px)</label>
                <input className="champ" type="number" min={0} max={48} style={{ marginTop: 6 }} value={projet.da.rayon}
                       onChange={e => majDa({ rayon: +e.target.value })} />
              </div>
              <div>
                <label className="eyebrow">Rayon des badges (px)</label>
                <input className="champ" type="number" min={0} max={100} style={{ marginTop: 6 }} value={projet.da.rayonPilule}
                       onChange={e => majDa({ rayonPilule: +e.target.value })} />
              </div>
              <div>
                <label className="eyebrow">Rotation des superpositions</label>
                <input className="champ" style={{ marginTop: 6 }} value={projet.da.rotation}
                       onChange={e => majDa({ rotation: e.target.value })} />
              </div>
            </div>
            <p className="pourquoi">
              Tout se corrige à la main et la correction est conservée. Les couleurs et les polices
              n&apos;affectent que les gabarits motion ; seul le registre change les prompts de B-roll.
            </p>

            <label className="eyebrow" style={{ display: "block", marginTop: 18 }}>Registre visuel des B-roll</label>
            <textarea className="champ" style={{ marginTop: 8, minHeight: 70, resize: "vertical" }}
                      value={projet.da.registre}
                      onChange={e => majDa({ registre: e.target.value })} />
            <p className="pourquoi">
              Cette phrase est placée devant chaque génération d&apos;image. Si vous la changez à la main,
              cliquez « Réanalyser » pour que les prompts la reprennent.
            </p>

            <div className="eyebrow" style={{ marginTop: 18 }}>Contrôle de conformité</div>
            {conformite ? (
              <div className="controle">
                <div className="l">
                  <span>Teinte</span>
                  <span className="mono muet">{conformite.teinte.attendu}° attendu · {conformite.teinte.mesure}° mesuré</span>
                  <span className={"etatp " + (conformite.teinte.ok ? "ok" : "ko")}>{conformite.teinte.ok ? "conforme" : "dérive"}</span>
                </div>
                <div className="l">
                  <span>Saturation</span>
                  <span className="mono muet">{conformite.saturation.attendu} % attendu · {conformite.saturation.mesure} % mesuré</span>
                  <span className={"etatp " + (conformite.saturation.ok ? "ok" : "ko")}>{conformite.saturation.ok ? "conforme" : "dérive"}</span>
                </div>
              </div>
            ) : (
              <p className="pourquoi">
                Aucun rendu mesuré pour l&apos;instant. Dès qu&apos;une image sera générée, sa dérive
                par rapport à l&apos;accent sera relevée ici — le modèle approxime la charte, il ne la
                respecte pas, et c&apos;est ce qui justifie la passe de mise en charte.
              </p>
            )}
          </div>
        
          <div className="carte" style={{ gridColumn: "1 / -1" }}>
            <span className="eyebrow">Gabarits sur mesure</span>
            <h3 style={{ marginTop: 8 }}>Vos composants, pas les nôtres</h3>
            <p className="pourquoi" style={{ marginTop: 6, maxWidth: "70ch" }}>
              Les gabarits intégrés sont des mises en page génériques peintes à votre charte. Ici, vous
              montrez un composant que vous aimez — un bouton, une carte, un bandeau — et sa structure
              devient un gabarit. La planche s&apos;en sert à la place du gabarit intégré de même forme.
            </p>

            <div className="eyebrow" style={{ marginTop: 16 }}>Ce que le composant doit porter</div>
            <p className="muet" style={{ fontSize: 13, marginTop: 4 }}>
              Neuf formes de contenu. Chacune est montrée ici avec le gabarit intégré, dans votre charte —
              c&apos;est ce que votre composant remplacera.
            </p>
            <div className="formes">
              <button className={"forme" + (gabForme === "" ? " on" : "")} onClick={() => setGabForme("")}>
                <div className="vignette" style={{ display: "grid", placeItems: "center", background: "var(--surface-2)" }}>
                  <span className="muet" style={{ fontSize: 12, padding: 12, textAlign: "center" }}>Le modèle choisit la forme d&apos;après la capture</span>
                </div>
                <b>Au choix du modèle</b>
                <span>Si vous ne savez pas laquelle : il regarde le composant et décide.</span>
              </button>
              {(Object.keys(LIBELLES) as FormeMotion[]).map(f => (
                <button key={f} className={"forme" + (gabForme === f ? " on" : "")} onClick={() => setGabForme(f)}>
                  <div className="vignette"><Comp forme={f} params={EXEMPLES[f]} i={0} /></div>
                  <b>{LIBELLES[f].nom}</b>
                  <span>{LIBELLES[f].quoi}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn" disabled={gabEtat === "en-cours"} onClick={() => gabInput.current?.click()}>
                {gabEtat === "en-cours" ? "Extraction…" : `Déposer une capture${gabForme ? " · " + LIBELLES[gabForme].nom : ""}`}
              </button>
              <span className="muet" style={{ fontSize: 12.5 }}>Un bouton, une carte, un bandeau — une image du composant que vous aimez.</span>
              <input ref={gabInput} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.gif"
                     onChange={e => { const f = e.target.files?.[0]; if (f) extraireGabarit([f]); e.target.value = ""; }} />
            </div>
            {gabErreur && <p style={{ color: "var(--alerte)", marginTop: 8, fontSize: 13 }}>{gabErreur}</p>}

            {projet.da.gabarits?.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14, marginTop: 18 }}>
                {projet.da.gabarits.map(g => (
                  <div key={g.id} style={{ border: "1px solid var(--trait)", borderRadius: 16, overflow: "hidden", background: "var(--surface-2)" }}>
                    <div className="vignette">
                      <GabaritApercu gabarit={g} params={EXEMPLES[g.forme]} vars={vars} />
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <b style={{ fontSize: 14 }}>{g.nom}</b>
                        <span className="tag motion" style={{ marginLeft: "auto" }}>{LIBELLES[g.forme].nom}</span>
                      </div>
                      <p className="muet" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.45 }}>{g.description}</p>
                      {g.source && <p className="mono muet" style={{ fontSize: 10.5, marginTop: 4 }}>d&apos;après {g.source}</p>}
                      <textarea className="champ" style={{ marginTop: 8, minHeight: 40, fontSize: 13 }}
                                placeholder="Ajuster : plus de marge, coins moins ronds, texte plus grand…"
                                value={gabConsigne[g.id] || ""}
                                onChange={e => setGabConsigne(q => ({ ...q, [g.id]: e.target.value }))} />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }}
                                disabled={gabEtat === "en-cours" || !(gabConsigne[g.id] || "").trim()}
                                onClick={() => extraireGabarit([], { consigne: gabConsigne[g.id], actuel: g })}>
                          Réécrire
                        </button>
                        <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5, marginLeft: "auto" }}
                                onClick={() => majDa({ gabarits: (projet.da.gabarits || []).filter(x => x.id !== g.id) })}>
                          Retirer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muet" style={{ marginTop: 14, fontSize: 13 }}>
                Aucun gabarit sur mesure pour l&apos;instant — la planche utilise les gabarits intégrés.
              </p>
            )}
          </div>
        </div>
      )}

      {porte === 3 && !projet.choix && analyse === "en-cours" && (
        <div className="carte" style={{ marginTop: 8 }}>
          <span className="eyebrow">Analyse en cours</span>
          <h3 style={{ marginTop: 8 }}>Le modèle lit votre script</h3>
          <p className="pourquoi" style={{ marginTop: 6 }}>
            {chrono} s écoulées. Comptez une à deux minutes sur un script long : le modèle lit chaque bloc et
            écrit le contenu de chaque gabarit. La planche s&apos;ouvrira sur le jugement final — pas sur un
            plan provisoire que l&apos;analyse remplacerait sous vos clics.
          </p>
        </div>
      )}
      {porte === 3 && !(!projet.choix && analyse === "en-cours") && (
        <>
          <div className="ruban-zone">
            <div className="ruban">
              {(() => {
                const el: React.ReactNode[] = [];
                let fin = 0;
                plan.inserts.forEach(i => {
                  const hors = dec(i.n).etat === "non";
                  if (!hors) {
                    const trou = i.entree - fin;
                    if (trou > projet.cadrage.ecartMax) {
                      el.push(<div className="desert" key={`d${i.n}`}
                        style={{ left: `${(100 * fin) / plan.script.duree}%`,
                                 width: `${(100 * trou) / plan.script.duree}%` }} />);
                    }
                    fin = i.entree + i.duree;
                  }
                  el.push(
                    <i key={i.n}
                       className={`${i.moteur === "motion" ? "motion " : ""}${hors ? "hors " : ""}${i.n === vise ? "vise" : ""}`}
                       title={`#${i.n} · ${tc(i.entree)} · ${i.duree}s`}
                       style={{ left: `${(100 * i.entree) / plan.script.duree}%`,
                                width: `${Math.max(0.5, (100 * i.duree) / plan.script.duree)}%` }}
                       onClick={() => {
                         setVise(i.n);
                         document.getElementById(`insert-${i.n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                       }} />
                  );
                });
                return el;
              })()}
            </div>
            <div className="ruban-legende">
              <span><i className="puce" style={{ background: "var(--encre-2)" }} />B-roll généré</span>
              <span><i className="puce" style={{ background: "var(--accent)" }} />Motion design</span>
              <span><i className="puce" style={{ background: "color-mix(in srgb, var(--alerte) 40%, transparent)" }} />Trou &gt; écart maximum</span>
              <span style={{ marginLeft: "auto" }}>
                <kbd>←</kbd> <kbd>→</kbd> naviguer · <kbd>1</kbd> garder · <kbd>2</kbd> presque · <kbd>3</kbd> écarter
              </span>
            </div>
            {(() => {
              const restantes = plan.inserts.filter(i => i.moteur === "broll" && dec(i.n).etat !== "non" && !dec(i.n).images).length;
              const enCours = Object.values(generation).includes("en-cours");
              return restantes > 0 ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn" disabled={enCours} onClick={genererToutes}>
                    {enCours ? "Génération en cours…" : `Générer les vignettes B-roll · ${restantes} insert${restantes > 1 ? "s" : ""} × 3`}
                  </button>
                  <span className="muet" style={{ fontSize: 12 }}>
                    Les aperçus factices deviennent de vraies images. C'est l'étage bon marché — mais c'est une dépense, donc un clic.
                  </span>
                  {genErreur && <span style={{ color: "var(--alerte)", fontSize: 12 }}>{genErreur}</span>}
                </div>
              ) : null;
            })()}
          </div>

          <div id="production" />
          {plan.inserts.length > 0 && plan.inserts.every(i => i.moteur === "motion") && (
            <div className="carte" style={{ marginTop: 8, marginBottom: 14, borderColor: "var(--signal)" }}>
              <span className="eyebrow" style={{ color: "var(--signal)" }}>Aucun insert B-roll dans ce plan</span>
              <p style={{ marginTop: 8, fontSize: 14, maxWidth: "70ch" }}>
                Tous les inserts sont en motion design. Il n&apos;y a donc <b>aucune image à générer</b>, et
                sans image, <b>aucun clip</b> : l&apos;image-to-video ne concerne que les inserts B-roll.
                {(projet.cadrage.partBroll ?? 40) < 25
                  ? ` La cause est dans le cadrage : part de B-roll visée à ${projet.cadrage.partBroll} %.`
                  : " Le script a été jugé entièrement conceptuel — montez la part de B-roll visée pour forcer le modèle à chercher des scènes concrètes."}
              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn" disabled={analyse === "en-cours"}
                        onClick={() => { const cadrage = { ...projet.cadrage, partBroll: 40, plafond: Math.max(projet.cadrage.plafond, 30), dureeMax: Math.max(projet.cadrage.dureeMax, 8) };
                                         setProjet(p => ({ ...p, cadrage })); majProjet(projet.id, { cadrage }); lancerAnalyse(); }}>
                  Viser 40 % de B-roll et réanalyser
                </button>
                <span className="muet" style={{ fontSize: 12.5 }}>Vos décisions actuelles seront remplacées par le nouveau plan.</span>
              </div>
            </div>
          )}
          {(prodOuverte || projet.production) && (
            <Production projet={projet} plan={plan} dec={dec} vars={vars} gabaritPour={gabaritPour}
                        onMaj={prodn => { setProjet(p => ({ ...p, production: prodn })); majProjet(projet.id, { production: prodn }); }}
                        onFermer={() => setProdOuverte(false)} />
          )}
          <div className="planche">
            {plan.inserts.map(ins => {
              const d = dec(ins.n);
              return (
                <article key={ins.n} id={`insert-${ins.n}`}
                         className={"insert" + (ins.n === vise ? " vise" : "")}
                         data-etat={d.etat || ""}
                         onClick={() => setVise(ins.n)}>
                  <div>
                    <div className="rang">
                      <span className="num">{ins.n}</span>
                      <span className={"tag" + (ins.moteur === "motion" ? " motion" : "")}>
                        {ins.moteur === "motion" ? `Motion · ${LIBELLES[ins.forme as FormeMotion]?.nom || ins.forme}` : "B-roll"}
                      </span>
                      <span className="tc">{tc(ins.entree)} · {ins.duree}s</span>
                    </div>
                    <div className="replique">
                      {ins.texte.map((t, k) => (
                        <p key={k} className={/[A-ZÀ-Þ]{4,}/.test(t) ? "maj" : ""}>{t}</p>
                      ))}
                    </div>
                    <div className="jauges">
                      {([["score", "Score", ins.score],
                         ["", "Imageable", ins.imageabilite],
                         ["", "Abstrait", ins.abstraction]] as const).map(([cl, l, v]) => (
                        <div className={"jauge " + cl} key={l}>
                          <span>{l}</span><div><i style={{ width: `${v}%` }} /></div><b>{v}</b>
                        </div>
                      ))}
                    </div>
                    <p className="pourquoi">{ins.pourquoi}</p>
                  </div>

                  <div>
                    <div className="variantes">
                      {[0, 1, 2].map(i => (
                        <figure key={i}
                                className={"variante" + (d.variante === i ? " choisie" : "")}
                                onClick={() => majDec(ins.n, { variante: i })}>
                          <Vignette ins={ins} i={i} accent={projet.da.accent}
                                    gabarit={gabaritPour(ins.forme)} vars={vars}
                                    image={d.images?.[i] ?? null} />
                          <figcaption>
                            <span className="lettre">Variante {"ABC"[i]}</span>
                            {ins.moteur === "motion"
                              ? ["Fond clair", "Fond sombre", "Variante rythmique"][i]
                              : ins.variantes?.[i]}
                          </figcaption>
                        </figure>
                      ))}
                    </div>

                    {ins.moteur === "broll" && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                        <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }}
                                disabled={generation[ins.n] === "en-cours"}
                                onClick={e => { e.stopPropagation(); genererVignettes(ins.n); }}>
                          {generation[ins.n] === "en-cours" ? "Génération…"
                            : d.etat === "presque" && d.note?.trim() ? "Relancer avec la retouche"
                            : d.images ? "Régénérer les 3 vignettes" : "Générer les 3 vignettes"}
                        </button>
                        {generation[ins.n] === "erreur" && <span style={{ color: "var(--alerte)", fontSize: 12 }}>échec — voir le message en haut</span>}
                        {!d.images && <span className="muet" style={{ fontSize: 12 }}>aperçus factices tant que rien n&apos;est généré</span>}
                      </div>
                    )}
                    <div className="decision">
                      {([["oui", "Garder", "1"], ["presque", "Presque", "2"], ["non", "Écarter", "3"]] as const)
                        .map(([k, l, t]) => (
                          <button key={k} className={"etat " + k}
                                  aria-pressed={d.etat === k}
                                  onClick={() => majDec(ins.n, { etat: d.etat === k ? null : k })}>
                            {l} <kbd>{t}</kbd>
                          </button>
                        ))}
                    </div>

                    {(d.etat === "non" || d.etat === "presque") && (
                      <>
                        <div className="raison-titre">
                          Pourquoi — une raison qui revient dit que la charte est fausse
                        </div>
                        <div className="raisons">
                          {RAISONS.map(r => (
                            <button key={r} className="raison" aria-pressed={d.raisons.includes(r)}
                                    onClick={() => majDec(ins.n, {
                                      raisons: d.raisons.includes(r)
                                        ? d.raisons.filter(x => x !== r)
                                        : [...d.raisons, r],
                                    })}>
                              {r}
                            </button>
                          ))}
                        </div>
                        {d.etat === "presque" && (
                          <textarea className="champ retouche" value={d.note}
                                    placeholder="Ce qu'il faut changer pour la relance — facultatif"
                                    onChange={e => majDec(ins.n, { note: e.target.value })} />
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="sortie">
            <div className="compte">
              <span><b>{compte("oui")}</b> gardés</span>
              <span><b>{compte("presque")}</b> à relancer</span>
              <span><b>{compte("non")}</b> écartés</span>
              <span><b>{reste}</b> à trancher</span>
            </div>
            <div className="droite">
              <button className="btn fantome" onClick={produire}>Voir ce que reçoit la machine</button>
              <button className="btn" disabled={reste > 0 || compte("oui") === 0}
                      onClick={() => { setProdOuverte(true); document.getElementById("production")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
                {reste > 0 ? `Encore ${reste} à trancher`
                  : compte("oui") === 0 ? `Aucun insert gardé${compte("presque") ? ` · ${compte("presque")} à relancer` : ""}`
                  : projet.production ? "Voir la production" : `Lancer la production · ${compte("oui")} insert${compte("oui") > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </>
      )}

      <dialog ref={modale}>
        <div className="in">
          <span className="eyebrow">Charge utile transmise au moteur</span>
          <h2 style={{ margin: "8px 0 14px", fontSize: 22 }}>Ce que vos clics ont produit</h2>
          <pre>{charge}</pre>
          <button className="btn fantome" style={{ marginTop: 16 }}
                  onClick={() => modale.current?.close()}>Fermer</button>
        </div>
      </dialog>
    </div>
  );
}

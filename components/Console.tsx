"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { composer, analyser } from "@/lib/analyse";
import { derive, variables, type DA } from "@/lib/da";
import { majProjet, type Decision, type Etat, type Projet } from "@/lib/store";
import Vignette from "./Vignette";

const RAISONS = ["hors charte", "trop littéral", "mauvais sujet", "trop générique", "cadrage"];
const VIDE: Decision = { etat: null, variante: 0, raisons: [], note: "" };

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function Console({ initial }: { initial: Projet }) {
  const [projet, setProjet] = useState(initial);
  const [porte, setPorte] = useState<1 | 2 | 3>(1);
  const [vise, setVise] = useState(1);
  const [charge, setCharge] = useState<string | null>(null);
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

  async function lancerAnalyse() {
    setAnalyse("en-cours");
    try {
      const r = await fetch("/api/analyse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: projet.script, cadrage: projet.cadrage,
                               registre: projet.da.registre, titre: projet.titre }),
      });
      const c = await r.json();
      if (!r.ok) throw new Error(c.erreur || "Analyse impossible");
      const patch = { choix: c.choix, palier: c.palier, avertissement: c.avertissement || null,
                      titre: c.titre || projet.titre };
      setProjet(p => ({ ...p, ...patch }));
      majProjet(projet.id, patch);
      setAnalyse("repos");
    } catch { setAnalyse("erreur"); }
  }

  useEffect(() => { if (!projet.choix) lancerAnalyse(); /* eslint-disable-line */ }, []);

  async function extraireCharte(fichiers: FileList | File[]) {
    const liste = Array.from(fichiers);
    if (!liste.length) return;
    setCharteEtat("en-cours"); setCharteErreur(null);
    try {
      const corps = new FormData();
      liste.forEach(f => corps.append("fichiers", f));
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
      lancerAnalyse();
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
            {analyse === "en-cours" ? "analyse en cours…"
              : projet.palier === "modele" ? "jugé par le modèle"
              : analyse === "erreur" ? "analyse par modèle indisponible"
              : "analyse déterministe"}
          </span>
          <button className="btn fantome" disabled={analyse === "en-cours"} onClick={lancerAnalyse}>
            Réanalyser
          </button>
        </div>
      </header>

      <div className="etapes">
        {([[1, "Cadrage"], [2, "Direction artistique"], [3, "La planche"]] as const).map(([n, l]) => (
          <button key={n} aria-current={porte === n} onClick={() => setPorte(n)}>
            <span className="n">Porte {n}</span> {l}
          </button>
        ))}
      </div>

      {porte === 1 && (
        <div className="reglages">
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
        </div>
      )}

      {porte === 3 && (
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
          </div>

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
                        {ins.moteur === "motion" ? `Motion · ${ins.forme}` : "B-roll"}
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
                          <Vignette ins={ins} i={i} accent={projet.da.accent} />
                          <figcaption>
                            <span className="lettre">Variante {"ABC"[i]}</span>
                            {ins.moteur === "motion"
                              ? ["Fond clair", "Fond sombre", "Variante rythmique"][i]
                              : ins.variantes?.[i]}
                          </figcaption>
                        </figure>
                      ))}
                    </div>

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
              <button className="btn" disabled={reste > 0} onClick={produire}>
                {reste > 0 ? `Encore ${reste} à trancher` : `Lancer la production · ${compte("oui") + compte("presque")} inserts`}
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

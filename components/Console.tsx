"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { analyser } from "@/lib/analyse";
import { derive, variables } from "@/lib/da";
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

  const plan = useMemo(
    () => analyser(projet.script, projet.cadrage, projet.da.registre, projet.titre),
    [projet.script, projet.cadrage, projet.da.registre, projet.titre],
  );

  const dec = (n: number): Decision => projet.decisions[n] || VIDE;

  function majDec(n: number, patch: Partial<Decision>) {
    const decisions = { ...projet.decisions, [n]: { ...dec(n), ...patch } };
    setProjet(p => ({ ...p, decisions }));
    majProjet(projet.id, { decisions });
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

  const conformite = derive(projet.da.accent, "#A8CB77");

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
            <span className="eyebrow">Charte du projet</span>
            <h3 style={{ marginTop: 8 }}>{projet.da.nom}</h3>
            <div className="nuancier">
              {([["Fond", projet.da.fond, projet.da.encre],
                 ["Encre", projet.da.encre, "#fff"],
                 ["Accent", projet.da.accent, projet.da.fondSombre],
                 ["Secondaire", projet.da.secondaire, "#fff"]] as const).map(([l, c, t]) => (
                <div className="teinte" key={l} style={{ background: c, color: t }}>
                  <span>{l}</span><b>{c.toUpperCase()}</b>
                </div>
              ))}
            </div>
            <p className="pourquoi">
              La charte est une donnée du projet, pas du code. Elle sera extraite de votre
              moodboard : captures de typographies, rendus repérés ailleurs, photos de référence.
            </p>
            <label className="eyebrow" style={{ display: "block", marginTop: 16 }}>Registre visuel des B-roll</label>
            <input className="champ" style={{ marginTop: 8 }} value={projet.da.registre}
                   onChange={e => {
                     const da = { ...projet.da, registre: e.target.value };
                     setProjet(p => ({ ...p, da }));
                     majProjet(projet.id, { da });
                   }} />
          </div>

          <div className="carte">
            <span className="eyebrow">Contrôle de conformité</span>
            <p className="pourquoi" style={{ marginTop: 8 }}>
              Le modèle approxime la charte, il ne la respecte pas. Mesuré sur un rendu de
              référence, contre l&apos;accent attendu :
            </p>
            <div className="controle">
              <div className="l">
                <span>Teinte</span>
                <span className="mono muet">{conformite.teinte.attendu}° attendu · {conformite.teinte.mesure}° mesuré</span>
                <span className={"etatp " + (conformite.teinte.ok ? "ok" : "ko")}>
                  {conformite.teinte.ok ? "conforme" : "dérive"}
                </span>
              </div>
              <div className="l">
                <span>Saturation</span>
                <span className="mono muet">{conformite.saturation.attendu} % attendu · {conformite.saturation.mesure} % mesuré</span>
                <span className={"etatp " + (conformite.saturation.ok ? "ok" : "ko")}>
                  {conformite.saturation.ok ? "conforme" : "dérive"}
                </span>
              </div>
            </div>
            <p className="pourquoi">
              D&apos;où la passe de mise en charte après génération : chaque clip est recalé sur
              la palette avant d&apos;entrer dans le dossier. Sans elle, tous les plans sont
              légèrement hors charte — invisible plan par plan, sensible sur quinze minutes.
            </p>
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

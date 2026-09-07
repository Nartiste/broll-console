"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Plan } from "@/lib/analyse";
import { DUREE_ANIMATION, dureeDe, document as documentGabarit, type Gabarit } from "@/lib/gabarits";
import { TARIFS } from "@/lib/tarifs";
import { cle, deposer, enCache, recuperer, rendre, telecharger } from "@/lib/rendus";
import type { ArticleProd, Decision, Production as Prod, Projet } from "@/lib/store";

const slug = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "insert";

const PILULE: Record<ArticleProd["statut"], [string, string]> = {
  "attente":   ["à lancer", "var(--encre-2)"],
  "file":      ["en file", "var(--signal)"],
  "en-cours":  ["en cours", "var(--signal)"],
  "pret":      ["prêt", "var(--accent)"],
  "echec":     ["échec", "var(--alerte)"],
  "sans-objet":["pas de fichier", "var(--encre-3)"],
};

/**
 * La production : la seule étape qui dépense pour de bon.
 *
 * On part des inserts GARDÉS. Les B-roll deviennent des tâches Seedance —
 * avec la vignette validée en référence, pour que le clip ressemble à ce qui
 * a été approuvé. Les gabarits — sur mesure ou intégrés — se rendent en .mov
 * à fond transparent dès que la production existe, et chaque fichier se
 * télécharge dès qu'il est prêt.
 *
 * Tout est confirmé avant : nombre de clips, secondes, ordre de grandeur.
 */
export default function Production({ projet, plan, dec, vars, gabaritPour, onMaj, onFermer }: {
  projet: Projet; plan: Plan; dec: (n: number) => Decision; vars: Record<string, string>;
  gabaritPour: (forme: string) => Gabarit | undefined;
  onMaj: (p: Prod) => void; onFermer: () => void;
}) {
  const [resolution, setResolution] = useState(projet.production?.resolution || "720p");
  const [lancement, setLancement] = useState<"repos" | "en-cours" | "erreur">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const [zip, setZip] = useState<"repos" | "en-cours">("repos");
  const [etapeZip, setEtapeZip] = useState("");
  const prod = projet.production;

  /* Ce qui partirait si on lançait maintenant — recalculé à chaque tri. */
  const candidats = useMemo<ArticleProd[]>(() => {
    const gardes = plan.inserts.filter(i => dec(i.n).etat === "oui");
    return gardes.map((i, k) => {
      const d = dec(i.n);
      const moteur = d.moteur || i.moteur;   // le choix de l'auteur l'emporte
      const base = { n: i.n, fichier: `${String(k + 1).padStart(2, "0")}-${slug(i.texte[0] || "")}`,
                     moteur, forme: i.forme, duree: i.duree };
      if (moteur === "broll") {
        return { ...base, statut: "attente" as const,
                 prompt: i.variantes?.[d.variante] || i.variantes?.[0] || i.texte.join(" "),
                 mouvement: d.mouvement?.trim() || i.mouvement || "",
                 image: d.images?.[d.variante] || null };
      }
      const g = gabaritPour(i.forme);
      // Le gabarit part animé et sur fond transparent : c'est ce que le
      // rendu fige image par image, et ce que le montage superpose au plan.
      return g
        ? { ...base, statut: "pret" as const, dureeAnim: dureeDe(g),
            html: documentGabarit(g, i.params || {}, vars, false, { anime: true, transparent: true }) }
        : { ...base, statut: "sans-objet" as const, erreur: "Forme inconnue : aucun gabarit ne sait la porter." };
    });
  }, [plan, dec, vars, gabaritPour]);

  const clips = candidats.filter(c => c.moteur === "broll");
  const secondes = clips.reduce((t, c) => t + Math.max(4, Math.min(15, Math.round(c.duree))), 0);
  const cout = secondes * (TARIFS.video[resolution] ?? TARIFS.video["720p"]);
  const sansImage = clips.filter(c => !c.image).length;

  async function lancer() {
    // Sans B-roll, rien n'est facturé : la production, ce sont les gabarits à rendre.
    if (!clips.length) { onMaj({ lancee: Date.now(), resolution, articles: candidats }); return; }
    if (!confirm(`Lancer ${clips.length} clip${clips.length > 1 ? "s" : ""} Seedance en ${resolution} — ${secondes} secondes de vidéo, ordre de grandeur ${cout.toFixed(2)} $ hors quota gratuit ?`)) return;
    setLancement("en-cours"); setErreur(null);
    try {
      const r = await fetch("/api/production", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, articles: clips.map(c => ({ n: c.n, prompt: c.prompt, mouvement: c.mouvement, image: c.image, duree: c.duree })) }),
      });
      const c = await r.json();
      if (!r.ok) throw new Error(c.erreur || "Lancement impossible");
      const parN = new Map<number, { tache?: string; erreur?: string }>((c.resultats as any[]).map(x => [x.n, x]));
      const articles: ArticleProd[] = candidats.map(a => {
        if (a.moteur !== "broll") return a;
        const x = parN.get(a.n);
        return x?.tache ? { ...a, statut: "file", tache: x.tache } : { ...a, statut: "echec", erreur: x?.erreur || "Refusé" };
      });
      onMaj({ lancee: Date.now(), resolution: c.resolution || resolution, articles });
      setLancement("repos");
    } catch (e) { setLancement("erreur"); setErreur(e instanceof Error ? e.message : "Lancement impossible"); }
  }

  /* Suivi : tant qu'un clip est en file ou en cours, on interroge toutes les dix secondes. */
  useEffect(() => {
    if (!prod) return;
    const actifs = prod.articles.filter(a => a.tache && (a.statut === "file" || a.statut === "en-cours"));
    if (!actifs.length) return;
    let arret = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/production/etat?ids=${actifs.map(a => a.tache).join(",")}`, { cache: "no-store" });
        const c = await r.json();
        if (arret || !r.ok) return;
        const parId = new Map<string, any>((c.etats as any[]).map(e => [e.id, e]));
        const articles = prod.articles.map(a => {
          const e = a.tache ? parId.get(a.tache) : null;
          if (!e) return a;
          if (e.statut === "succeeded") return { ...a, statut: "pret" as const, video: e.video || a.video };
          if (e.statut === "failed" || e.statut === "cancelled") return { ...a, statut: "echec" as const, erreur: e.erreur || e.statut };
          if (e.statut === "running") return { ...a, statut: "en-cours" as const };
          return a;
        });
        onMaj({ ...prod, articles });
      } catch { /* on réessaie au prochain tick */ }
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => { arret = true; clearInterval(t); };
  }, [prod?.lancee, prod?.articles.map(a => a.statut).join(","), prod?.articles.length]);

  /* Les gabarits se rendent dès que la production existe, un par un — deux
     de front se partagent le même serveur et dépassent tous deux le délai —,
     sans qu'on le demande : un fichier prêt est un fichier téléchargeable.
     Le résultat est gardé en mémoire, et déposé sur le compte s'il y en a un. */
  const [rendus, setRendus] = useState<Record<string, "en-cours" | "pret" | "echec" | undefined>>({});
  const [tour, setTour] = useState(0);
  const lances = useRef(new Set<string>());
  const prodRef = useRef(prod); prodRef.current = prod;
  useEffect(() => {
    if (!prod) return;
    setRendus(q => {
      const n = { ...q };
      for (const a of prod.articles) if (a.html && (enCache(cle(projet.id, a.fichier)) || a.movChemin) && n[a.fichier] !== "en-cours") n[a.fichier] = "pret";
      return n;
    });
    const file = prod.articles.filter(a => a.html && !enCache(cle(projet.id, a.fichier)) && !a.movChemin && !lances.current.has(a.fichier));
    let i = 0;
    const suivant = async (): Promise<void> => {
      const a = file[i++];
      if (!a || !a.html) return;
      lances.current.add(a.fichier);
      setRendus(q => ({ ...q, [a.fichier]: "en-cours" }));
      try {
        const f = await rendre(projet.id, { html: a.html, fichier: a.fichier, duree: a.dureeAnim || DUREE_ANIMATION });
        setRendus(q => ({ ...q, [a.fichier]: "pret" }));
        const chemins = await deposer(projet.id, a.fichier, f);
        const courant = prodRef.current;
        if (chemins && courant) {
          onMaj({ ...courant, articles: courant.articles.map(x => x.fichier === a.fichier ? { ...x, movChemin: chemins.mov, pngChemin: chemins.png } : x) });
        }
      } catch {
        setRendus(q => ({ ...q, [a.fichier]: "echec" }));
        lances.current.delete(a.fichier);
      }
      await suivant();
    };
    suivant();
  }, [prod?.lancee, prod?.articles.length, tour]);

  /** Les fichiers d'un gabarit : de la mémoire, sinon du compte, sinon rendus maintenant. */
  async function fichiersDe(a: ArticleProd): Promise<{ mov: Blob; png?: Blob; zip?: Blob } | null> {
    const c = enCache(cle(projet.id, a.fichier));
    if (c) return c;
    if (a.movChemin) {
      const mov = await recuperer(a.movChemin);
      if (mov) return { mov, png: a.pngChemin ? (await recuperer(a.pngChemin)) || undefined : undefined };
    }
    if (!a.html) return null;
    setRendus(q => ({ ...q, [a.fichier]: "en-cours" }));
    try {
      const f = await rendre(projet.id, { html: a.html, fichier: a.fichier, duree: a.dureeAnim || DUREE_ANIMATION });
      setRendus(q => ({ ...q, [a.fichier]: "pret" }));
      return f;
    } catch {
      setRendus(q => ({ ...q, [a.fichier]: "echec" }));
      return null;
    }
  }
  const relancer = (a: ArticleProd) => { lances.current.delete(a.fichier); setRendus(q => ({ ...q, [a.fichier]: undefined })); setTour(t => t + 1); };

  /* Le dossier est fait pour Premiere, pas pour l'archivage : ce qu'on pose
     sur la timeline est au premier niveau, numéroté dans l'ordre du script,
     un seul fichier par insert. Le reste (image fixe, version plein cadre,
     séquence PNG) est rangé à part, hors du chemin. */
  async function telechargerDossier() {
    if (!prod) return;
    setZip("en-cours");
    try {
      const JSZip = (await import("jszip")).default;
      const z = new JSZip();
      const timeline: string[] = [];
      const timecode = (n: number) => { const i = plan.inserts.find(x => x.n === n); if (!i) return "     "; const t = i.entree; return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`; };
      for (const a of prod.articles) {
        if (a.statut === "pret" && a.video) {
          const r = await fetch(`/api/production/fichier?url=${encodeURIComponent(a.video)}&nom=${a.fichier}.mp4`);
          if (r.ok) {
            z.file(`01-TIMELINE/${a.fichier}.mp4`, await r.blob());
            timeline.push(`${timecode(a.n)}  ${a.fichier}.mp4  ·  B-roll ${a.duree} s  ·  piste V2, en coupe sur le plan`);
          }
        } else if (a.html) {
          setEtapeZip(`${a.fichier}…`);
          const f = await fichiersDe(a);
          if (!f) {
            z.file(`03-SOURCES/${a.fichier}/${a.fichier}.html`, a.html);
            timeline.push(`${timecode(a.n)}  ${a.fichier}  ·  motion  ·  RENDU IMPOSSIBLE, HTML dans 03-SOURCES`);
            continue;
          }
          z.file(`01-TIMELINE/${a.fichier}.mov`, f.mov);
          if (f.png) z.file(`02-IMAGES-FIXES/${a.fichier}.png`, f.png);
          if (f.zip) {
            const sous = await JSZip.loadAsync(f.zip);
            await Promise.all(Object.values(sous.files).map(async x => {
              if (x.dir || x.name.endsWith(".mov") || x.name.endsWith("_LISEZMOI.txt") || /^[^/]+\.png$/.test(x.name)) return;
              z.file(`03-SOURCES/${x.name}`, await x.async("blob"));
            }));
          }
          timeline.push(`${timecode(a.n)}  ${a.fichier}.mov  ·  motion ${a.dureeAnim || DUREE_ANIMATION} s  ·  piste V3, PAR-DESSUS le plan (fond transparent)`);
        }
      }
      z.file("00-LISEZMOI.txt",
        `${projet.titre}\n${"=".repeat(projet.titre.length)}\n\n` +
        `01-TIMELINE/        Ce que vous posez sur la timeline. Un fichier par insert, numéroté dans l'ordre du script.\n` +
        `                    .mp4 = B-roll généré, à poser en coupe (V2). .mov = motion à fond transparent, à poser par-dessus (V3).\n` +
        `02-IMAGES-FIXES/    L'état final de chaque motion, en PNG transparent : à poser juste après le .mov pour le tenir plus longtemps.\n` +
        `03-SOURCES/         Pour aller plus loin : version plein cadre (avec fond), séquences PNG image par image, HTML.\n\n` +
        `Premiere : Fichier → Importer → sélectionnez tout 01-TIMELINE. Les .mov ont un canal alpha direct, rien à régler.\n` +
        `Timecode = début de l'insert dans le script (à la vitesse de lecture estimée). Ajustez à l'oreille.\n\n` +
        `ORDRE DE MONTAGE\n${"-".repeat(16)}\n${timeline.join("\n")}\n`);
      const blob = await z.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `${slug(projet.titre)}-broll.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } finally { setZip("repos"); setEtapeZip(""); }
  }

  const prets = prod?.articles.filter(a => a.statut === "pret").length || 0;
  const enCours = prod?.articles.filter(a => a.statut === "file" || a.statut === "en-cours").length || 0;

  return (
    <div className="carte" style={{ marginTop: 8, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span className="eyebrow">Production</span>
          <h3 style={{ marginTop: 6 }}>{prod ? "Vos fichiers" : "Ce qui va partir"}</h3>
        </div>
        <button className="btn fantome" style={{ marginLeft: "auto" }} onClick={onFermer}>Fermer</button>
      </div>

      {!prod && (
        <>
          <div className="devis" style={{ marginTop: 14, borderRadius: 14, padding: 16 }}>
            <div className="l"><span>Inserts gardés</span><b>{candidats.length}</b></div>
            <div className="l"><span>Clips Seedance à lancer</span><b>{clips.length}</b></div>
            <div className="l"><span>Secondes de vidéo (4 à 15 s par clip)</span><b>{secondes} s</b></div>
            <div className="l"><span>Résolution</span>
              <select className="champ" style={{ width: "auto", padding: "6px 10px" }} value={resolution} onChange={e => setResolution(e.target.value)}>
                {["480p", "720p", "1080p"].map(r => <option key={r} value={r}>{r} · ≈ {TARIFS.video[r].toFixed(2)} $/s</option>)}
              </select>
            </div>
            <div className="l"><span>Ordre de grandeur</span><b>≈ {cout.toFixed(2)} $</b></div>
            <div className="l"><span>Gabarits motion, rendus en .mov à fond transparent</span><b>{candidats.filter(c => c.html).length}</b></div>
          </div>
          {sansImage > 0 && (
            <p className="pourquoi" style={{ color: "var(--signal)" }}>
              {sansImage} clip{sansImage > 1 ? "s" : ""} sans vignette validée : Seedance partira du prompt seul. Pour que le clip ressemble à ce que vous avez vu, générez les vignettes d&apos;abord.
            </p>
          )}
          {erreur && <p style={{ color: "var(--alerte)", marginTop: 10, fontSize: 13 }}>{erreur}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" disabled={lancement === "en-cours" || !candidats.length} onClick={lancer}>
              {lancement === "en-cours" ? "Envoi à Seedance…" : clips.length ? `Lancer ${clips.length} clip${clips.length > 1 ? "s" : ""}` : `Rendre ${candidats.length} gabarit${candidats.length > 1 ? "s" : ""}`}
            </button>
            <span className="muet" style={{ fontSize: 12.5 }}>C&apos;est ici que l&apos;argent part. Rien avant ce clic.</span>
          </div>
        </>
      )}

      {prod && (
        <>
          <div className="chiffres mono muet" style={{ display: "flex", gap: 14, fontSize: 12, marginTop: 8 }}>
            <span>lancée {new Date(prod.lancee).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            <span>{prod.resolution}</span>
            <span>{prets} prêt{prets > 1 ? "s" : ""}</span>
            <span>{enCours} en cours{enCours ? " · vérification toutes les 10 s" : ""}</span>
            {prod.articles.some(a => a.html) && <span>gabarits rendus {prod.articles.filter(a => a.html && rendus[a.fichier] === "pret").length}/{prod.articles.filter(a => a.html).length}</span>}
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {prod.articles.map(a => (
              <div key={a.n} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 120px auto", gap: 14, alignItems: "center",
                                       padding: "10px 12px", border: "1px solid var(--trait)", borderRadius: 12, background: "var(--surface-2)" }}>
                <div>
                  <div className="mono" style={{ fontSize: 12.5 }}>{a.fichier}.{a.moteur === "broll" ? "mp4" : "mov"}</div>
                  <div className="muet" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {a.moteur === "broll" ? `B-roll · ${a.duree}s${a.image ? " · depuis la vignette validée" : " · depuis le prompt seul"}` : `Motion · ${a.forme}${a.html ? ` · ${a.dureeAnim || DUREE_ANIMATION} s · .mov à fond transparent` : ""}`}
                    {a.erreur && <span style={{ color: a.statut === "echec" ? "var(--alerte)" : "var(--encre-3)" }}> — {a.erreur}</span>}
                  </div>
                </div>
                {(() => {
                  const e = a.html ? (rendus[a.fichier] === "pret" ? "pret" : rendus[a.fichier] === "echec" ? "echec" : "en-cours") : a.statut;
                  const [texte, couleur] = e === "en-cours" && a.html ? ["rendu…", "var(--signal)"] : PILULE[e];
                  return <span className="pilule" style={{ justifySelf: "start", color: couleur, borderColor: couleur }}>{texte}</span>;
                })()}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {a.video && <video src={a.video} controls preload="metadata" style={{ width: 160, borderRadius: 8, background: "#000" }} />}
                  {a.video && <a className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }}
                                 href={`/api/production/fichier?url=${encodeURIComponent(a.video)}&nom=${a.fichier}.mp4`}>Télécharger</a>}
                  {a.html && (
                    rendus[a.fichier] === "pret" ? (
                      <>
                        <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }}
                                onClick={async () => { const f = await fichiersDe(a); if (f) telecharger(f.mov, `${a.fichier}.mov`); }}>
                          Télécharger .mov
                        </button>
                        <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }} title="L'état final, en PNG transparent"
                                onClick={async () => { const f = await fichiersDe(a); if (f?.png) telecharger(f.png, `${a.fichier}.png`); }}>
                          Image fixe
                        </button>
                      </>
                    ) : rendus[a.fichier] === "echec" ? (
                      <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }} onClick={() => relancer(a)}>Réessayer le rendu</button>
                    ) : (
                      <span className="muet mono" style={{ fontSize: 12 }}>rendu en cours · jusqu'à 3 min</span>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" disabled={zip === "en-cours" || (prets === 0 && !prod.articles.some(a => a.html))} onClick={telechargerDossier}>
              {zip === "en-cours" ? (etapeZip || "Assemblage du dossier…") : "Télécharger le dossier"}
            </button>
            <span className="muet" style={{ fontSize: 12.5 }}>01-TIMELINE (un fichier par insert, dans l'ordre), 02-IMAGES-FIXES, 03-SOURCES, et un LISEZMOI avec l'ordre de montage. Les fichiers déjà rendus ne sont pas refaits.</span>
            <button className="btn fantome" style={{ marginLeft: "auto" }} onClick={() => { if (confirm("Oublier cette production et repartir du tri ?")) onMaj(undefined as any); }}>
              Nouvelle production
            </button>
          </div>
        </>
      )}
    </div>
  );
}

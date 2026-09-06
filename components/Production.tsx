"use client";

import { useEffect, useMemo, useState } from "react";
import type { Plan } from "@/lib/analyse";
import { document as documentGabarit, type Gabarit } from "@/lib/gabarits";
import { TARIFS } from "@/lib/tarifs";
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
 * a été approuvé. Les gabarits sur mesure sont livrés en HTML autonome ; les
 * gabarits intégrés n'ont pas encore de fichier (le rendu vidéo des gabarits
 * est la brique suivante), et on le dit plutôt que de livrer du vide.
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
  const prod = projet.production;

  /* Ce qui partirait si on lançait maintenant — recalculé à chaque tri. */
  const candidats = useMemo<ArticleProd[]>(() => {
    const gardes = plan.inserts.filter(i => dec(i.n).etat === "oui");
    return gardes.map((i, k) => {
      const d = dec(i.n);
      const base = { n: i.n, fichier: `${String(k + 1).padStart(2, "0")}-${slug(i.texte[0] || "")}`,
                     moteur: i.moteur, forme: i.forme, duree: i.duree };
      if (i.moteur === "broll") {
        return { ...base, statut: "attente" as const,
                 prompt: i.variantes?.[d.variante] || i.variantes?.[0] || i.texte.join(" "),
                 image: d.images?.[d.variante] || null };
      }
      const g = gabaritPour(i.forme);
      return g
        ? { ...base, statut: "pret" as const, html: documentGabarit(g, i.params || {}, vars) }
        : { ...base, statut: "sans-objet" as const, erreur: "Gabarit intégré : rendu vidéo à venir. Le contenu est dans « ce que reçoit la machine »." };
    });
  }, [plan, dec, vars, gabaritPour]);

  const clips = candidats.filter(c => c.moteur === "broll");
  const secondes = clips.reduce((t, c) => t + Math.max(4, Math.min(15, Math.round(c.duree))), 0);
  const cout = secondes * (TARIFS.video[resolution] ?? TARIFS.video["720p"]);
  const sansImage = clips.filter(c => !c.image).length;

  async function lancer() {
    if (!clips.length) return;
    if (!confirm(`Lancer ${clips.length} clip${clips.length > 1 ? "s" : ""} Seedance en ${resolution} — ${secondes} secondes de vidéo, ordre de grandeur ${cout.toFixed(2)} $ hors quota gratuit ?`)) return;
    setLancement("en-cours"); setErreur(null);
    try {
      const r = await fetch("/api/production", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, articles: clips.map(c => ({ n: c.n, prompt: c.prompt, image: c.image, duree: c.duree })) }),
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

  async function telechargerDossier() {
    if (!prod) return;
    setZip("en-cours");
    try {
      const JSZip = (await import("jszip")).default;
      const z = new JSZip();
      const lignes: string[] = [];
      for (const a of prod.articles) {
        if (a.statut === "pret" && a.video) {
          const r = await fetch(`/api/production/fichier?url=${encodeURIComponent(a.video)}&nom=${a.fichier}.mp4`);
          if (r.ok) { z.file(`${a.fichier}.mp4`, await r.blob()); lignes.push(`${a.fichier}.mp4  ·  B-roll  ·  ${a.duree}s`); }
        } else if (a.html) {
          z.file(`${a.fichier}.html`, a.html); lignes.push(`${a.fichier}.html  ·  motion (gabarit sur mesure, 16:9, ouvrir dans un navigateur)`);
        }
      }
      z.file("00-ORDRE.txt", `${projet.titre}\n\nFichiers en ordre de script — descendez le dossier en descendant la timeline.\n\n${lignes.join("\n")}\n`);
      const blob = await z.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `${slug(projet.titre)}-broll.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } finally { setZip("repos"); }
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
            <div className="l"><span>Gabarits sur mesure livrés en HTML</span><b>{candidats.filter(c => c.html).length}</b></div>
            <div className="l"><span>Gabarits intégrés (pas de fichier encore)</span><b>{candidats.filter(c => c.statut === "sans-objet").length}</b></div>
          </div>
          {sansImage > 0 && (
            <p className="pourquoi" style={{ color: "var(--signal)" }}>
              {sansImage} clip{sansImage > 1 ? "s" : ""} sans vignette validée : Seedance partira du prompt seul. Pour que le clip ressemble à ce que vous avez vu, générez les vignettes d&apos;abord.
            </p>
          )}
          {erreur && <p style={{ color: "var(--alerte)", marginTop: 10, fontSize: 13 }}>{erreur}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" disabled={!clips.length || lancement === "en-cours"} onClick={lancer}>
              {lancement === "en-cours" ? "Envoi à Seedance…" : clips.length ? `Lancer ${clips.length} clip${clips.length > 1 ? "s" : ""}` : "Aucun clip B-roll gardé"}
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
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {prod.articles.map(a => (
              <div key={a.n} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 120px auto", gap: 14, alignItems: "center",
                                       padding: "10px 12px", border: "1px solid var(--trait)", borderRadius: 12, background: "var(--surface-2)" }}>
                <div>
                  <div className="mono" style={{ fontSize: 12.5 }}>{a.fichier}.{a.moteur === "broll" ? "mp4" : "html"}</div>
                  <div className="muet" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {a.moteur === "broll" ? `B-roll · ${a.duree}s${a.image ? " · depuis la vignette validée" : " · depuis le prompt seul"}` : `Motion · ${a.forme}`}
                    {a.erreur && <span style={{ color: a.statut === "echec" ? "var(--alerte)" : "var(--encre-3)" }}> — {a.erreur}</span>}
                  </div>
                </div>
                <span className="pilule" style={{ justifySelf: "start", color: PILULE[a.statut][1], borderColor: PILULE[a.statut][1] }}>{PILULE[a.statut][0]}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {a.video && <video src={a.video} controls preload="metadata" style={{ width: 160, borderRadius: 8, background: "#000" }} />}
                  {a.video && <a className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }}
                                 href={`/api/production/fichier?url=${encodeURIComponent(a.video)}&nom=${a.fichier}.mp4`}>Télécharger</a>}
                  {a.html && <a className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }}
                                href={`data:text/html;charset=utf-8,${encodeURIComponent(a.html)}`} download={`${a.fichier}.html`}>Télécharger</a>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" disabled={zip === "en-cours" || (prets === 0 && !prod.articles.some(a => a.html))} onClick={telechargerDossier}>
              {zip === "en-cours" ? "Assemblage du dossier…" : "Télécharger le dossier"}
            </button>
            <span className="muet" style={{ fontSize: 12.5 }}>Numéroté en ordre de script, avec un fichier 00-ORDRE.txt. Plus qu&apos;à poser sur la timeline.</span>
            <button className="btn fantome" style={{ marginLeft: "auto" }} onClick={() => { if (confirm("Oublier cette production et repartir du tri ?")) onMaj(undefined as any); }}>
              Nouvelle production
            </button>
          </div>
        </>
      )}
    </div>
  );
}

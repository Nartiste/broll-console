"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { paramsPour, type Plan } from "@/lib/analyse";
import { DUREE_ANIMATION, LIBELLES, dureeDe, document as documentGabarit, type Gabarit } from "@/lib/gabarits";
import { TARIFS } from "@/lib/tarifs";
import { cle, deposer, empreinteRendu, enCache, recuperer, rendre, telecharger, type ModeRendu } from "@/lib/rendus";
import { appelApi, lireJson } from "@/lib/api-client";
import GabaritApercu from "./GabaritApercu";
import { ancrer, blobDepuis, estDurable, expiree } from "@/lib/medias";
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
  const prodRef = useRef(prod); prodRef.current = prod;

  /* Ce qui partirait si on lançait maintenant — recalculé à chaque tri. */
  const candidats = useMemo<ArticleProd[]>(() => {
    const gardes = plan.inserts.filter(i => dec(i.bloc).etat === "oui");
    return gardes.map((i, k) => {
      const d = dec(i.bloc);
      const moteur = d.moteur || i.moteur;   // le choix de l'auteur l'emporte
      const forme = (d.forme as string) || (i.forme !== "scene" ? i.forme : "mot-choc");
      const base = { n: i.n, bloc: i.bloc, fichier: `${String(k + 1).padStart(2, "0")}-${slug(i.texte[0] || "")}`,
                     moteur, forme, duree: i.duree };
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

  /* Un article motion n'est jamais figé : son HTML se recalcule à chaque fois
     à partir du gabarit et du contenu actuels. Le gabarit change, le rendu suit. */
  /* Le passage d'un article : par bloc de script quand on l'a, sinon par le
     texte du nom de fichier (productions d'avant), le rang en dernier recours —
     il change dès que le plan se recompose. */
  const insertDe = (a: ArticleProd) => {
    if (a.bloc !== undefined) { const i = plan.inserts.find(x => x.bloc === a.bloc); if (i) return i; }
    // Une même première ligne peut revenir deux fois dans un script : on
    // préfère le passage de la même forme, puis celui qui a du contenu.
    const texte = a.fichier.replace(/^\d+-/, "");
    const memes = plan.inserts.filter(x => slug(x.texte[0] || "") === texte);
    return memes.find(x => x.forme === a.forme && x.params) || memes.find(x => x.params) || memes[0] || plan.inserts.find(x => x.n === a.n);
  };
  /* Les productions d'avant n'avaient pas le bloc : on le fixe une fois pour toutes. */
  useEffect(() => {
    if (!prod || !prod.articles.some(a => a.bloc === undefined)) return;
    const articles = prod.articles.map(a => a.bloc === undefined ? { ...a, bloc: insertDe(a)?.bloc } : a);
    if (articles.some((a, k) => a.bloc !== prod.articles[k].bloc)) onMaj({ ...prod, articles });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod?.lancee, plan]);
  /* La variante choisie sur la planche dit tout : A fond clair, B fond sombre,
     C fond transparent (le composant seul, à poser sur le plan face caméra). */
  const CARTES = ["clair", "sombre", "clair"] as const;
  const modeDe = (a: ArticleProd): ModeRendu => { const i = insertDe(a); return i && dec(i.bloc).variante === 2 ? "transparent" : "plein"; };
  const vivant = (a: ArticleProd): { html: string; duree: number; empreinte: string } | null => {
    if (a.moteur !== "motion") return null;
    const g = gabaritPour(a.forme);
    const i = insertDe(a);
    const mode = modeDe(a);
    if (g && i) {
      const d = dec(i.bloc);
      const variante = CARTES[d.variante] || "clair";
      // Un passage dont l'analyse n'a pas donné les paramètres de cette forme
      // (moteur ou forme changés après coup) reçoit une lecture de son texte.
      // Les paramètres de l'analyse ne valent que pour la forme qu'elle avait choisie :
      // si l'auteur a imposé une autre forme, on relit le texte pour celle-ci.
      const params = i.forme === a.forme && i.params && Object.keys(i.params).length ? i.params : paramsPour(a.forme as any, i.texte, i.section);
      const html = documentGabarit(g, params, vars, variante, { anime: true, transparent: mode === "transparent" });
      return { html, duree: dureeDe(g), empreinte: empreinteRendu(html, mode) };
    }
    return a.html ? { html: a.html, duree: a.dureeAnim || DUREE_ANIMATION, empreinte: empreinteRendu(a.html, mode) } : null;
  };
  const vivants = useMemo(() => {
    const m: Record<string, ReturnType<typeof vivant>> = {};
    for (const a of prod?.articles || []) m[a.fichier] = vivant(a);
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod?.articles, plan, vars, gabaritPour, projet.decisions]);
  const disponible = (a: ArticleProd) => {
    const v = vivants[a.fichier];
    return Boolean(v && (enCache(cle(projet.id, a.fichier), v.empreinte) || (a.movChemin && a.empreinte === v.empreinte)));
  };

  /* Gardé après le lancement : la production est un instantané, on propose d'y ajouter. */
  const nouveaux = useMemo(() => {
    if (!prod) return [] as ArticleProd[];
    const dedans = new Set<number | undefined>(prod.articles.map(a => a.bloc ?? insertDe(a)?.bloc));
    return candidats.filter(c => !dedans.has(c.bloc));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod?.articles, candidats, plan]);
  // Un insert gardé après le lancement rejoint la production de lui-même :
  // les gabarits se rendent, les B-roll attendent le bouton « Lancer ces clips ».
  useEffect(() => { if (nouveaux.length) ajouterNouveaux(); // eslint-disable-line react-hooks/exhaustive-deps
  }, [nouveaux.length]);
  /* Tant qu'un article n'est pas parti (clip en attente, gabarit non lancé), il
     suit la planche : moteur, variante, image de référence, prompt, mouvement.
     Ce qui a été lancé reste ce qu'il est. */
  useEffect(() => {
    if (!prod) return;
    let change = false;
    const articles = prod.articles.map(a => {
      if (a.tache || (a.moteur === "broll" && a.statut !== "attente")) return a;
      const c = candidats.find(x => x.bloc === (a.bloc ?? insertDe(a)?.bloc));
      if (!c) return a;
      const suivi = { moteur: c.moteur, forme: c.forme, prompt: c.prompt, mouvement: c.mouvement, image: c.image, duree: c.duree,
                      statut: c.moteur === "broll" ? "attente" as const : "pret" as const };
      const differe = (Object.keys(suivi) as (keyof typeof suivi)[]).some(k => (a as any)[k] !== (suivi as any)[k]);
      if (!differe) return a;
      change = true;
      return { ...a, ...suivi, video: undefined, erreur: undefined };
    });
    if (change) onMaj({ ...prod, articles });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidats, prod?.articles.length]);
  function ajouterNouveaux() {
    if (!prod || !nouveaux.length) return;
    const k0 = prod.articles.length;
    const ajout = nouveaux.map((c, k) => ({ ...c, fichier: `${String(k0 + k + 1).padStart(2, "0")}-${c.fichier.replace(/^\d+-/, "")}` }));
    onMaj({ ...prod, articles: [...prod.articles, ...ajout] });
  }
  async function lancerAttente(seulement?: ArticleProd) {
    if (!prod) return;
    const attente = prod.articles.filter(a => a.moteur === "broll" && a.statut === "attente" && (!seulement || a.fichier === seulement.fichier));
    if (!attente.length) return;
    const sec = attente.reduce((t, c) => t + Math.max(4, Math.min(15, Math.round(c.duree))), 0);
    if (!confirm(`Lancer ${attente.length} clip${attente.length > 1 ? "s" : ""} Seedance en ${prod.resolution} — ${sec} secondes, ordre de grandeur ${(sec * (TARIFS.video[prod.resolution] ?? 0.09)).toFixed(2)} $ ?`)) return;
    setLancement("en-cours"); setErreur(null);
    try {
      const r = await appelApi("/api/production", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution: prod.resolution, projet: projet.id, articles: attente.map(c => ({ n: c.n, fichier: c.fichier, prompt: c.prompt, mouvement: c.mouvement, image: c.image, duree: c.duree })) }),
      });
      const c = await lireJson(r);
      if (!r.ok) throw new Error(c.erreur || "Lancement impossible");
      const parN = new Map<number, { tache?: string; erreur?: string }>((c.resultats as any[]).map(x => [x.n, x]));
      const courant = prodRef.current!;
      const lances = new Set(attente.map(a => a.fichier));
      onMaj({ ...courant, articles: courant.articles.map(a => {
        if (!lances.has(a.fichier)) return a;
        const x = parN.get(a.n);
        return x?.tache ? { ...a, statut: "file" as const, tache: x.tache } : { ...a, statut: "echec" as const, erreur: x?.erreur || "Refusé" };
      }) });
      setLancement("repos");
    } catch (e) { setLancement("erreur"); setErreur(e instanceof Error ? e.message : "Lancement impossible"); }
  }

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
      const r = await appelApi("/api/production", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution, projet: projet.id, articles: clips.map(c => ({ n: c.n, fichier: c.fichier, prompt: c.prompt, mouvement: c.mouvement, image: c.image, duree: c.duree })) }),
      });
      const c = await lireJson(r);
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
        const r = await appelApi(`/api/production/etat?ids=${actifs.map(a => a.tache).join(",")}`, { cache: "no-store" });
        const c = await lireJson(r);
        if (arret || !r.ok) return;
        const parId = new Map<string, any>((c.etats as any[]).map(e => [e.id, e]));
        const aAncrer: { fichier: string; url: string }[] = [];
        const articles = prod.articles.map(a => {
          const e = a.tache ? parId.get(a.tache) : null;
          if (!e) return a;
          if (e.statut === "succeeded") { if (e.video && !estDurable(a.video)) aAncrer.push({ fichier: a.fichier, url: e.video }); return { ...a, statut: "pret" as const, video: e.video || a.video }; }
          if (e.statut === "failed" || e.statut === "cancelled") return { ...a, statut: "echec" as const, erreur: e.erreur || e.statut };
          if (e.statut === "running") return { ...a, statut: "en-cours" as const };
          return a;
        });
        onMaj({ ...prod, articles });
        // Un clip prêt est recopié sur le compte : l'adresse du moteur expire en un jour.
        for (const x of aAncrer) {
          const durable = await ancrer(projet.id, `${x.fichier}.mp4`, x.url, "video/mp4");
          if (durable !== x.url) {
            const courant = prodRef.current;
            if (courant) onMaj({ ...courant, articles: courant.articles.map(y => y.fichier === x.fichier ? { ...y, video: durable } : y) });
          }
        }
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
  const [causes, setCauses] = useState<Record<string, string>>({});
  const echouer = (fichier: string, e: unknown) => {
    setRendus(q => ({ ...q, [fichier]: "echec" }));
    setCauses(q => ({ ...q, [fichier]: e instanceof Error ? e.message : "Rendu impossible" }));
  };
  /* L'aperçu vidéo de chaque gabarit rendu : en mémoire dans l'onglet, sinon sur le compte. */
  const [apercus, setApercus] = useState<Record<string, string>>({});
  const [affiches, setAffiches] = useState<Record<string, string>>({});
  const [grand, setGrand] = useState<{ fichier: string; src?: string; affiche?: string; gabarit?: Gabarit; params: Record<string, any>; variante: "clair" | "sombre" | "inverse"; transparent: boolean } | null>(null);
  const [tour, setTour] = useState(0);
  const lances = useRef(new Set<string>());
  useEffect(() => {
    if (!prod) return;
    setRendus(q => {
      const n = { ...q };
      for (const a of prod.articles) if (vivants[a.fichier] && disponible(a) && n[a.fichier] !== "en-cours") n[a.fichier] = "pret";
      return n;
    });
    const file = prod.articles.filter(a => vivants[a.fichier] && !disponible(a) && !lances.current.has(a.fichier));
    let i = 0;
    const suivant = async (): Promise<void> => {
      const a = file[i++];
      const v = a && vivants[a.fichier];
      if (!a || !v) return;
      lances.current.add(a.fichier);
      setRendus(q => ({ ...q, [a.fichier]: "en-cours" }));
      try {
        const f = await rendre(projet.id, { html: v.html, fichier: a.fichier, duree: v.duree, mode: modeDe(a) });
        setRendus(q => ({ ...q, [a.fichier]: "pret" }));
        if (f.png) setAffiches(q => ({ ...q, [a.fichier]: URL.createObjectURL(f.png!) }));
        if (f.apercu) setApercus(q => ({ ...q, [a.fichier]: URL.createObjectURL(f.apercu!) }));
        const chemins = await deposer(projet.id, a.fichier, f);
        const courant = prodRef.current;
        if (chemins && courant) {
          onMaj({ ...courant, articles: courant.articles.map(x => x.fichier === a.fichier ? { ...x, movChemin: chemins.mov || x.movChemin, pngChemin: chemins.png, apercuUrl: chemins.apercu, fixeUrl: chemins.fixe, empreinte: chemins.mov ? v.empreinte : x.empreinte } : x) });
          // L'adresse du compte remplace le blob : elle survit au rechargement et se lit partout.
          if (chemins.apercu) setApercus(q => ({ ...q, [a.fichier]: chemins.apercu! }));
        }
      } catch (e) {
        echouer(a.fichier, e);
        lances.current.delete(a.fichier);
      }
      await suivant();
    };
    suivant();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod?.lancee, prod?.articles.length, tour, vivants]);

  /** Les fichiers d'un gabarit : de la mémoire, sinon du compte, sinon rendus maintenant. */
  async function fichiersDe(a: ArticleProd): Promise<{ mov: Blob; png?: Blob; zip?: Blob } | null> {
    const v = vivants[a.fichier];
    if (!v) return null;
    const c = enCache(cle(projet.id, a.fichier), v.empreinte);
    if (c) return c;
    if (a.movChemin && a.empreinte === v.empreinte) {
      const mov = await recuperer(a.movChemin);
      if (mov) return { mov, png: a.pngChemin ? (await recuperer(a.pngChemin)) || undefined : undefined };
    }
    setRendus(q => ({ ...q, [a.fichier]: "en-cours" }));
    try {
      const f = await rendre(projet.id, { html: v.html, fichier: a.fichier, duree: v.duree, mode: modeDe(a) });
      setRendus(q => ({ ...q, [a.fichier]: "pret" }));
      return f;
    } catch (e) {
      echouer(a.fichier, e);
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
      const manques: string[] = [];
      const timecode = (a: ArticleProd) => { const i = insertDe(a); if (!i) return "     "; const t = i.entree; return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`; };
      for (const a of prod.articles) {
        if (a.statut === "pret" && a.video) {
          setEtapeZip(`${a.fichier}…`);
          const blob = await blobDepuis(a.video);
          if (blob) {
            z.file(`01-TIMELINE/${a.fichier}.mp4`, blob);
            timeline.push(`${timecode(a)}  ${a.fichier}.mp4  ·  B-roll ${a.duree} s  ·  piste V2, en coupe sur le plan`);
          } else {
            timeline.push(`${timecode(a)}  ${a.fichier}.mp4  ·  B-roll  ·  CLIP INDISPONIBLE (adresse expirée) — relancez la production pour ce passage`);
            manques.push(a.fichier);
          }
        } else if (vivants[a.fichier]) {
          setEtapeZip(`${a.fichier}…`);
          const f = await fichiersDe(a);
          if (!f) {
            z.file(`03-SOURCES/${a.fichier}/${a.fichier}.html`, vivants[a.fichier]!.html);
            timeline.push(`${timecode(a)}  ${a.fichier}  ·  motion  ·  RENDU IMPOSSIBLE, HTML dans 03-SOURCES`);
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
          timeline.push(`${timecode(a)}  ${a.fichier}.mov  ·  motion ${vivants[a.fichier]!.duree} s  ·  ${modeDe(a) === "transparent" ? "piste V3, PAR-DESSUS le plan (fond transparent)" : "piste V2, en coupe sur le plan (plein cadre)"}`);
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
      if (manques.length) setErreur(`Dossier livré sans ${manques.length} clip${manques.length > 1 ? "s" : ""} (${manques.join(", ")}) : adresse expirée. Relancez la production pour ces passages.`);
    } catch (e) {
      setErreur(`Le dossier n'a pas pu être assemblé : ${e instanceof Error ? e.message : "erreur"}.`);
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
            <div className="l"><span>Gabarits motion, rendus en .mov à fond transparent (sans coût)</span><b>{candidats.filter(c => c.html).length}</b></div>
            {clips.length > 0 && (
              <>
                <div className="l"><span>Clips Seedance à lancer</span><b>{clips.length}</b></div>
                <div className="l"><span>Secondes de vidéo (4 à 15 s par clip)</span><b>{secondes} s</b></div>
                <div className="l"><span>Résolution</span>
                  <select className="champ" style={{ width: "auto", padding: "6px 10px" }} value={resolution} onChange={e => setResolution(e.target.value)}>
                    {["480p", "720p", "1080p"].map(r => <option key={r} value={r}>{r} · ≈ {TARIFS.video[r].toFixed(2)} $/s</option>)}
                  </select>
                </div>
                <div className="l"><span>Ordre de grandeur</span><b>≈ {cout.toFixed(2)} $</b></div>
              </>
            )}
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
            <span className="muet" style={{ fontSize: 12.5 }}>
              {clips.length ? "C'est ici que l'argent part. Rien avant ce clic." : "Aucun clip à payer : seulement des gabarits à rendre, quelques minutes chacun."}
            </span>
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
            {prod.articles.some(a => vivants[a.fichier]) && <span>gabarits rendus {prod.articles.filter(a => vivants[a.fichier] && rendus[a.fichier] === "pret").length}/{prod.articles.filter(a => vivants[a.fichier]).length}</span>}
          </div>

          {nouveaux.length > 0 && (
            <div className="pourquoi" style={{ marginTop: 12 }}>Ajout de {nouveaux.length} insert{nouveaux.length > 1 ? "s" : ""} gardé{nouveaux.length > 1 ? "s" : ""} depuis le lancement…</div>
          )}
          {prod.articles.some(a => a.moteur === "broll" && a.statut === "attente") && (
            <div className="pourquoi" style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>{prod.articles.filter(a => a.moteur === "broll" && a.statut === "attente").length} clip{prod.articles.filter(a => a.moteur === "broll" && a.statut === "attente").length > 1 ? "s" : ""} B-roll ajouté{prod.articles.filter(a => a.moteur === "broll" && a.statut === "attente").length > 1 ? "s" : ""} depuis le lancement : ils partent chez Seedance sur ce clic, avec leur devis.</span>
              <button className="btn" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={lancement === "en-cours"} onClick={() => lancerAttente()}>
                {lancement === "en-cours" ? "Envoi à Seedance…" : "Lancer ces clips"}
              </button>
            </div>
          )}
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {prod.articles.map(a => (
              <div key={a.n} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) 120px auto", gap: 14, alignItems: "center",
                                       padding: "10px 12px", border: "1px solid var(--trait)", borderRadius: 12, background: "var(--surface-2)" }}>
                <div>
                  <div className="mono" style={{ fontSize: 12.5 }}>{a.fichier}.{a.moteur === "broll" ? "mp4" : "mov"}</div>
                  <div className="muet" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {a.moteur === "broll" ? `B-roll · ${a.duree}s${a.image ? " · depuis la vignette validée" : " · depuis le prompt seul"}` : `Motion · ${(LIBELLES as any)[a.forme]?.nom || a.forme}${vivants[a.fichier] ? ` · ${vivants[a.fichier]!.duree} s · .mov ${modeDe(a) === "transparent" ? "à fond transparent" : "plein cadre"}` : ""}`}
                    {a.erreur && !vivants[a.fichier] && <span style={{ color: a.statut === "echec" ? "var(--alerte)" : "var(--encre-3)" }}> — {a.erreur}</span>}
                  </div>
                </div>
                {(() => {
                  const e = vivants[a.fichier] ? (rendus[a.fichier] === "pret" ? "pret" : rendus[a.fichier] === "echec" ? "echec" : "en-cours") : a.statut;
                  const [texte, couleur] = a.moteur === "broll" && a.video && expiree(a.video) ? ["expiré", "var(--alerte)"]
                    : e === "en-cours" && vivants[a.fichier] ? ["rendu…", "var(--signal)"] : PILULE[e];
                  return <span className="pilule" style={{ justifySelf: "start", color: couleur, borderColor: couleur }}>{texte}</span>;
                })()}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {a.video && expiree(a.video) && (
                    <span className="muet" style={{ fontSize: 12, color: "var(--alerte)", maxWidth: 300 }}>
                      Ce clip a expiré chez le moteur (les adresses valent 24 h) avant d'être copié sur votre compte. Il faut le régénérer.
                    </span>
                  )}
                  {a.video && expiree(a.video) && (
                    <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }}
                            onClick={() => { const courant = prodRef.current!; onMaj({ ...courant, articles: courant.articles.map(x => x.fichier === a.fichier ? { ...x, statut: "attente" as const, video: undefined, tache: undefined, erreur: undefined } : x) }); }}>
                      Régénérer ce clip
                    </button>
                  )}
                  {a.moteur === "broll" && !a.video && a.image && (
                    <img src={a.image} alt="" title="L'image de référence choisie sur la planche : le clip lui ressemblera" style={{ width: 160, aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, border: "1px solid var(--trait)" }} />
                  )}
                  {a.video && !expiree(a.video) && <video src={a.video} controls preload="metadata" style={{ width: 160, borderRadius: 8, background: "#000" }} />}
                  {vivants[a.fichier] && (() => {
                    const aJour = a.empreinte === vivants[a.fichier]!.empreinte;
                    const src = apercus[a.fichier] || (aJour ? a.apercuUrl : undefined);
                    const affiche = affiches[a.fichier] || (aJour ? a.fixeUrl : undefined);
                    const g = gabaritPour(a.forme); const ins = insertDe(a);
                    const params = ins ? (ins.forme === a.forme && ins.params && Object.keys(ins.params).length ? ins.params : paramsPour(a.forme as any, ins.texte, ins.section)) : {};
                    const variante = ins ? (CARTES[dec(ins.bloc).variante] || "clair") : "clair";
                    const transparent = modeDe(a) === "transparent";
                    // L'aperçu montre l'état final, lisible ; un clic ouvre le lecteur en grand.
                    return (
                      <button className="apercu-rendu" title={src ? "Voir le rendu en grand" : "Le rendu arrive — état final du gabarit"}
                              onClick={() => setGrand({ fichier: a.fichier, src, affiche, gabarit: g, params, variante, transparent })}>
                        {affiche ? <img src={affiche} alt="" />
                          : g && ins ? <div className="vignette"><GabaritApercu gabarit={g} params={params} vars={vars} variante={variante} transparent={transparent} /></div> : null}
                        <span className="lecture">{src ? "▶" : "…"}</span>
                      </button>
                    );
                  })()}
                  {a.moteur === "broll" && a.statut === "attente" && (
                    <button className="btn" style={{ padding: "7px 12px", fontSize: 12.5 }} disabled={lancement === "en-cours"}
                            title="Envoie ce clip à Seedance, avec l'image choisie en référence"
                            onClick={() => lancerAttente(a)}>
                      {lancement === "en-cours" ? "Envoi…" : `Lancer ce clip · ≈ ${(Math.max(4, Math.min(15, Math.round(a.duree))) * (TARIFS.video[prod.resolution] ?? 0.09)).toFixed(2)} $`}
                    </button>
                  )}
                  {a.video && !expiree(a.video) && <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }}
                                 onClick={async () => {
                                   const blob = await blobDepuis(a.video!);
                                   if (!blob) { setErreur("Ce clip n'est plus disponible : l'adresse du moteur a expiré. Relancez la production pour ce passage."); return; }
                                   telecharger(blob, `${a.fichier}.mp4`);
                                 }}>Télécharger .mp4</button>}
                  {vivants[a.fichier] && (
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
                      <>
                        {causes[a.fichier] && <span className="muet" style={{ fontSize: 12, color: "var(--alerte)", maxWidth: 260 }}>{causes[a.fichier]}</span>}
                        <button className="btn fantome" style={{ padding: "7px 12px", fontSize: 12.5 }} onClick={() => relancer(a)}>Réessayer le rendu</button>
                      </>
                    ) : (
                      <span className="muet mono" style={{ fontSize: 12 }}>rendu en cours · jusqu'à 3 min</span>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn" disabled={zip === "en-cours" || (prets === 0 && !prod.articles.some(a => vivants[a.fichier]))} onClick={telechargerDossier}>
              {zip === "en-cours" ? (etapeZip || "Assemblage du dossier…") : "Télécharger le dossier"}
            </button>
            <span className="muet" style={{ fontSize: 12.5 }}>01-TIMELINE (un fichier par insert, dans l'ordre), 02-IMAGES-FIXES, 03-SOURCES, et un LISEZMOI avec l'ordre de montage. Les fichiers déjà rendus ne sont pas refaits.</span>
            <button className="btn fantome" style={{ marginLeft: "auto" }} onClick={() => { if (confirm("Oublier cette production et repartir du tri ?")) onMaj(undefined as any); }}>
              Nouvelle production
            </button>
          </div>
        </>
      )}
          {grand && (
        <div className="voile" onClick={() => setGrand(null)}>
          <div className="grand" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <b className="mono" style={{ fontSize: 13 }}>{grand.fichier}.mov</b>
              <span className="muet" style={{ fontSize: 12.5 }}>{grand.src ? (grand.transparent ? "le rendu, posé sur un gris neutre pour voir la transparence" : "le rendu, tel qu'il sera livré") : "le gabarit tel qu'il sera rendu (survoler pour rejouer le mouvement)"}</span>
              <button className="btn fantome" style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 12.5 }} onClick={() => setGrand(null)}>Fermer</button>
            </div>
            {grand.src
              ? <video src={grand.src} poster={grand.affiche} controls autoPlay playsInline style={{ width: "100%", aspectRatio: "16/9", borderRadius: 10, background: "#3c3f3a" }} />
              : grand.gabarit ? <div className="vignette" style={{ borderRadius: 10 }}><GabaritApercu gabarit={grand.gabarit} params={grand.params} vars={vars} variante={grand.variante} anime transparent={grand.transparent} /></div> : null}
          </div>
        </div>
      )}
    </div>
  );
}

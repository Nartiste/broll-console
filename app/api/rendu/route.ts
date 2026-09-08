import { NextResponse } from "next/server";
import JSZip from "jszip";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { depenser, exiger } from "@/lib/garde";
import { COUTS } from "@/lib/tarifs";

export const maxDuration = 600;
export const dynamic = "force-dynamic";

/**
 * Rendu d'un gabarit en fichiers montables.
 *
 * Un HTML ne se pose pas sur une timeline. Ici, un Chromium headless charge
 * le gabarit animé, le fige à chaque instant t (toutes les animations de la
 * page sont mises en pause et placées à t par l'API Web Animations) et le capture
 * en PNG avec transparence — une séquence d'images que Premiere, Resolve ou
 * After Effects importent comme une vidéo à canal alpha. Plus une image fixe
 * 1920×1080. Le tout dans un zip.
 *
 * Les mêmes images sont aussi assemblées en un .mov QuickTime (codec PNG,
 * canal alpha) : un seul fichier à glisser sur la timeline, sans la case
 * « Séquence d'images » ni le piège de la première image mal choisie.
 *
 * Déterministe : même HTML, mêmes images. Aucune génération.
 */
const executer = promisify(execFile);

/* Un seul rendu à la fois par instance : deux Chromium côte à côte font
   sauter la mémoire, et la fonction est tuée sans un mot. Le suivant attend. */
let file: Promise<unknown> = Promise.resolve();
function auTour<T>(travail: () => Promise<T>): Promise<T> {
  const tour = file.then(travail, travail);
  file = tour.catch(() => {});
  return tour;
}

/** Assemble les images en .mov à canal alpha, plus un aperçu MP4 que le
 *  navigateur sait lire (posé sur un gris neutre, l'alpha n'existant pas en H.264).
 *  Null si ffmpeg manque ou échoue : la séquence PNG reste livrée. */
async function encoderMov(images: Buffer[], fps: number): Promise<{ mov: Buffer; apercu: Buffer | null } | null> {
  let ffmpeg: string | null = null;
  try { ffmpeg = (await import("ffmpeg-static")).default as unknown as string; } catch { return null; }
  if (!ffmpeg) return null;
  const dossier = await mkdtemp(join(tmpdir(), "gabarit-"));
  try {
    await Promise.all(images.map((img, i) => writeFile(join(dossier, `${String(i + 1).padStart(4, "0")}.png`), img)));
    const sortie = join(dossier, "sortie.mov");
    await executer(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dossier, "%04d.png"),
                            "-c:v", "png", "-compression_level", "2", "-pix_fmt", "rgba", sortie], { timeout: 120_000 });
    const mov = await readFile(sortie);
    let apercu: Buffer | null = null;
    try {
      const ap = join(dossier, "apercu.mp4");
      await executer(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dossier, "%04d.png"),
                              "-filter_complex", `color=c=0x3c3f3a:s=1920x1080:r=${fps}[bg];[bg][0:v]overlay=shortest=1,scale=960:-2,format=yuv420p`,
                              "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-movflags", "+faststart", ap], { timeout: 120_000 });
      apercu = await readFile(ap);
    } catch { /* l'aperçu est un confort, pas le livrable */ }
    return { mov, apercu };
  } catch {
    return null;
  } finally {
    await rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}
async function navigateur() {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args, executablePath: await chromium.executablePath(), headless: true,
      defaultViewport: { width: 1920, height: 1080 },
    });
  }
  // En local : le Chrome de la machine.
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true, defaultViewport: { width: 1920, height: 1080 },
  });
}

export async function POST(req: Request) {
  const g = await exiger(req);
  if (!g.ok) return g.reponse;
  const corpsReq = await req.json().catch(() => ({}));
  const { nom, fixe = true, alpha } = corpsReq;
  const fps = Math.max(12, Math.min(30, Math.round(Number(corpsReq.fps) || 24)));
  const duree = Math.max(1, Math.min(8, Number(corpsReq.duree) || 2.5));
  const htmlBrut = corpsReq.html;
  if (typeof htmlBrut !== "string" || !htmlBrut.includes("<div class=\"g\">") || htmlBrut.length > 400_000) {
    return NextResponse.json({ erreur: "Gabarit absent ou trop lourd." }, { status: 400 });
  }
  // Le HTML vient du navigateur : aucun script, aucun gestionnaire d'événement,
  // aucune ressource externe n'y a sa place. Ce qui reste est du HTML et du CSS.
  const html = htmlBrut
    .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/<(object|embed|meta http-equiv)[^>]*>/gi, "")
    // Seul lien toléré : la feuille des polices de la charte chez Google Fonts.
    .replace(/<link\b[^>]*>/gi, l => /href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"/.test(l) && /rel="stylesheet"/.test(l) ? l : "");
  const d = await depenser(g.qui, "rendu", COUTS.rendu, String(nom || ""));
  if (!d.ok) return d.reponse;
  return auTour(() => rendreTout({ html, nom, fps, duree, fixe, alpha, sequence: corpsReq.sequence === true, plein: corpsReq.plein === true }));
}

async function rendreTout({ html, nom, fps, duree, fixe, alpha, sequence, plein }: { html: string; nom: unknown; fps: number; duree: number; fixe: boolean; alpha: unknown; sequence: boolean; plein: boolean }) {
  const base = String(nom || "gabarit").replace(/[^\w.-]+/g, "_");
  const images = Math.max(1, Math.min(240, Math.round(Number(fps) * Number(duree))));

  let b: Awaited<ReturnType<typeof navigateur>> | null = null;
  try {
    b = await navigateur();
    const page = await b.newPage();
    page.setDefaultTimeout(30_000);
    // Rien ne sort : la page n'a besoin d'aucune ressource réseau.
    await page.setRequestInterception(true);
    // …sauf les polices de la charte, chez Google Fonts : le .mov doit avoir la même typographie que l'aperçu.
    const POLICES = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
    page.on("request", r => { if ((r.isNavigationRequest() && r.frame() === page.mainFrame()) || POLICES.test(r.url())) r.continue(); else r.abort(); });
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    // Les polices déclarées par la feuille Google ne se chargent qu'à l'usage :
    // on force leur chargement avant la première capture, sinon la trame 1
    // part en police de secours.
    await Promise.race([
      page.evaluate(() => Promise.all([...(document as any).fonts].map((f: any) => f.load().catch(() => null))).then(() => (document as any).fonts.ready)),
      new Promise(r => setTimeout(r, 10_000)),
    ]);
    // Figer à t : chaque animation CSS de la page — celles de l'entrée générique
    // comme celles qu'un gabarit apporte — est mise en pause et placée à t.
    const figer = (t: number) => page.evaluate((ms: number) => {
      for (const a of (document as any).getAnimations({ subtree: true }) as Animation[]) { a.pause(); a.currentTime = ms; }
    }, Math.round(t * 1000));

    const zip = new JSZip();
    let avecMov = false;
    const capturer = async (suffixe: string) => {
      // La séquence PNG n'entre dans le zip que sur demande : le .mov suffit au
      // montage, et deux cents PNG en mémoire ont déjà tué la fonction.
      const dossier = sequence ? zip.folder(`${base}${suffixe}`)! : null;
      const trames: Buffer[] = [];
      for (let i = 0; i < images; i++) {
        const t = i / Number(fps);
        await figer(t);
        const png = Buffer.from(await page.screenshot({ type: "png", omitBackground: true, optimizeForSpeed: true }));
        trames.push(png);
        dossier?.file(`${base}${suffixe}_${String(i + 1).padStart(4, "0")}.png`, png);
      }
      const enc = await encoderMov(trames, Number(fps));
      trames.length = 0;
      if (enc) {
        zip.file(`${base}${suffixe}.mov`, enc.mov); avecMov = true;
        if (enc.apercu) zip.file(`${base}${suffixe}_apercu.mp4`, enc.apercu);
      }
      if (fixe) {
        await figer(Number(duree) + 1);
        zip.file(`${base}${suffixe}.png`, await page.screenshot({ type: "png", omitBackground: true, optimizeForSpeed: true }));
      }
    };
    // Le gabarit peint tout le cadre ? Son rendu serait opaque. On rend alors
    // la version SANS ce fond — celle qui se superpose au plan dans le montage —
    // et la version plein cadre seulement si on la demande : chaque passe
    // coûte une minute de capture et un fichier de plusieurs dizaines de Mo.
    const peintLeFond = alpha !== false && /\.g\s*\{[^}]*\bbackground/.test(html);
    let avecAlpha = false;
    if (!peintLeFond || plein) await capturer("");
    if (peintLeFond) {
      await page.addStyleTag({ content: ".g{background:transparent!important;box-shadow:none!important}" });
      await capturer("_alpha");
      avecAlpha = true;
    }
    const lisezmoi = [`${base}`, ""];
    if (avecMov) {
      lisezmoi.push(
        avecAlpha
          ? `${base}_alpha.mov : LE fichier à utiliser — l'animation à fond transparent, à poser au-dessus de votre plan.`
          : `${base}.mov : LE fichier à utiliser — l'animation à fond transparent, à poser au-dessus de votre plan.`,
        `Vidéo ${fps} i/s, ${duree} s, 1920×1080, QuickTime codec PNG avec canal alpha.`,
        `Premiere / After Effects : importez-le comme n'importe quelle vidéo. Rien d'autre à cocher.`,
        "");
      if (avecAlpha && plein) lisezmoi.push(`${base}.mov : la même animation avec le fond plein du gabarit, en carte plein cadre.`, "");
      if (sequence) lisezmoi.push(`${base}${avecAlpha ? "_alpha" : ""}/ : les mêmes images une par une (séquence PNG ${fps} i/s), si votre logiciel préfère.`);
    } else {
      lisezmoi.push(
        `Séquence PNG ${fps} i/s, ${images} images (${duree} s), 1920×1080${avecAlpha ? `, dans ${base}_alpha/ (fond transparent) et ${base}/ (fond plein)` : ""}.`,
        `Premiere : Fichier → Importer → sélectionner la TOUTE PREMIÈRE image (_0001.png) → cocher « Séquence d'images ».`);
    }
    lisezmoi.push(`${base}${avecAlpha ? "_alpha" : ""}.png : l'image fixe finale, même cadre — à poser après la vidéo pour tenir le gabarit à l'écran plus longtemps.`);
    zip.file(`${base}_LISEZMOI.txt`, lisezmoi.join("\n") + "\n");
    const corps = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return new Response(corps, {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${base}.zip"` },
    });
  } catch (e) {
    return NextResponse.json({ erreur: `Rendu impossible : ${e instanceof Error ? e.message : "erreur"}` }, { status: 502 });
  } finally {
    await b?.close().catch(() => {});
  }
}

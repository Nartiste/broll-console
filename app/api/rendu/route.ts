import { NextResponse } from "next/server";
import JSZip from "jszip";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Rendu d'un gabarit en fichiers montables.
 *
 * Un HTML ne se pose pas sur une timeline. Ici, un Chromium headless charge
 * le gabarit animé, le fige à chaque instant t (variable --t) et le capture
 * en PNG avec transparence — une séquence d'images que Premiere, Resolve ou
 * After Effects importent comme une vidéo à canal alpha. Plus une image fixe
 * 1920×1080. Le tout dans un zip.
 *
 * Déterministe : même HTML, mêmes images. Aucune génération.
 */
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
  const { html, nom, fps = 24, duree = 2.5, fixe = true, alpha } = await req.json().catch(() => ({}));
  if (typeof html !== "string" || !html.includes("<div class=\"g\">")) {
    return NextResponse.json({ erreur: "Gabarit absent." }, { status: 400 });
  }
  const base = String(nom || "gabarit").replace(/[^\w.-]+/g, "_");
  const images = Math.max(1, Math.min(240, Math.round(Number(fps) * Number(duree))));

  let b: Awaited<ReturnType<typeof navigateur>> | null = null;
  try {
    b = await navigateur();
    const page = await b.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => (document as any).fonts?.ready);

    const zip = new JSZip();
    const capturer = async (suffixe: string) => {
      const dossier = zip.folder(`${base}${suffixe}`)!;
      for (let i = 0; i < images; i++) {
        const t = i / Number(fps);
        await page.evaluate((t: number) => document.documentElement.style.setProperty("--t", `${t}s`), t);
        dossier.file(`${base}${suffixe}_${String(i + 1).padStart(4, "0")}.png`, await page.screenshot({ type: "png", omitBackground: true }));
      }
      if (fixe) {
        await page.evaluate((t: number) => document.documentElement.style.setProperty("--t", `${t}s`), Number(duree) + 1);
        zip.file(`${base}${suffixe}.png`, await page.screenshot({ type: "png", omitBackground: true }));
      }
    };
    await capturer("");
    // Le gabarit peint tout le cadre ? Son PNG est opaque. On rend aussi une
    // version sans ce fond — celle qui se superpose au plan dans le montage.
    let avecAlpha = false;
    if (alpha !== false && /\.g\s*\{[^}]*\bbackground/.test(html)) {
      await page.addStyleTag({ content: ".g{background:transparent!important;box-shadow:none!important}" });
      await capturer("_alpha");
      avecAlpha = true;
    }
    zip.file(`${base}_LISEZMOI.txt`,
      `${base}\n\nSéquence PNG ${fps} i/s, ${images} images (${duree} s), 1920×1080.\n` +
      `Premiere : Fichier → Importer → sélectionner ${base}_0001.png → cocher « Séquence d'images ».\n` +
      `${base}.png : l'image fixe finale, même cadre.\n` +
      (avecAlpha
        ? `\n${base}_alpha/ : la même animation SANS le fond plein du gabarit — fond transparent,\n` +
          `à superposer directement sur votre plan. ${base}/ garde le fond, en carte plein cadre.\n`
        : `\nFond transparent hors du composant : se superpose directement sur votre plan.\n`));
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

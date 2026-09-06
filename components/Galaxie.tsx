"use client";

import { useEffect, useRef } from "react";

/**
 * Galaxie de particules — le décor du hero. Dessinée au canvas, pas en SVG :
 * des milliers de points en rotation lente, trois bras spiraux, un noyau.
 * Immobile si l'utilisateur préfère moins d'animation.
 */
export default function Galaxie() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let largeur = 0, hauteur = 0, dpr = 1, anim = 0;

    // Les particules sont posées une fois ; seule la rotation change.
    const N = 2600;
    let s = 1337;
    const rnd = () => ((s = (s * 16807) % 2147483647), s / 2147483647);
    const pts = Array.from({ length: N }, (_, i) => {
      const bras = i % 3;
      const t = Math.pow(rnd(), 0.75);            // densité vers le noyau
      const r = 0.06 + t * 0.94;
      const angle = t * 5.2 + bras * (Math.PI * 2 / 3) + (rnd() - 0.5) * 0.9 * (1 - t * 0.6);
      const chaud = rnd() < 0.14;
      return { r, angle, taille: 0.4 + rnd() * 1.6 * (1 - t * 0.5), alpha: 0.25 + rnd() * 0.75, chaud, scint: rnd() * 6.28 };
    });

    const dimensionner = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      largeur = cv.clientWidth; hauteur = cv.clientHeight;
      cv.width = largeur * dpr; cv.height = hauteur * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const dessiner = (temps: number) => {
      ctx.clearRect(0, 0, largeur, hauteur);
      const cx = largeur * 0.55, cy = hauteur * 0.5;
      const R = Math.min(largeur, hauteur) * 0.62;
      const rot = reduit ? 0 : temps * 0.000045;

      // noyau
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22);
      g.addColorStop(0, "rgba(245,246,238,0.85)");
      g.addColorStop(0.35, "rgba(191,255,0,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      for (const p of pts) {
        const a = p.angle + rot * (1.4 - p.r);
        const x = cx + Math.cos(a) * p.r * R * 1.05;
        const y = cy + Math.sin(a) * p.r * R * 0.62;
        const sc = reduit ? 1 : 0.75 + 0.25 * Math.sin(temps * 0.002 + p.scint);
        ctx.globalAlpha = p.alpha * sc;
        ctx.fillStyle = p.chaud ? "#FFD9B8" : (p.r < 0.35 ? "#F4F5EE" : "#C9D3D6");
        ctx.beginPath();
        ctx.arc(x, y, p.taille, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduit) anim = requestAnimationFrame(dessiner);
    };

    dimensionner();
    dessiner(0);
    const obs = new ResizeObserver(() => { dimensionner(); if (reduit) dessiner(0); });
    obs.observe(cv);
    return () => { cancelAnimationFrame(anim); obs.disconnect(); };
  }, []);

  return <canvas ref={ref} className="galaxie" aria-hidden="true" />;
}

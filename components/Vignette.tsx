"use client";

import { useEffect, useRef } from "react";
import type { Insert } from "@/lib/analyse";
import type { Gabarit } from "@/lib/gabarits";
import GabaritApercu from "./GabaritApercu";
import { integre } from "@/lib/gabarits-integres";

/**
 * Deux natures de vignettes, et la distinction est honnête à l'écran.
 *
 * Motion : le gabarit est déterministe, donc ce qu'on affiche EST le rendu —
 * dans la charte du projet, via les variables --da-*.
 *
 * B-roll : rien n'a encore été généré. On dessine un aperçu, marqué comme
 * factice, pour que personne ne le prenne pour un plan.
 */

function dessiner(cv: HTMLCanvasElement, graine: number, accent: string) {
  const w = (cv.width = 384), h = (cv.height = 216);
  const x = cv.getContext("2d");
  if (!x) return;
  let s = graine * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  const teinte = (a: number) => {
    const c = accent.replace("#", "");
    const [r, g, b] = c.match(/.{2}/g)!.map(v => parseInt(v, 16));
    return `rgba(${r},${g},${b},${a})`;
  };

  x.fillStyle = "#0A0C0A";
  x.fillRect(0, 0, w, h);
  const g = x.createRadialGradient(w / 2, h * 0.62, 8, w / 2, h * 0.62, h * 0.95);
  g.addColorStop(0, teinte(0.26));
  g.addColorStop(1, "transparent");
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);

  x.strokeStyle = teinte(0.28);
  x.lineWidth = 1;
  const hz = h * 0.58;
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    x.beginPath();
    x.moveTo(w / 2 + (t - 0.5) * w * 0.55, hz);
    x.lineTo(w / 2 + (t - 0.5) * w * 3.4, h);
    x.stroke();
  }
  for (let i = 1; i <= 9; i++) {
    const y = hz + (h - hz) * Math.pow(i / 9, 2.1);
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(w, y);
    x.stroke();
  }
  for (let i = 0; i < 24; i++) {
    x.fillStyle = teinte(0.2 + rnd() * 0.5);
    x.beginPath();
    x.arc(rnd() * w, hz + rnd() * (h - hz), 0.6 + rnd() * 1.8, 0, 7);
    x.fill();
  }
  const cx = w * (0.3 + rnd() * 0.4);
  const base = hz + (h - hz) * (0.3 + rnd() * 0.3);
  const ht = 46 + rnd() * 30;
  x.strokeStyle = teinte(0.8);
  x.lineWidth = 1.1;
  for (let i = 0; i < 7; i++) {
    const y = base - ht * (i / 6);
    const ww = ht * 0.3 * Math.sin(Math.PI * (0.22 + i / 8));
    x.beginPath();
    x.moveTo(cx - ww, y);
    x.lineTo(cx + ww, y);
    x.stroke();
  }
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(cx + i * ht * 0.075, base);
    x.lineTo(cx + i * ht * 0.075, base - ht);
    x.stroke();
  }
  x.fillStyle = teinte(0.9);
  x.beginPath();
  x.arc(cx, base - ht - 6, 5.5, 0, 7);
  x.fill();
}

/** Le gabarit intégré d'une forme, rendu dans la charte du projet. Exporté :
 *  il sert aussi à MONTRER les formes là où on les choisit. */
export function Comp({ forme, params, i }: { forme: string; params?: Record<string, any>; i: number }) {
  const q = params || {};
  const mode = i === 1 ? "sombre" : "clair";
  const glow = <span className="glow" />;

  switch (forme) {
    case "liste-3":
    case "liste-5":
      return (
        <div className={`comp ${mode}`}>
          {glow}
          <div className="ct">{q.titre}</div>
          {(q.items || []).map((t: string, k: number) => (
            <div className="li" key={k}><em>{k + 1}</em><span>{t}</span></div>
          ))}
        </div>
      );
    case "mot-choc":
      return (
        <div className={`comp ${i === 0 ? "sombre" : "clair"}`}>
          {glow}
          <div className="ct">{q.sous}</div>
          <div className="choc">{q.mot}</div>
        </div>
      );
    case "chiffre":
      return (
        <div className={`comp ${mode}`}>
          {glow}
          <div className="big">{q.valeur}</div>
          <div className="lg">{q.legende}</div>
        </div>
      );
    case "duo-chiffres":
      return (
        <div className={`comp ${mode}`}>
          {glow}
          <div className="duo2">
            <div><div className="big mid">{q.a?.v}</div><div className="lg">{q.a?.l}</div></div>
            <div>
              <div className="big mid" style={{ color: "var(--da-accent)" }}>{q.b?.v}</div>
              <div className="lg">{q.b?.l}</div>
            </div>
          </div>
        </div>
      );
    case "avant-apres":
      return (
        <div className={`comp ${mode}`}>
          {glow}
          <div className="duo2">
            <div><div className="big mid" style={{ opacity: .45 }}>{q.avant?.v}</div><div className="lg">{q.avant?.l}</div></div>
            <span className="fleche">→</span>
            <div>
              <div className="big mid" style={{ color: "var(--da-accent)" }}>{q.apres?.v}</div>
              <div className="lg">{q.apres?.l}</div>
            </div>
          </div>
        </div>
      );
    case "opposition":
      return (
        <div className={`comp ${mode}`}>
          {glow}
          <div className="vs">
            <div><b>{q.gauche?.[0]}</b><i>{q.gauche?.[1]}</i></div>
            <div className="on"><b>{q.droite?.[0]}</b><i>{q.droite?.[1]}</i></div>
          </div>
        </div>
      );
    case "barres":
      return (
        <div className={`comp ${mode}`}>
          {glow}
          {(q.items || []).map((b: any, k: number) => (
            <div className="bar" key={k}>
              <span>{b.label}</span>
              <u><i style={{ width: `${b.pct}%` }} /></u>
              <b>{b.pct}%</b>
            </div>
          ))}
        </div>
      );
    case "pyramide":
      return (
        <div className={`comp ${mode}`}>
          {glow}
          <div className="pyr">
            {[...(q.niveaux || [])].reverse().map((n: string, k: number) => (
              <div key={k} style={{ width: `${45 + k * 18}%` }}>{n}</div>
            ))}
          </div>
        </div>
      );
    default:
      return <div className={`comp ${mode}`}>{glow}</div>;
  }
}

export default function Vignette({ ins, i, accent, gabarit, vars, image }: {
  ins: Insert; i: number; accent: string;
  gabarit?: Gabarit; vars?: Record<string, string>;
  image?: string | null;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ins.moteur === "broll" && !image && cv.current) dessiner(cv.current, ins.n * 7 + i * 13, accent);
  }, [ins, i, accent, image]);

  return (
    <div className="vignette">
      {ins.moteur === "motion" ? (
        vars && (gabarit || integre(ins.forme))
          ? <GabaritApercu gabarit={(gabarit || integre(ins.forme))!} params={ins.params || {}} vars={vars} sombre={i === 1} anime />
          : <Comp forme={ins.forme} params={ins.params} i={i} />
      ) : image ? (
        <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <>
          <canvas ref={cv} />
          <span className="factice">aperçu factice</span>
        </>
      )}
    </div>
  );
}

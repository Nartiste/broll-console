"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Depot from "@/components/Depot";
import { planDe, projets, supprimer, type Projet } from "@/lib/store";

export default function Projets() {
  const [liste, setListe] = useState<Projet[] | null>(null);

  useEffect(() => { setListe(projets()); }, []);

  if (liste === null) return null;

  return (
    <>
      <header>
        <div>
          <h1>Projets</h1>
          <p className="muet" style={{ marginTop: 4 }}>
            Un projet = un script. Tout part du dépôt.
          </p>
        </div>
      </header>

      <Depot compact />

      {liste.length === 0 ? (
        <p className="vide">Aucun projet pour l&apos;instant.</p>
      ) : (
        <div className="projets" style={{ marginTop: 22 }}>
          {liste.map(p => {
            const plan = planDe(p);
            const br = plan.inserts.filter(i => i.moteur === "broll").length;
            const mo = plan.inserts.length - br;
            const tranches = Object.values(p.decisions).filter(d => d.etat).length;
            return (
              <Link key={p.id} href={`/studio/${p.id}`}>
                <article className="carte">
                  <h3>{p.titre}</h3>
                  <div className="barre">
                    <i style={{ width: `${(br / plan.inserts.length) * 100}%`, background: "var(--encre-2)" }} />
                    <i style={{ width: `${(mo / plan.inserts.length) * 100}%`, background: "var(--accent)" }} />
                  </div>
                  <div className="chiffres mono">
                    <span>{plan.inserts.length} inserts</span>
                    <span>{br} B-roll</span>
                    <span>{mo} motion</span>
                  </div>
                  <div className="chiffres mono" style={{ justifyContent: "space-between" }}>
                    <span>{Math.floor(plan.script.duree / 60)}:{String(Math.round(plan.script.duree % 60)).padStart(2, "0")} · {plan.script.mots} mots</span>
                    <span>{tranches}/{plan.inserts.length} tranchés</span>
                  </div>
                  <button
                    className="pilule"
                    style={{ justifySelf: "start" }}
                    onClick={e => {
                      e.preventDefault();
                      supprimer(p.id);
                      setListe(projets());
                    }}
                  >
                    Supprimer
                  </button>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

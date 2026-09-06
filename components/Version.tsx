"use client";

import { useEffect, useState } from "react";

/**
 * Un onglet ouvert avant un déploiement garde l'ancien code : les mots de
 * l'interface, les boutons, tout. L'utilisateur ne peut pas le savoir — il
 * voit un logiciel qui « a régressé ». On compare l'empreinte embarquée à
 * celle du serveur, toutes les minutes, et on le dit.
 */
export default function Version() {
  const [perime, setPerime] = useState(false);
  useEffect(() => {
    const local = process.env.NEXT_PUBLIC_BUILD;
    if (!local || local === "dev") return;
    let arret = false;
    const verifier = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const c = await r.json();
        if (!arret && c.build && c.build !== local) setPerime(true);
      } catch { /* hors ligne : on ne dit rien */ }
    };
    verifier();
    const t = setInterval(verifier, 60_000);
    return () => { arret = true; clearInterval(t); };
  }, []);
  if (!perime) return null;
  return (
    <div style={{ background: "var(--accent)", color: "var(--accent-encre)", padding: "10px 16px", fontSize: 13.5,
                  display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <b>Une nouvelle version est en ligne.</b>
      <span>Cet onglet montre encore l&apos;ancienne — les mots et les boutons peuvent ne plus correspondre.</span>
      <button onClick={() => window.location.reload()}
              style={{ marginLeft: "auto", fontWeight: 700, background: "var(--accent-encre)", color: "var(--accent)",
                       padding: "7px 14px", borderRadius: 100 }}>
        Recharger
      </button>
    </div>
  );
}

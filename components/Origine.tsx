"use client";

import { useEffect, useState } from "react";

/**
 * Chaque déploiement Vercel a sa propre adresse, donc son propre stockage
 * local : sur une adresse de prévisualisation, les projets de l'adresse
 * principale n'existent pas. Ce n'est pas une perte — c'est un autre tiroir.
 * On le dit, avec le chemin du bon.
 */
const PRINCIPALE = "broll-console.vercel.app";

export default function Origine() {
  const [ailleurs, setAilleurs] = useState(false);
  useEffect(() => {
    const h = window.location.host;
    setAilleurs(h.endsWith(".vercel.app") && h !== PRINCIPALE);
  }, []);
  if (!ailleurs) return null;
  return (
    <div style={{ background: "var(--signal)", color: "#1A1408", padding: "10px 16px", fontSize: 13.5, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <b>Vous êtes sur une adresse de prévisualisation.</b>
      <span>Vos projets, chartes et gabarits sont enregistrés par adresse : ceux que vous avez créés sur l&apos;adresse principale ne sont pas ici.</span>
      <a href={`https://${PRINCIPALE}/studio`} style={{ marginLeft: "auto", fontWeight: 700, color: "inherit" }}>Ouvrir {PRINCIPALE} →</a>
    </div>
  );
}

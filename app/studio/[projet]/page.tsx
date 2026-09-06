"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import Console from "@/components/Console";
import { projet as lireProjet, type Projet } from "@/lib/store";

export default function PageProjet({ params }: { params: Promise<{ projet: string }> }) {
  const { projet: id } = use(params);
  const [p, setP] = useState<Projet | null | undefined>(undefined);

  useEffect(() => { setP(lireProjet(id)); }, [id]);

  if (p === undefined) return null;
  if (p === null) {
    return (
      <div className="vide">
        <p>Ce projet n&apos;existe pas ou a été supprimé.</p>
        <Link className="btn" href="/studio" style={{ marginTop: 16 }}>Retour aux projets</Link>
      </div>
    );
  }
  return <Console initial={p} />;
}

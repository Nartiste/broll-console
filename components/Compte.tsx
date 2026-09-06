"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { importerLocaux, tirer } from "@/lib/sync";

/** Qui est là. Sans session — ou sans Supabase — on le dit tel quel. */
export default function Compte() {
  const [email, setEmail] = useState<string | null>(null);
  const [locaux, setLocaux] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const arrivee = async (mail: string | null) => {
      setEmail(mail);
      if (!mail) return;
      const r = await tirer();
      if (r) { setLocaux(r.locaux); if (r.recus) setMessage(`${r.recus} projet${r.recus > 1 ? "s" : ""} sur le compte`); }
    };
    sb.auth.getSession().then(({ data }) => arrivee(data.session?.user?.email || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => arrivee(session?.user?.email || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function importer() {
    const n = await importerLocaux();
    setLocaux(0);
    setMessage(n ? `${n} projet${n > 1 ? "s" : ""} versé${n > 1 ? "s" : ""} sur le compte` : "Rien à importer");
    window.dispatchEvent(new Event("storage"));
  }

  return (
    <div className="compte">
      <span className="ava">{email ? email[0].toUpperCase() : "?"}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {email || "Mode local"}
        </div>
        {email ? (
          <>
            {message && <div className="muet" style={{ fontSize: 11.5 }}>{message}</div>}
            {locaux > 0 && (
              <button style={{ fontSize: 12, padding: 0, color: "var(--accent)", fontWeight: 600 }} onClick={importer}>
                Verser {locaux} projet{locaux > 1 ? "s" : ""} local{locaux > 1 ? "aux" : ""} sur le compte
              </button>
            )}
            <button className="muet" style={{ fontSize: 12, padding: 0, display: "block" }}
                    onClick={() => supabase()?.auth.signOut()}>Se déconnecter</button>
          </>
        ) : (
          <Link href="/login" className="muet" style={{ fontSize: 12 }}>Se connecter</Link>
        )}
      </div>
    </div>
  );
}

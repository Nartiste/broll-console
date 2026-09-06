"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Qui est là. Sans session — ou sans Supabase — on le dit tel quel. */
export default function Compte() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setEmail(session?.user?.email || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="compte">
      <span className="ava">{email ? email[0].toUpperCase() : "?"}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {email || "Mode local"}
        </div>
        {email ? (
          <button className="muet" style={{ fontSize: 12, padding: 0 }}
                  onClick={() => supabase()?.auth.signOut()}>Se déconnecter</button>
        ) : (
          <Link href="/login" className="muet" style={{ fontSize: 12 }}>Se connecter</Link>
        )}
      </div>
    </div>
  );
}

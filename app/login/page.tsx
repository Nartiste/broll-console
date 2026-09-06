"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Connexion. Supabase Auth prendra la place de ce formulaire — la coque, les
 * routes et le stockage sont déjà découpés pour ça. En attendant, la console
 * s'ouvre en mode local : on peut déposer un script et voir le résultat.
 */
export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);

  return (
    <div className="connexion">
      <div className="boite">
        <Link href="/" className="marque" style={{ textDecoration: "none", fontFamily: "var(--titre)", fontWeight: 800 }}>
          ← Console B-roll
        </Link>
        <h1 style={{ marginTop: 18 }}>Se connecter</h1>
        <p className="muet" style={{ marginTop: 8 }}>
          Un lien de connexion vous est envoyé par e-mail. Pas de mot de passe à retenir.
        </p>

        {envoye ? (
          <div className="carte" style={{ marginTop: 24 }}>
            <b>Lien envoyé à {email}</b>
            <p className="muet" style={{ marginTop: 8, fontSize: 14 }}>
              Ouvrez-le depuis cet appareil pour retrouver vos projets.
            </p>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (email.includes("@")) setEnvoye(true); }}>
            <div>
              <label className="lab" htmlFor="email">Adresse e-mail</label>
              <input id="email" className="champ" type="email" required
                     placeholder="vous@studio.fr" value={email}
                     onChange={e => setEmail(e.target.value)} />
            </div>
            <button className="btn" type="submit">Recevoir le lien</button>
          </form>
        )}

        <p className="note">
          L&apos;authentification n&apos;est pas encore branchée. En attendant, la console
          fonctionne en local : vos projets restent dans ce navigateur, rien ne part sur un
          serveur.
        </p>
        <button className="btn fantome" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                onClick={() => router.push("/studio")}>
          Continuer sans compte
        </button>
      </div>
    </div>
  );
}

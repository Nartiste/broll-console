"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authConfiguree, supabase } from "@/lib/supabase";

/**
 * Connexion par lien magique. Le message « lien envoyé » n'apparaît que si
 * Supabase a confirmé l'envoi — jamais avant, jamais par défaut.
 */
export default function Connexion() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [etat, setEtat] = useState<"repos" | "envoi" | "envoye" | "erreur">("repos");
  const [erreur, setErreur] = useState<string | null>(null);
  const [connecte, setConnecte] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email) setConnecte(data.session.user.email);
    });
  }, []);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    const sb = supabase();
    if (!sb) { setEtat("erreur"); setErreur("L'authentification n'est pas configurée sur ce déploiement."); return; }
    setEtat("envoi"); setErreur(null);
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/studio` },
    });
    if (error) { setEtat("erreur"); setErreur(error.message); return; }
    setEtat("envoye");
  }

  return (
    <div className="connexion">
      <div className="boite">
        <Link href="/" style={{ textDecoration: "none", fontFamily: "var(--titre)", fontWeight: 800 }}>
          ← Console B-roll
        </Link>
        <h1 style={{ marginTop: 18 }}>Se connecter</h1>
        <p className="muet" style={{ marginTop: 8 }}>
          Un lien de connexion vous est envoyé par e-mail. Pas de mot de passe à retenir.
        </p>

        {connecte ? (
          <div className="carte" style={{ marginTop: 24 }}>
            <b>Connecté en tant que {connecte}</b>
            <button className="btn" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                    onClick={() => router.push("/studio")}>
              Ouvrir la console
            </button>
          </div>
        ) : etat === "envoye" ? (
          <div className="carte" style={{ marginTop: 24 }}>
            <b>Lien envoyé à {email}</b>
            <p className="muet" style={{ marginTop: 8, fontSize: 14 }}>
              Ouvrez-le depuis cet appareil. Il expire au bout d&apos;une heure. S&apos;il n&apos;arrive
              pas en deux minutes, vérifiez les indésirables — puis réessayez.
            </p>
            <button className="btn fantome" style={{ marginTop: 14 }} onClick={() => setEtat("repos")}>
              Renvoyer
            </button>
          </div>
        ) : (
          <form onSubmit={envoyer}>
            <div>
              <label className="lab" htmlFor="email">Adresse e-mail</label>
              <input id="email" className="champ" type="email" required autoComplete="email"
                     placeholder="vous@studio.fr" value={email}
                     onChange={e => setEmail(e.target.value)} />
            </div>
            {!authConfiguree() && <p style={{ color: "var(--signal)", fontSize: 13 }}>Les comptes ne sont pas activés sur ce déploiement : continuez sans compte, vos projets restent dans ce navigateur.</p>}
            <button className="btn" type="submit" disabled={etat === "envoi" || !authConfiguree()}>
              {etat === "envoi" ? "Envoi…" : "Recevoir le lien"}
            </button>
            {erreur && <p style={{ color: "var(--alerte)", fontSize: 13 }}>{erreur}</p>}
          </form>
        )}

        <p className="note">
          {authConfiguree()
            ? "Connecté, vos projets suivent votre compte d'un appareil à l'autre. Sans compte, ils restent dans ce navigateur."
            : "L'authentification n'est pas configurée sur ce déploiement. La console fonctionne en local : vos projets restent dans ce navigateur."}
        </p>
        <button className="btn fantome" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}
                onClick={() => router.push("/studio")}>
          Continuer sans compte
        </button>
      </div>
    </div>
  );
}

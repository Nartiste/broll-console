import Link from "next/link";

export default function CoqueStudio({ children }: { children: React.ReactNode }) {
  return (
    <div className="coque">
      <aside className="flanc">
        <Link href="/" className="marque" style={{ textDecoration: "none" }}>
          Console <i>B-roll</i>
        </Link>
        <nav>
          <Link href="/studio">Projets</Link>
          <Link href="/studio#chartes">Chartes</Link>
          <Link href="/studio#gabarits">Gabarits</Link>
        </nav>
        <div className="bas">
          <div className="compte">
            <span className="ava">?</span>
            <div>
              <div style={{ fontWeight: 600 }}>Mode local</div>
              <Link href="/login" className="muet" style={{ fontSize: 12 }}>Se connecter</Link>
            </div>
          </div>
        </div>
      </aside>
      <main className="panneau">{children}</main>
    </div>
  );
}

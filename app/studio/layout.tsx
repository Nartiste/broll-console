import Link from "next/link";
import Compte from "@/components/Compte";
import Origine from "@/components/Origine";

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
          <Compte />
        </div>
      </aside>
      <main className="panneau"><Origine />{children}</main>
    </div>
  );
}

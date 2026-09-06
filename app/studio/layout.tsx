import Link from "next/link";
import Compte from "@/components/Compte";
import Origine from "@/components/Origine";

export default function CoqueStudio({ children }: { children: React.ReactNode }) {
  return (
    <div className="coque">
      <aside className="flanc">
        <Link href="/" className="marque" style={{ textDecoration: "none" }}>
          <b>B</b>Console <i>B-roll</i>
        </Link>
        <nav>
          <Link href="/studio" className="actif">Projets</Link>
        </nav>
        <p className="muet" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
          Chartes et gabarits vivent dans chaque projet, Porte 2. Une bibliothèque commune viendra avec les comptes.
        </p>
        <div className="bas">
          <Compte />
        </div>
      </aside>
      <main className="panneau"><Origine />{children}</main>
    </div>
  );
}

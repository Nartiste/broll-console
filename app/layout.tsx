import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const titre = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--f-titre" });
const corps = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--f-corps" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono" });

export const metadata: Metadata = {
  title: "Console B-roll",
  description:
    "Déposez le script de votre vidéo. Recevez les B-roll et le motion design à poser sur la timeline — validés avant la moindre dépense.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${titre.variable} ${corps.variable} ${mono.variable}`}
            style={{
              // @ts-expect-error variables CSS
              "--titre": `var(--f-titre), system-ui, sans-serif`,
              "--corps": `var(--f-corps), system-ui, sans-serif`,
              "--mono": `var(--f-mono), ui-monospace, monospace`,
            }}>
        {children}
      </body>
    </html>
  );
}

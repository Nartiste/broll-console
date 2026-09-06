/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,

  /**
   * Une seule adresse. Chaque déploiement Vercel garde pour toujours sa
   * propre adresse (broll-console-<hash>-prception.vercel.app), son code de
   * l'époque et son propre stockage local — un utilisateur qui y arrive par
   * « Visit » croit que le logiciel a régressé et que ses projets ont
   * disparu. Toute requête reçue sur une adresse de déploiement est renvoyée
   * vers l'adresse principale. Les déploiements antérieurs à cette règle
   * ne peuvent pas être corrigés : ils servent leur code figé.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "broll-console-(?<hash>[a-z0-9]+)-prception\\.vercel\\.app" }],
        destination: "https://broll-console.vercel.app/:path*",
        permanent: false,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "broll-console-git-(?<branche>.*)-prception\\.vercel\\.app" }],
        destination: "https://broll-console.vercel.app/:path*",
        permanent: false,
      },
    ];
  },
};

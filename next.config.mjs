/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,

  /** L'empreinte du build, visible côté client et côté serveur. Un onglet
   *  ouvert avant un déploiement garde l'ancien code sans le savoir ; en
   *  comparant les deux, l'application peut le dire au lieu de laisser
   *  l'utilisateur conclure à une régression. */
  env: { NEXT_PUBLIC_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7) },

  /** Le rendu des gabarits passe par un Chromium headless : binaire natif,
   *  à laisser hors du bundle. */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "ffmpeg-static"],

  /** Sur Vercel, le traçage des dépendances ne voit pas les binaires brotli
   *  de Chromium (chargés à l'exécution, pas importés) : sans cette ligne la
   *  fonction part sans navigateur. */
  outputFileTracingIncludes: { "/api/rendu": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/ffmpeg-static/ffmpeg"] },

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

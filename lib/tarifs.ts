/**
 * Tarifs indicatifs relevés dans la documentation ModelArk (août 2026,
 * promotions incluses), en dollars. Ils servent à afficher un ordre de
 * grandeur AVANT de dépenser — jamais à facturer. À corriger depuis la
 * console ModelArk pour le plan réellement souscrit.
 */
export const TARIFS = {
  video: { "480p": 0.03, "720p": 0.09, "1080p": 0.41 } as Record<string, number>,
  image: 0.03,
};

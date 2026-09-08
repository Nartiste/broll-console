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

/**
 * Coûts estimés des autres postes, en dollars par appel — l'ordre de
 * grandeur qui alimente le plafond de dépense, pas une facture.
 */
export const COUTS = {
  analyse: 0.40,   // Opus 5, un script entier en entrée, un jugement structuré en sortie
  charte: 0.25,    // Opus 5 + images de référence
  gabarit: 0.25,   // Opus 5 + capture
  rendu: 0.02,     // Chromium + ffmpeg, quelques minutes de calcul
};

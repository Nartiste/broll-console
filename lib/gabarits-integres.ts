import type { FormeMotion, Gabarit } from "./gabarits";

/**
 * Les neuf gabarits intégrés, en HTML/CSS — les mêmes objets que les gabarits
 * sur mesure. Ils se rendent donc en fichiers montables, et chacun porte son
 * propre mouvement : une entrée courte, puis ce que la forme raconte —
 * l'état actif qui passe d'une étape à la suivante, les barres qui poussent,
 * le second chiffre qui répond au premier.
 *
 * Tout est en vw (le canevas fait 100 × 56.25 vw), en variables de charte,
 * sans image ni police externe. Le fond du cadre est peint : le rendu produit
 * aussi la version sans fond, à superposer au plan.
 */

const SOCLE = `
.g{background:var(--da-fond);color:var(--da-encre);font-family:var(--da-titre);overflow:hidden}
.g .lueur{position:absolute;width:120vw;height:120vw;border-radius:50%;left:-30vw;top:-82vw;filter:blur(3vw);pointer-events:none;background:radial-gradient(circle,color-mix(in srgb,var(--da-accent) 32%,transparent),transparent 60%)}
.g .carte{position:absolute;left:10vw;top:7vw;width:80vw;height:42.25vw;border-radius:var(--da-rayon);padding:4.5vw 6vw;display:flex;flex-direction:column;justify-content:center;background:color-mix(in srgb,var(--da-fond) 86%,var(--da-encre));box-shadow:0 2vw 7vw rgba(0,0,0,.28);transform-origin:50% 60%}
.g .oeil{font-family:var(--da-util);font-size:1.7vw;letter-spacing:.14em;text-transform:uppercase;opacity:.6;margin-bottom:2.2vw}
.g .gros{font-weight:var(--da-graisse);letter-spacing:var(--da-interlettrage);line-height:.92}
.g .legende{font-family:var(--da-util);font-size:2.4vw;opacity:.7;margin-top:1.4vw;line-height:1.25}
`;

const ENTREE = `
.g .carte{animation:g-cadre .55s cubic-bezier(.2,.9,.2,1) both}
.g .oeil{animation:g-monte .5s cubic-bezier(.2,.9,.2,1) both;animation-delay:.3s}
@keyframes g-cadre{from{opacity:0;transform:translateY(3vw) scale(.92)}to{opacity:1;transform:none}}
@keyframes g-monte{from{opacity:0;transform:translateY(2vw)}to{opacity:1;transform:none}}
`;

/* Une liste : les lignes arrivent, puis l'état actif passe de 01 à 02 à 03 —
   chaque étape s'allume à son tour et reste allumée. */
const LISTE_CSS = SOCLE + `
.g .carte{counter-reset:n}
.g .li{display:flex;align-items:center;gap:2.4vw;margin:1.1vw 0;opacity:.32}
.g .li em{counter-increment:n;font-style:normal;font-family:var(--da-util);font-size:2.2vw;font-weight:700;width:5.2vw;height:5.2vw;border-radius:50%;display:grid;place-items:center;flex:none;box-shadow:inset 0 0 0 .3vw currentColor;transform:scale(.9)}
.g .li em::before{content:counter(n,decimal-leading-zero)}
.g .li span{font-size:5vw;font-weight:var(--da-graisse);letter-spacing:var(--da-interlettrage);line-height:1.05}
`;
const LISTE_ANIM = (n: number, pas: number) => ENTREE + `
.g .li{animation:g-monte .5s cubic-bezier(.2,.9,.2,1) both,g-allume .45s cubic-bezier(.2,.9,.2,1) both}
.g .li em{animation:g-pastille .45s cubic-bezier(.2,.9,.2,1) both}
${Array.from({ length: n }, (_, k) =>
  `.g .li:nth-child(${k + 2}){animation-delay:${(.35 + k * .12).toFixed(2)}s,${(1 + k * pas).toFixed(2)}s}` +
  `.g .li:nth-child(${k + 2}) em{animation-delay:${(1 + k * pas).toFixed(2)}s}`).join("\n")}
@keyframes g-allume{from{opacity:.32;transform:translateX(0)}60%{transform:translateX(.8vw)}to{opacity:1;transform:none}}
@keyframes g-pastille{from{background:transparent;color:inherit;box-shadow:inset 0 0 0 .3vw currentColor;transform:scale(.9)}50%{transform:scale(1.18)}to{background:var(--da-accent);color:var(--da-fond-sombre);box-shadow:inset 0 0 0 .3vw var(--da-accent);transform:scale(1)}}
`;
const LISTE_HTML = `<span class="lueur"></span><div class="carte"><div class="oeil">{{titre}}</div>{{#items}}<div class="li"><em></em><span>{{.}}</span></div>{{/items}}</div>`;

export const INTEGRES: Record<FormeMotion, Gabarit> = {
  "liste-3": {
    id: "integre-liste-3", nom: "Liste de 3", forme: "liste-3", cree: 0,
    description: "Un titre discret et trois lignes numérotées. Les lignes arrivent, puis l'état actif passe de 01 à 02 à 03.",
    html: LISTE_HTML, css: LISTE_CSS, animation: LISTE_ANIM(3, .85), duree: 4,
  },
  "liste-5": {
    id: "integre-liste-5", nom: "Liste de 5", forme: "liste-5", cree: 0,
    description: "Cinq lignes numérotées, plus serrées. Chaque étape s'allume à son tour.",
    html: LISTE_HTML,
    css: LISTE_CSS + `.g .li{margin:.55vw 0}.g .li span{font-size:3.9vw}.g .li em{width:4.4vw;height:4.4vw;font-size:1.9vw}`,
    animation: LISTE_ANIM(5, .65), duree: 5,
  },
  "mot-choc": {
    id: "integre-mot-choc", nom: "Mot-choc", forme: "mot-choc", cree: 0,
    description: "Un sous-titre, puis le mot en très gros, en capitales. Il claque en arrivant, une barre d'accent le souligne, puis il respire à peine.",
    html: `<span class="lueur"></span><div class="carte"><div class="oeil">{{sous}}</div><div class="mot gros">{{mot}}</div><i class="barre"></i></div>`,
    css: SOCLE + `
.g .carte{background:var(--da-fond-sombre);color:var(--da-encre-sombre)}
.g .mot{font-size:9.5vw;text-transform:uppercase;line-height:.95;transform-origin:0 60%}
.g .barre{display:block;height:.9vw;width:22vw;margin-top:2.6vw;border-radius:1vw;background:var(--da-accent);transform-origin:0 50%}`,
    animation: ENTREE + `
.g .mot{animation:g-claque .55s cubic-bezier(.2,.9,.2,1) both,g-respire 1.6s ease-in-out both;animation-delay:.45s,1.2s}
.g .barre{animation:g-pousse .5s cubic-bezier(.2,.9,.2,1) both;animation-delay:.95s}
@keyframes g-claque{from{opacity:0;transform:scale(1.6) translateX(2vw);letter-spacing:.12em}to{opacity:1;transform:none}}
@keyframes g-respire{from{transform:scale(1)}50%{transform:scale(1.025)}to{transform:scale(1)}}
@keyframes g-pousse{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
    duree: 3,
  },
  "chiffre": {
    id: "integre-chiffre", nom: "Chiffre", forme: "chiffre", cree: 0,
    description: "Une valeur énorme et sa légende. Le chiffre se révèle de bas en haut avec du poids, la légende suit, une barre d'accent le pose.",
    html: `<span class="lueur"></span><div class="carte"><div class="val gros">{{valeur}}</div><i class="barre"></i><div class="legende">{{legende}}</div></div>`,
    css: SOCLE + `
.g .val{font-size:15vw;color:var(--da-accent)}
.g .barre{display:block;flex:none;height:.9vw;width:14vw;margin:2.2vw 0 .8vw;border-radius:1vw;background:var(--da-accent);transform-origin:0 50%}
.g .legende{font-size:3vw;max-width:60vw}`,
    animation: ENTREE + `
.g .val{animation:g-revele .8s cubic-bezier(.2,.9,.2,1) both;animation-delay:.35s}
.g .barre{animation:g-pousse .5s cubic-bezier(.2,.9,.2,1) both;animation-delay:1s}
.g .legende{animation:g-monte .5s cubic-bezier(.2,.9,.2,1) both;animation-delay:1.15s}
@keyframes g-revele{from{opacity:0;transform:translateY(6vw) scale(.8);clip-path:inset(100% 0 0 0)}60%{clip-path:inset(0 0 0 0)}to{opacity:1;transform:none;clip-path:inset(0 0 0 0)}}
@keyframes g-pousse{from{transform:scaleX(0)}to{transform:scaleX(1)}}`,
    duree: 2.8,
  },
  "duo-chiffres": {
    id: "integre-duo-chiffres", nom: "Deux chiffres", forme: "duo-chiffres", cree: 0,
    description: "Deux valeurs côte à côte. La première s'installe, la seconde — en accent — arrive après et frappe plus fort.",
    html: `<span class="lueur"></span><div class="carte"><div class="duo"><div class="a"><div class="val gros">{{a.v}}</div><div class="legende">{{a.l}}</div></div><div class="b"><div class="val gros">{{b.v}}</div><div class="legende">{{b.l}}</div></div></div></div>`,
    css: SOCLE + `
.g .duo{display:flex;gap:6vw;align-items:flex-end}
.g .duo > div{flex:1}
.g .val{font-size:11vw}
.g .b .val{color:var(--da-accent);font-size:13vw}
.g .a{opacity:.55}`,
    animation: ENTREE + `
.g .a{animation:g-monte .55s cubic-bezier(.2,.9,.2,1) both;animation-delay:.4s}
.g .b{animation:g-frappe .6s cubic-bezier(.2,.9,.2,1) both;animation-delay:1.3s}
@keyframes g-frappe{from{opacity:0;transform:scale(1.5) translateY(2vw)}70%{transform:scale(.97)}to{opacity:1;transform:none}}`,
    duree: 3.2,
  },
  "avant-apres": {
    id: "integre-avant-apres", nom: "Avant / après", forme: "avant-apres", cree: 0,
    description: "L'avant s'installe, puis se fait barrer ; l'après arrive en accent, plus grand, et reste.",
    html: `<span class="lueur"></span><div class="carte"><div class="duo"><div class="avant"><div class="val gros"><s>{{avant.v}}</s></div><div class="legende">{{avant.l}}</div></div><div class="fleche">→</div><div class="apres"><div class="val gros">{{apres.v}}</div><div class="legende">{{apres.l}}</div></div></div></div>`,
    css: SOCLE + `
.g .duo{display:flex;gap:4vw;align-items:center}
.g .duo > div{flex:1}
.g .fleche{flex:none;font-size:6vw;opacity:.4}
.g .val{font-size:7.5vw;white-space:nowrap}
.g .val s{text-decoration:none;position:relative;display:inline-block}
.g .val s::after{content:"";position:absolute;left:-2%;right:-2%;top:50%;height:1vw;background:var(--da-accent);transform:scaleX(0);transform-origin:0 50%;border-radius:1vw}
.g .apres .val{color:var(--da-accent);font-size:9.5vw}`,
    animation: ENTREE + `
.g .avant{animation:g-monte .55s cubic-bezier(.2,.9,.2,1) both,g-efface .5s ease both;animation-delay:.4s,1.5s}
.g .val s::after{animation:g-pousse .4s cubic-bezier(.2,.9,.2,1) both;animation-delay:1.3s}
.g .fleche{animation:g-monte .4s cubic-bezier(.2,.9,.2,1) both;animation-delay:1.6s}
.g .apres{animation:g-frappe .6s cubic-bezier(.2,.9,.2,1) both;animation-delay:1.9s}
@keyframes g-efface{from{opacity:1}to{opacity:.4}}
@keyframes g-pousse{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes g-frappe{from{opacity:0;transform:scale(1.5) translateX(3vw)}70%{transform:scale(.97)}to{opacity:1;transform:none}}`,
    duree: 3.6,
  },
  "opposition": {
    id: "integre-opposition", nom: "Opposition", forme: "opposition", cree: 0,
    description: "Deux volets face à face. Le premier glisse de la gauche, le second — en accent — répond de la droite, et le premier s'efface un peu.",
    html: `<span class="lueur"></span><div class="carte"><div class="vs"><div class="g1"><b>{{gauche.0}}</b><i>{{gauche.1}}</i></div><div class="d1"><b>{{droite.0}}</b><i>{{droite.1}}</i></div></div></div>`,
    css: SOCLE + `
.g .carte{padding:5vw}
.g .vs{display:flex;gap:2.5vw;align-items:stretch}
.g .vs > div{flex:1;border-radius:calc(var(--da-rayon) * .7);padding:3.6vw 3.2vw;background:color-mix(in srgb,currentColor 11%,transparent);display:flex;flex-direction:column;justify-content:center;gap:1.2vw}
.g .vs b{font-size:4.6vw;font-weight:var(--da-graisse);letter-spacing:var(--da-interlettrage);line-height:1.02}
.g .vs i{font-style:normal;font-family:var(--da-util);font-size:2.3vw;opacity:.7;line-height:1.25}
.g .d1{background:var(--da-accent);color:var(--da-fond-sombre)}
.g .d1 i{opacity:.8}`,
    animation: ENTREE + `
.g .g1{animation:g-gauche .55s cubic-bezier(.2,.9,.2,1) both,g-efface .5s ease both;animation-delay:.4s,1.7s}
.g .d1{animation:g-droite .6s cubic-bezier(.2,.9,.2,1) both;animation-delay:1.2s}
@keyframes g-gauche{from{opacity:0;transform:translateX(-8vw)}to{opacity:1;transform:none}}
@keyframes g-droite{from{opacity:0;transform:translateX(10vw) scale(.94)}to{opacity:1;transform:none}}
@keyframes g-efface{from{opacity:1}to{opacity:.55}}`,
    duree: 3.2,
  },
  "barres": {
    id: "integre-barres", nom: "Barres", forme: "barres", cree: 0,
    description: "Des barres horizontales avec leur pourcentage. Elles poussent depuis zéro, l'une après l'autre, et le chiffre tombe quand la barre est pleine.",
    html: `<span class="lueur"></span><div class="carte">{{#items}}<div class="bar"><span>{{label}}</span><u><i style="width:{{pct}}%"></i></u><b>{{pct}} %</b></div>{{/items}}</div>`,
    css: SOCLE + `
.g .bar{display:flex;align-items:center;gap:2.6vw;margin:1.3vw 0}
.g .bar span{font-family:var(--da-util);font-size:2.4vw;opacity:.75;width:22vw;line-height:1.15}
.g .bar u{flex:1;height:4.2vw;background:color-mix(in srgb,currentColor 13%,transparent);border-radius:2.1vw;overflow:hidden;text-decoration:none}
.g .bar u i{display:block;height:100%;background:var(--da-accent);border-radius:2.1vw;transform-origin:0 50%}
.g .bar b{font-size:4vw;font-weight:var(--da-graisse);width:12vw;text-align:right;font-variant-numeric:tabular-nums}`,
    animation: ENTREE + `
.g .bar{animation:g-monte .5s cubic-bezier(.2,.9,.2,1) both}
.g .bar u i{animation:g-pousse .9s cubic-bezier(.2,.9,.2,1) both}
.g .bar b{animation:g-tombe .4s cubic-bezier(.2,.9,.2,1) both}
${[0, 1, 2, 3, 4, 5].map(k =>
  `.g .bar:nth-child(${k + 1}){animation-delay:${(.3 + k * .12).toFixed(2)}s}` +
  `.g .bar:nth-child(${k + 1}) u i{animation-delay:${(.8 + k * .55).toFixed(2)}s}` +
  `.g .bar:nth-child(${k + 1}) b{animation-delay:${(1.5 + k * .55).toFixed(2)}s}`).join("\n")}
@keyframes g-pousse{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes g-tombe{from{opacity:0;transform:translateY(-1.5vw)}to{opacity:1;transform:none}}`,
    duree: 4,
  },
  "pyramide": {
    id: "integre-pyramide", nom: "Pyramide", forme: "pyramide", cree: 0,
    description: "Des niveaux empilés, du socle au sommet. Ils se posent l'un sur l'autre en montant ; le sommet, en accent, arrive en dernier.",
    html: `<span class="lueur"></span><div class="carte"><div class="pyr">{{#niveaux}}<div>{{.}}</div>{{/niveaux}}</div></div>`,
    css: SOCLE + `
.g .carte{padding:3.5vw 6vw}
.g .pyr{display:flex;flex-direction:column-reverse;align-items:center;gap:.9vw}
.g .pyr div{border-radius:calc(var(--da-rayon) * .5);padding:1.4vw 0;text-align:center;font-size:2.9vw;font-weight:var(--da-graisse);letter-spacing:var(--da-interlettrage);background:color-mix(in srgb,currentColor 12%,transparent);width:100%;transform-origin:50% 100%}
.g .pyr div:nth-child(2){width:80%}
.g .pyr div:nth-child(3){width:60%}
.g .pyr div:nth-child(4){width:42%}
.g .pyr div:nth-child(5){width:28%}
.g .pyr div:nth-child(n+6){width:20%}
.g .pyr div:last-child{background:var(--da-accent);color:var(--da-fond-sombre)}`,
    animation: ENTREE + `
.g .pyr div{animation:var(--kf,g-pose) .55s cubic-bezier(.2,.9,.2,1) both}
${[0, 1, 2, 3, 4, 5].map(k => `.g .pyr div:nth-child(${k + 1}){animation-delay:${(.4 + k * .45).toFixed(2)}s}`).join("\n")}
.g .pyr div:last-child{--kf:g-sommet;animation-duration:.6s}
@keyframes g-pose{from{opacity:0;transform:translateY(3vw) scaleY(.6)}to{opacity:1;transform:none}}
@keyframes g-sommet{from{opacity:0;transform:translateY(-4vw) scale(1.3)}70%{transform:scale(.97)}to{opacity:1;transform:none}}`,
    duree: 3.8,
  },
};

export const integre = (forme: string): Gabarit | undefined => (INTEGRES as Record<string, Gabarit>)[forme];

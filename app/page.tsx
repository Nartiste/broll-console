import Link from "next/link";
import Depot from "@/components/Depot";

const FLUX = [
  { b: "Le script", s: "Vous déposez le fichier. Rien d'autre à préparer." },
  { b: "L'analyse", s: "Chaque passage est noté, puis alloué sous contrainte de rythme." },
  { b: "La planche", s: "Trois propositions par insert. Vous tranchez.", cle: true },
  { b: "La production", s: "Seuls les inserts validés partent en génération." },
  { b: "Le dossier", s: "Numéroté en ordre de script. Plus qu'à poser." },
];

export default function Accueil() {
  return (
    <div className="funnel">
      <header className="nav">
        <span className="marque">Console <i>B-roll</i></span>
        <div className="droite">
          <Link className="btn fantome" href="/login">Se connecter</Link>
        </div>
      </header>

      <section className="hero">
        <span className="eyebrow">Pour les vidéos face caméra écrites d&apos;avance</span>
        <h1>Votre script sait déjà <em>où mettre les images</em></h1>
        <p className="accroche">
          Déposez le script. Recevez la liste des B-roll et des motion design à poser sur votre
          timeline, dans votre direction artistique — et validez chaque plan sur une planche de
          vignettes <strong>avant</strong> qu&apos;un seul euro de génération soit dépensé.
        </p>
        <Depot />
      </section>

      <div className="flux">
        {FLUX.map(p => (
          <div key={p.b} className={"pas" + (p.cle ? " cle" : "")}>
            <b>{p.b}</b>
            <span>{p.s}</span>
          </div>
        ))}
      </div>

      <section className="section">
        <h2>La porte de validation se place avant la dépense, pas après</h2>
        <p className="chapeau">
          La plupart des outils génèrent tout, puis vous laissent trier. Vous avez alors payé
          chaque plan, y compris ceux que vous jetez — et votre validation ne valide plus rien,
          elle trie des déchets. Ici, on vous montre des vignettes en images fixes : une image
          coûte une fraction d&apos;une vidéo, et l&apos;image que vous approuvez sert
          d&apos;entrée à la génération. Le clip final ressemble à ce que vous avez vu.
        </p>
      </section>

      <section className="section">
        <h2>Deux moteurs, parce qu&apos;un B-roll et un motion design n&apos;ont rien en commun</h2>
        <p className="chapeau">
          C&apos;est la distinction que les outils génériques ratent — et c&apos;est elle qui
          décide de la qualité du résultat. L&apos;aiguillage ne se fait pas à la main : il se
          déduit du passage. Ce qui est concret et se filme part en génération. Ce qui est
          abstrait — une liste, un pourcentage, un framework — part en gabarit.
        </p>
        <div className="duo">
          <div className="carte">
            <span className="eyebrow">Moteur 1</span>
            <h3>B-roll</h3>
            <p className="muet">Génération probabiliste. Le monde visuel vient de votre moodboard.</p>
            <dl>
              <div><dt>Coût</dt><dd>par clip, à chaque essai</dd></div>
              <div><dt>Résultat</dt><dd>imprévisible</dd></div>
              <div><dt>Validation</dt><dd>indispensable</dd></div>
              <div><dt>Texte à l&apos;écran</dt><dd>impossible</dd></div>
            </dl>
          </div>
          <div className="carte">
            <span className="eyebrow">Moteur 2</span>
            <h3>Motion design</h3>
            <p className="muet">Gabarit paramétré, rendu dans votre charte. Déterministe.</p>
            <dl>
              <div><dt>Coût</dt><dd>une fois, à la fabrication</dd></div>
              <div><dt>Résultat</dt><dd>prévisible</dd></div>
              <div><dt>Validation</dt><dd>inutile</dd></div>
              <div><dt>Texte à l&apos;écran</dt><dd>natif et lisible</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Trois portes, dans cet ordre</h2>
        <div className="jalons">
          <div className="carte">
            <span className="n mono">Porte 1</span>
            <h3>Cadrage</h3>
            <p>
              Deux curseurs — nombre maximum d&apos;inserts, durée maximum de chacun. Ils bornent
              le coût de la vidéo avant la première génération.
            </p>
          </div>
          <div className="carte">
            <span className="n mono">Porte 2</span>
            <h3>Direction artistique</h3>
            <p>
              La charte du projet, plus le contrôle de dérive colorimétrique des rendus. Si la
              direction est fausse, les trente vignettes le sont aussi.
            </p>
          </div>
          <div className="carte">
            <span className="n mono">Porte 3</span>
            <h3>La planche</h3>
            <p>
              Trois variantes par insert, trois états, une raison en un clic quand vous écartez.
              Un ruban montre le rythme et les trous, pendant que vous triez.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>Une raison qui revient dix fois ne parle pas des vignettes</h2>
        <p className="chapeau">
          Elle parle de la direction artistique. C&apos;est pour ça que rejeter un plan coûte un
          clic et que la raison coûte un mot : ces étiquettes remontent, s&apos;agrègent, et
          diagnostiquent la charte extraite plutôt que les images une par une. Un outil qui ne
          récolte que des oui et des non refait la même erreur à chaque vidéo.
        </p>
      </section>

      <section className="final carte">
        <h2>Le script est déjà écrit. Le reste devrait suivre.</h2>
        <p>
          Essayez sur un script d&apos;exemple, ou déposez le vôtre. Rien n&apos;est généré,
          rien n&apos;est facturé tant que vous n&apos;avez pas validé la planche.
        </p>
        <div className="actions">
          <Link className="btn large" href="/studio">Ouvrir la console</Link>
          <Link className="btn fantome large" href="/login">Créer un compte</Link>
        </div>
      </section>

      <footer className="pied">
        <span>Console B-roll</span>
        <span className="mono">v0.1</span>
        <a href="https://github.com/Nartiste/broll-console">Code source</a>
      </footer>
    </div>
  );
}

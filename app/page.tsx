import Link from "next/link";
import Galaxie from "@/components/Galaxie";
import "./landing.css";

export default function Accueil() {
  return (
    <div className="landing">
      <header className="l-nav">
        <div className="l-in">
          <Link href="/" className="l-marque"><b>B</b>Console B-roll</Link>
          <nav>
            <a href="#resultats">Résultats</a>
            <a href="#comment">Comment ça marche</a>
            <a href="#moteurs">Deux moteurs</a>
            <a href="#mesure">Sur mesure</a>
            <a href="https://github.com/Nartiste/broll-console">Code source</a>
          </nav>
          <div className="l-droite">
            <Link href="/login" className="l-btn ghost">Se connecter</Link>
            <span className="l-tag">
              <Link href="/studio" className="l-btn">Commencer</Link>
              <small>Accès anticipé</small>
            </span>
          </div>
        </div>
      </header>

      <section className="l-hero">
        <Galaxie />
        <div className="l-in">
          <span className="l-chip"><i />Console B-roll · pour les vidéos face caméra</span>
          <h1 className="l-h1">
            Votre script <span className="glyphe">▶</span> sait déjà<br />
            où vont <em>les images</em>
          </h1>
          <p className="l-sous">
            Déposez le script. Validez la planche. Récupérez les B-roll et le motion design,
            dans votre charte — sans payer une seule génération que vous n&apos;avez pas approuvée.
          </p>

          <div className="l-parcours">
            <div>
              <span className="l-num">1</span>
              <b>Déposez votre script</b>
              <span>PDF, Word ou texte. Au format prompteur, l&apos;analyse lit vos propres marques.</span>
              <Link href="/studio" className="l-btn">Commencer</Link>
            </div>
            <div>
              <span className="l-num">2</span>
              <b>Validez la planche</b>
              <span>Trois propositions par insert. Vous gardez, vous ajustez, vous écartez — au clavier.</span>
              <Link href="/studio" className="l-btn blanc">Voir un exemple</Link>
            </div>
            <div>
              <span className="l-num">3</span>
              <b>Récupérez le dossier</b>
              <span>Numéroté en ordre de script. Plus qu&apos;à poser sur la timeline.</span>
              <a href="#comment" className="l-btn ghost">Comment ça marche</a>
            </div>
          </div>
        </div>
      </section>

      <section className="l-section l-in" id="resultats">
        <div className="l-tete">
          <div>
            <span className="l-eyebrow">Ce qui sort de la console</span>
            <h2>Des images, pas des promesses</h2>
          </div>
          <Link href="/studio" className="l-btn ghost">Essayer sur un script d&apos;exemple</Link>
        </div>
        <div className="l-galerie">
          <figure className="l-carte">
            <span className="l-etiq">B-roll généré</span>
            <img src="/apercu/broll.jpg" alt="B-roll généré dans le registre 3D wireframe vert : un homme affalé sur un canapé devant un écran" />
            <figcaption>Généré dans le registre extrait de vos références. Validé sur vignette avant la moindre dépense.</figcaption>
          </figure>
          <figure className="l-carte">
            <span className="l-etiq">Motion · votre charte</span>
            <img src="/apercu/motion.png" alt="Gabarit motion sur mesure : barre d'étapes 01 02 03 dans une charte noir et vert fluo" />
            <figcaption>Un gabarit extrait d&apos;un composant que vous aimez, rempli avec le contenu de votre script.</figcaption>
          </figure>
          <figure className="l-carte">
            <span className="l-etiq">La planche</span>
            <div className="l-planche">
              <div className="l-rep">« 2 000 abonnés et ZÉRO client payant »</div>
              <div className="l-var"><div className="on" /><div /><div /></div>
              <div className="l-dec"><span className="on">Garder</span><span>Presque</span><span>Écarter</span></div>
            </div>
            <figcaption>Trois variantes, trois états, une raison en un clic. Un ruban montre le rythme pendant que vous triez.</figcaption>
          </figure>
        </div>
      </section>

      <section className="l-section l-in" id="comment">
        <div className="l-tete">
          <div>
            <span className="l-eyebrow">Comment ça marche</span>
            <h2>Trois portes avant la moindre dépense</h2>
          </div>
        </div>
        <div className="l-etapes">
          <div>
            <span className="l-code">01</span>
            <h3>Cadrage</h3>
            <p>Nombre maximum d&apos;inserts, durée maximum de chacun, débit de parole. Trois curseurs qui bornent la facture avant la première génération.</p>
          </div>
          <div>
            <span className="l-code">02</span>
            <h3>Direction artistique</h3>
            <p>Vous ne décrivez pas votre charte : vous la montrez. Moodboard, document, captures — elle en est déduite, puis corrigée à la main ou sur consigne.</p>
          </div>
          <div>
            <span className="l-code">03</span>
            <h3>La planche</h3>
            <p>Trois vignettes par insert. Garder, presque, écarter — et une raison en un clic, qui remonte pour diagnostiquer la charte plutôt que les images une par une.</p>
          </div>
        </div>
      </section>

      <section className="l-section l-in" id="moteurs">
        <div className="l-tete">
          <div>
            <span className="l-eyebrow">Pourquoi ça marche</span>
            <h2>Un B-roll et un motion design n&apos;ont rien en commun</h2>
            <p className="l-chapeau">
              Les outils génériques confondent les deux. Ici, l&apos;aiguillage se déduit du passage : ce qui se
              filme part en génération, ce qui ne se filme pas — une liste, un pourcentage, un framework —
              part en gabarit. L&apos;abstrait ne se filme pas, il se dessine.
            </p>
          </div>
        </div>
        <div className="l-moteurs">
          <div className="l-moteur">
            <span className="l-eyebrow">Moteur 1</span>
            <h3>B-roll</h3>
            <p className="l-desc">Génération d&apos;images puis de clips, dans le registre de vos références.</p>
            <dl>
              <div><dt>Nature</dt><dd>probabiliste</dd></div>
              <div><dt>Coût</dt><dd>par clip, à chaque essai</dd></div>
              <div><dt>Validation</dt><dd className="oui">indispensable — sur vignette</dd></div>
              <div><dt>Texte à l&apos;écran</dt><dd>impossible</dd></div>
            </dl>
          </div>
          <div className="l-moteur">
            <span className="l-eyebrow">Moteur 2</span>
            <h3>Motion design</h3>
            <p className="l-desc">Gabarits rendus dans votre charte. Déterministes : ce que vous voyez est le résultat.</p>
            <dl>
              <div><dt>Nature</dt><dd>gabarit paramétré</dd></div>
              <div><dt>Coût</dt><dd className="oui">une fois, à la fabrication</dd></div>
              <div><dt>Validation</dt><dd>inutile</dd></div>
              <div><dt>Texte à l&apos;écran</dt><dd className="oui">natif et lisible</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="l-section l-in" id="mesure">
        <div className="l-mesure">
          <div>
            <span className="l-eyebrow">Sur mesure</span>
            <h2 style={{ marginTop: 14 }}>Vous montrez un bouton. Vous obtenez ce bouton.</h2>
            <p className="l-chapeau">
              Les gabarits ne sont pas neuf dessins imposés. Ce sont neuf rôles de contenu — une liste, un
              chiffre, une opposition — que vos composants habillent.
            </p>
            <ul>
              <li>Déposez la capture d&apos;un composant que vous aimez : sa structure devient un gabarit.</li>
              <li>Chaque insert de cette forme le porte ensuite, avec son propre contenu, dans votre charte.</li>
              <li>Trop de marge, pilule trop grosse ? Écrivez-le. Le gabarit se réécrit sans repartir de zéro.</li>
            </ul>
          </div>
          <img src="/apercu/motion.png" alt="Barre d'étapes extraite d'une référence After Effects, remplie avec la règle des 3C" />
        </div>
      </section>

      <section className="l-acces">
        <div className="l-in">
          <span className="l-chip"><i />Accès anticipé</span>
          <h2 style={{ marginTop: 22 }}>Le script est déjà écrit. Le reste devrait suivre.</h2>
          <p>
            Essayez sur un script d&apos;exemple, ou déposez le vôtre. Rien n&apos;est généré, rien n&apos;est
            facturé tant que vous n&apos;avez pas validé la planche.
          </p>
          <div className="l-actions">
            <Link href="/studio" className="l-btn grand">Ouvrir la console</Link>
            <Link href="/login" className="l-btn ghost grand">Recevoir un lien de connexion</Link>
          </div>
        </div>
      </section>

      <footer className="l-in">
        <span>Console B-roll</span>
        <span className="mono">v0.2</span>
        <div className="l-fin">
          <a href="https://github.com/Nartiste/broll-console">Code source</a>
          <Link href="/login">Se connecter</Link>
        </div>
      </footer>
    </div>
  );
}

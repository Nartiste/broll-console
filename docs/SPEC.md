# Décisions de conception

Chaque décision ci-dessous vient d'un arbitrage explicite. Les notes brutes de la séance de
cadrage sont dans `brainstorms/` (non versionné).

## Ce qui est tranché

**Le périmètre commence après le dérush.** L'ingest, la synchronisation audio/image et le
dérush restent manuels. L'outil prend le relais quand le montage existe.

**La porte de validation se place avant la génération, pas après.** On valide l'intention.
Le logiciel ne dépense jamais de compute sur un insert non validé. Corollaire accepté : il
faut une boucle de relance pour les clips qui sortent ratés malgré une intention validée —
le hasard est dans la machine, pas dans le jugement.

**La surface de validation est une planche de vignettes en images fixes.** Une image coûte
une fraction d'une vidéo, et l'image validée devient l'input `image-to-video` : le clip final
ressemble à la vignette approuvée. On ne juge pas une promesse, on juge le plan.

**Trois variantes par insert, pas une.** Choisir est plus rapide et plus juste que juger dans
l'absolu. Devant une seule image on hésite ; devant trois on tranche en une seconde. L'étage
image est l'étage bon marché du pipeline — c'est là qu'il faut être généreux.

**La sélection est une allocation sous contrainte, pas une classification par phrase.** Un
classifieur local produit toujours le même défaut : dense en introduction, désert ensuite.
On note tous les passages, puis on sélectionne sous plafond et sous contraintes d'écart. La
note dit le mérite ; la sélection dit le rythme.

**Deux curseurs bornent le coût en amont** : nombre maximum d'inserts, et durée maximum par
insert. Validés par l'utilisateur avant tout travail.

**La durée d'un insert se déduit du nombre de mots du passage couvert.** Pas de durée fixe,
pas de réglage manuel. Le curseur ne fait que plafonner.

**Livraison en ordre de script, numérotée.** Le tournage au prompteur garantit que l'ordre du
montage suit l'ordre du script : on descend le dossier en descendant la timeline. Aucun
timecode nécessaire.

**La DA est une configuration, jamais du code en dur.** L'outil est destiné à des clients :
multi-locataire dès la conception.

**Une passe de mise en charte suit la génération.** Mesuré sur un clip de référence : le
modèle rend la bonne famille de teinte mais s'effondre en saturation (41 % au lieu de 100 %),
et le fond dérive vers une dominante colorée au lieu du neutre. Sans recalage automatique, on
livre des plans systématiquement hors charte — invisible plan par plan, sensible sur quinze
minutes.

## Ce qui a été écarté, et pourquoi

**L'insertion automatique dans la timeline Premiere.** Reportée. Elle exige une transcription
horodatée de la séquence montée, recalée sur le script — et surtout elle ne survit pas à la
dérive : toute recoupe décale tout ce qui suit. Le drag & drop manuel est un choix assumé, pas
un pis-aller. À rouvrir en V2, à faible coût : Premiere produit déjà la transcription.

**Le critère négatif** (ne pas couvrir les moments où l'auteur est bon face caméra). Écarté
pour un dispositif en plan fixe : il n'y a pas de meilleure prise à protéger. Conséquence
inverse à retenir : si l'image est immobile, **le B-roll porte toute la variation visuelle**.
Le risque n'est pas de trop couvrir, c'est de pas assez — l'écart maximum devient le paramètre
critique, pas l'écart minimum. À rouvrir si le dispositif de tournage change.

**Le photoréalisme comme objectif.** Le registre visuel se décide dans la DA, il n'est pas
imposé par le moteur. Une image générée peut être assumée comme image — stylisée,
manifestement construite. Elle cesse alors d'être du remplissage et devient une signature.

## Architecture

**Application web** : Next.js sur Vercel, Supabase pour Postgres, Auth et Storage (moodboards,
vignettes, clips), RLS dès le premier jour puisque c'est multi-client.

**Génération** : BytePlus ModelArk en direct — Seedance pour la vidéo, Seedream pour les
images. Un seul fournisseur, une seule clé, les deux étages du pipeline. Une couche
`providers/` garde la décision réversible.

**La file d'attente est structurante.** L'API ModelArk est asynchrone par conception : on crée
une tâche, on interroge son statut. Trente clips prennent des dizaines de minutes — bien
au-delà de ce qu'une fonction serverless supporte. Donc jamais d'appel synchrone : les jobs
vont en base, un cron Vercel fait avancer la file, la planche se met à jour toute seule. Le
mode documenté est le **polling**, pas le webhook.

**Le moteur motion ne peut pas être After Effects** : c'est une application de bureau, elle ne
tourne pas sur Vercel. Piste retenue : Remotion (React rendu en MP4). La charte est déjà
écrite en vocabulaire CSS — `border-radius`, `transform: rotate(-3deg)`, dégradés radiaux,
`letter-spacing` — donc les gabarits sont des composants et la DA des tokens. After Effects
reste disponible en local, via son plugin, pour les pièces d'exception.

## Le vocabulaire des gabarits

Six à dix formes couvrent l'essentiel. La variété d'une vidéo n'est pas dans les formes, elle
est dans le contenu qu'on verse dedans.

`liste-3` · `liste-5` · `mot-choc` · `chiffre` · `duo-chiffres` · `avant-apres` ·
`opposition` · `barres` · `pyramide`

## Questions ouvertes

- Le budget réel par vidéo n'a jamais été chiffré.
- Le débit de parole est supposé à 135 mots/minute — à mesurer une fois sur une vidéo passée
  (nombre de mots du script / durée réelle). Toutes les durées en dépendent.
- Le son des clips générés : à garder ou à jeter ?
- Gestion des échecs de génération, reprise d'une session de tri interrompue.
- Canal de notification quand la planche puis le package sont prêts.
- Bibliothèque d'inserts réutilisables d'une vidéo à l'autre.
- Sur le premier passage réel : couverture de 24 % du montage et 60 % de motion design. Les
  deux chiffres méritent un arbitrage avant d'écrire le backend.

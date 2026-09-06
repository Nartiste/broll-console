# Console B-roll

Déposez le script d'une vidéo face caméra. Recevez les B-roll et le motion design à poser sur
la timeline — **validés avant la moindre dépense de génération**.

```bash
npm install
npm run dev        # http://localhost:3210
```

Aucun compte, aucune clé d'API : la console s'ouvre en mode local et un script d'exemple est
fourni. Glissez `exemples/script-demo.txt` sur la page d'accueil pour voir le pipeline tourner.

## Le geste d'entrée

Tout part du dépôt du script. Pas de configuration préalable : le cadrage et la direction
artistique se règlent une fois le plan sous les yeux, pas dans le vide.

```
script déposé
   ↓
notation de chaque passage        (imageabilité × abstraction, directives, chiffres, capitales)
   ↓
allocation sous contrainte        (plafond, écart minimum, écart maximum, repêchage)
   ↓
┌─────────────────┬─────────────────┐
│ B-roll          │ Motion design   │   l'aiguillage se déduit du passage,
│ génération      │ gabarit rendu   │   il ne se décide pas à la main
└─────────────────┴─────────────────┘
   ↓
PLANCHE DE VALIDATION             ← trois variantes, trois états, une raison en un clic
   ↓
production                        ← seuls les inserts validés partent en génération
   ↓
dossier numéroté en ordre de script
```

## Les trois étapes

1. **Cadrage** — nombre maximum d'inserts, durée maximum de chacun, débit de parole. Ces trois
   curseurs bornent le coût de la vidéo *avant* la première génération.
2. **Direction artistique** — la charte du projet et le contrôle de dérive colorimétrique des
   rendus. Si la direction est fausse, toutes les vignettes le sont.
3. **La planche** — le tri. Au clavier : `←` `→` naviguer, `1` garder, `2` presque, `3`
   écarter, `A`/`B`/`C` choisir une variante.

## Deux moteurs

Un B-roll et un motion design n'ont rien en commun, et confondre les deux est la faute qui
abîme le résultat.

|                         | **B-roll**              | **Motion design**        |
| ----------------------- | ----------------------- | ------------------------ |
| Nature                  | génération probabiliste | gabarit paramétré, rendu |
| Coût                    | par clip, à chaque essai| une fois, à la fabrication |
| Résultat                | imprévisible            | prévisible               |
| Validation avant dépense | **indispensable**       | inutile                  |
| Texte lisible à l'écran | impossible              | natif                    |

L'aiguillage se déduit du croisement **imageabilité × abstraction** du passage. Ce qui est
concret et se filme part en génération. Ce qui est abstrait — une liste, un pourcentage, un
framework — part en gabarit. L'abstrait ne se filme pas, il se dessine.

Neuf gabarits couvrent l'essentiel : `liste-3` · `liste-5` · `mot-choc` · `chiffre` ·
`duo-chiffres` · `avant-apres` · `opposition` · `barres` · `pyramide`.

## Le format d'entrée

Un fichier texte au **format prompteur** : une idée par ligne, les mots accentués en
capitales, les directives entre crochets — `[PAUSE]`, `[ACCENTUER]`, `[RALENTIR]`,
`[NOUVELLE SECTION]`, `[COMPTER]`, `[REGARD CAMÉRA]`.

Ce n'est pas une contrainte arbitraire. Ces annotations portent déjà l'arc rhétorique, le
rythme et les énumérations : l'outil lit des marques au lieu de deviner des intentions.

## Structure

```
app/page.tsx              la page de vente et le dépôt du script
app/login/                connexion (Supabase Auth à brancher)
app/studio/               la coque de l'application
app/studio/[projet]/      un projet ouvert
components/Console.tsx    les trois étapes
components/Vignette.tsx   rendu des gabarits, aperçus factices pour les B-roll
lib/analyse.ts            notation puis allocation sous contrainte
lib/da.ts                 la charte comme configuration, et le contrôle de dérive
lib/store.ts              stockage local — remplacé par Supabase sans toucher aux composants
```

Aucune identité de marque n'est codée en dur : le chrome de l'application est neutre, et seule
la planche se rend dans la charte du projet, par variables CSS posées en ligne. Les contenus
clients (scripts, chartes) ne sont pas versionnés.

## Comptes et synchronisation

Sans compte, tout vit dans le navigateur. Avec un compte (lien magique par e-mail, Supabase
Auth), chaque écriture part aussi vers le serveur, et les projets se retrouvent depuis n'importe
quel appareil. Le plus récent gagne.

Mise en place, une fois, dans le projet Supabase :

1. **SQL Editor** → exécuter `supabase/migrations/20260907_projets.sql` (table `projets`, RLS :
   chacun ne voit que les siens).
2. **Authentication → URL Configuration** : *Site URL* = l'adresse du site ; *Redirect URLs* +=
   `<adresse>/studio`.
3. **Authentication → SMTP** : l'expéditeur par défaut de Supabase est limité à quelques envois
   par heure — suffisant pour tester seul, pas pour un panel. Brancher un expéditeur (Resend,
   Postmark…) avant d'inviter des testeurs.
4. Variables Vercel : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

À la première connexion, le flanc propose de verser les projets locaux sur le compte.

## Ce qui n'est pas encore là

- L'extraction de la charte depuis un moodboard d'images
- Le palier d'analyse par modèle (imageabilité et rôle rhétorique jugés, pas déduits)
- L'appel aux modèles de génération et la file d'attente
- Le rendu des gabarits en vidéo
- La passe de mise en charte colorimétrique
- L'insertion automatique dans la timeline Premiere (reportée)

## Décisions de conception

Voir [`docs/SPEC.md`](docs/SPEC.md) — ce qui a été tranché, ce qui a été écarté, et pourquoi.

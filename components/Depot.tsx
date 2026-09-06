"use client";

/**
 * Le dépôt du script : le geste d'entrée du produit.
 *
 * Tout part de là. On glisse un fichier, l'analyse tourne, le projet s'ouvre.
 * Aucune étape de configuration avant — le cadrage et la direction artistique
 * se règlent une fois le plan sous les yeux, pas dans le vide.
 */

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { creer } from "@/lib/store";

const EXEMPLE = `Est-ce que vous vous êtes déjà demandé
pourquoi vos vidéos ne CONVERTISSENT pas ?

[PAUSE]

Pour cette vidéo
j'ai analysé 200 chaînes
interrogé 40 monteurs professionnels
et disséqué 1 000 heures de rushes

[TON SÉRIEUX]

Résultat des courses :
le problème n'est jamais le CONTENU
c'est le RYTHME

[NOUVELLE SECTION - PARTIE 1]

Prenons LUCAS

[RALENTIR]

Lucas filme seul
dans son bureau
un plan fixe
quarante minutes d'affilée

Résultat ?
800 vues
et ZÉRO commentaire

À côté SARAH
même sujet
même matériel

Mais Sarah coupe
elle illustre
elle RESPIRE

Résultat ?
120 000 vues
et 3 semaines de liste d'attente

[NOUVELLE SECTION - LA RÈGLE DES 3R]

Voici ce que j'appelle
la règle des 3R :

[COMPTER SUR LES DOIGTS]

Rythme
Respiration
Répétition

[ACCENTUER]

Le RYTHME d'abord

Une image qui ne bouge pas
pendant trente secondes
est une image MORTE

[NOUVELLE SECTION - DONNÉES]

J'ai mesuré la rétention
sur 200 vidéos

[PAUSE - ACCENTUER]

Résultat ?
68% des abandons
arrivent sur un plan fixe
de plus de vingt secondes

Seulement 9% arrivent
pendant un plan illustré

[REGARD CAMÉRA - TON DIRECT]

Les gens ne quittent pas
parce que vous êtes ENNUYEUX

Ils quittent parce que
rien ne BOUGE

[NOUVELLE SECTION - LA PYRAMIDE]

Je vais vous donner un framework
que j'appelle la 'Pyramide du montage'

[COMPTER]

Niveau 1 : La COUPE
Niveau 2 : L'ILLUSTRATION
Niveau 3 : Le MOTION
Niveau 4 : Le SOUND DESIGN

[NOUVELLE SECTION - CONCLUSION]

Sarah facturait 200 euros la vidéo
il y a dix-huit mois

Aujourd'hui elle facture 2 000 euros
et REFUSE du monde

[REGARD CAMÉRA - TON FINAL]

Le monteur qui applique ça
ne cherche plus de clients

Les clients le CHERCHENT`;

export default function Depot({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function avaler(fichier: File) {
    setErreur(null);
    if (fichier.size > 2_000_000) {
      setErreur("Fichier trop lourd — un script tient en quelques dizaines de kilo-octets.");
      return;
    }
    const texte = await fichier.text();
    if (texte.trim().length < 80) {
      setErreur("Ce fichier ne contient pas de script exploitable.");
      return;
    }
    const p = creer(texte, fichier.name);
    router.push(`/studio/${p.id}`);
  }

  function ouvrirExemple() {
    const p = creer(EXEMPLE, "Script d'exemple");
    router.push(`/studio/${p.id}`);
  }

  return (
    <div
      className={"depot" + (survol ? " survol" : "")}
      style={compact ? { padding: "30px 20px", marginTop: 0 } : undefined}
      onDragOver={e => { e.preventDefault(); setSurvol(true); }}
      onDragLeave={() => setSurvol(false)}
      onDrop={e => {
        e.preventDefault();
        setSurvol(false);
        const f = e.dataTransfer.files?.[0];
        if (f) avaler(f);
      }}
    >
      <h3>{survol ? "Lâchez, c'est bon" : "Déposez votre script ici"}</h3>
      <p>
        Un fichier texte au format prompteur — une idée par ligne, les mots accentués en
        capitales, les directives entre crochets. L'analyse démarre au dépôt.
      </p>
      {erreur && <p style={{ color: "var(--alerte)", marginTop: 10 }}>{erreur}</p>}
      <div className="ou">
        <button className="btn" onClick={() => input.current?.click()}>
          Choisir un fichier
        </button>
        <button className="btn fantome" onClick={ouvrirExemple}>
          Essayer avec un script d'exemple
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".txt,.md,.srt,text/plain"
        hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) avaler(f); }}
      />
    </div>
  );
}

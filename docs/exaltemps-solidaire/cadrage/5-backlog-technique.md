# Backlog technique

Découpage technique du backlog produit (`3-backlog.md`, EPIC-1 / P1-1 / P1-2 / P1-3)
en user stories implémentables une par une, dans l'ordre des dépendances réelles
(socle avant fonctionnalités visibles) plutôt que l'ordre du vote produit.

Statut de chaque US à mettre à jour au fil de l'implémentation : `à faire`,
`en cours`, `fait`.

## US-01 — Ingestion documentaire
- **statut** : à faire
- **taille** : S/M
- **description** : script/route qui lit les documents source (`documents-association/`,
  `matiere/`) et les découpe en chunks avec métadonnées.
- **critère d'acceptation** : un document texte connu ressort en N chunks, chacun
  porteur de `source`, `date_maj`, `auteur`.
- **dépendances** : aucune. Bloque US-02.

## US-02 — Indexation vectorielle / embeddings
- **statut** : à faire
- **taille** : M
- **description** : appel `task:embed` sur les chunks de US-01. Nécessite
  `OPENAI_API_KEY` dans `core-platform/.env` avant le premier seed (sinon
  `/v1/embeddings` répond 401 — voir `CLAUDE.md` racine du dépôt team09).
- **critère d'acceptation** : les chunks sont stockés avec leur vecteur, requêtables
  par similarité.
- **dépendances** : US-01.
- **point ouvert** : clé OPENAI à obtenir ou déjà disponible ? à trancher avant de
  démarrer.

## US-03 — Modèle de droits / profils
- **statut** : à faire
- **taille** : M
- **description** : table profils + mapping profil → bibliothèques autorisées
  (RH générale vs individuelle exclue, aucune donnée usager).
- **critère d'acceptation** : deux profils de test, requête sur le même corpus,
  résultats disjoints selon droits.
- **dépendances** : aucune, mais doit exister avant US-05.

## US-04 — Endpoint RAG côté API (`/api/v1/chat`)
- **statut** : à faire
- **taille** : M
- **description** : reçoit une question, recherche par similarité (US-02), construit
  le prompt avec passages + métadonnées, appelle le LLM déjà câblé.
- **critère d'acceptation** : réponse renvoyée avec `source`, `date_maj`, `auteur`
  explicites ; si aucun passage pertinent, réponse "je ne sais pas" plutôt qu'une
  réponse inventée.
- **dépendances** : US-01, US-02.

## US-05 — Filtrage des résultats par droits
- **statut** : à faire
- **taille** : S
- **description** : croise US-03 et US-04, la recherche vectorielle ne retourne que
  les chunks des bibliothèques autorisées pour le profil courant.
- **critère d'acceptation** : test avec deux profils → sources renvoyées différentes.
- **dépendances** : US-03, US-04.

## US-06 — Interface web chat (P1-1)
- **statut** : à faire
- **taille** : M
- **description** : front minimal, champ question, affichage réponse + source + date
  + auteur, appel `/api/v1/chat` en chemin relatif.
- **critère d'acceptation** : une question posée depuis le navigateur affiche une
  réponse sourcée.
- **dépendances** : US-04 (US-05 recommandé avant toute mise en situation réelle).

## US-07 — Authentification / sélection de profil
- **statut** : à faire
- **taille** : S/M
- **description** : login simple ou sélecteur de profil pour activer US-05 côté front.
- **critère d'acceptation** : se connecter en profil A vs B change les réponses
  possibles.
- **dépendances** : US-03, US-06.

## US-08 — Responsive mobile de l'interface (P1-2, léger)
- **statut** : à faire
- **taille** : S
- **description** : le chat de US-06 est utilisable sans confort dégradé sur mobile,
  sans connexion PC requise.
- **critère d'acceptation** : test sur viewport mobile, question → réponse dans le
  même écran.
- **dépendances** : US-06.

## US-09 — Canal SAV / vocal (P1-2, ambitieux)
- **statut** : à faire
- **taille** : L
- **description** : appel vocal type SAV (`screen-3` du prototype cliquable).
  Techniquement lourd (téléphonie, speech-to-text) : à traiter en dernier,
  potentiellement hors scope hackathon.
- **dépendances** : US-04.

## Pourquoi cet ordre diffère du vote produit
Le backlog produit vote P1-1 > P1-2 > P1-3. Livrer P1-1 sans US-03/US-05 revient à
exposer tout le corpus RH sans droits, ce qui viole une contrainte actée du thème
(« le cloisonnement des accès est une orientation actée de la DSI, une proposition
qui l'ignore sera écartée » — voir `contexte/theme.md`). Le socle d'accès doit donc
précéder la mise en visible côté implémentation, même si le produit garde son rang
de vote pour la présentation finale.

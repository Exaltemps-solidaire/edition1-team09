# edition1-team09

Hackathon — application de l'équipe edition1-team09 (La Sauvegarde du Nord :
rendre l'information interne accessible aux professionnels de terrain).

## Structure

- `frontend/` — interface chat (Next.js). Voir `adr.md` pour l'écart Next.js
  vs. React+Vite non tranché.
- `api/` — ingestion documentaire + indexation vectorielle (TypeScript, Bun).
  Aucune route HTTP pour l'instant : scripts + modules réutilisables par
  US-04.
- `docs/exaltemps-solidaire/` — copie de travail du cadrage hackathon
  (`cadrage/`, `contexte/`, `matiere/`, `documents-association/`), synchronisée
  depuis `/srv/team09/exaltemps-solidaire`.
- `bootstrap.sh` — provisionne la base Postgres de l'app (`team09`) et active
  l'extension `pgvector` (rôle root, jamais dans une migration applicative).

## Corpus (fiche R-12-01)

- **Nature** : `documents-association/questions-agent-interne.docx` (liste de
  questions RH/Octime/informatique/dialogue social, catégorisée — **sans
  réponses**, voir limitation ci-dessous) et `matiere/*.md` (notes d'atelier
  de cadrage hackathon, contenu méta plutôt que métier).
- **Extraction** : `mammoth` pour `.docx`, lecture brute UTF-8 pour `.md`/`.txt`
  (`api/src/extract.ts`).
- **Chunking** : découpage par paragraphe (double saut de ligne), taille
  cible ~500 caractères, chevauchement ~80 caractères entre chunks
  consécutifs ; repli en découpage dur pour tout paragraphe qui dépasse à lui
  seul la taille cible (`api/src/chunk.ts`).
- **Métadonnées par chunk** : `source` (chemin relatif dans le corpus),
  `date_maj`, `auteur` — voir limitation ci-dessous — portées par la table
  `documents` (une ligne par fichier source, un hash de contenu pour ne
  ré-indexer que ce qui a changé, R-12-03).
- **Modèle d'embedding** : `task:embed` (alias de passerelle, proxie
  `text-embedding-3-small`, 1536 dimensions), stocké dans
  `chunks.embedding_model` par chunk pour traçabilité si le modèle change un
  jour.
- **Limitation connue — pas de vraies réponses** : le seul document métier
  réel est une liste de *questions*, sans réponses associées. Le pipeline
  technique (ingestion → chunks → embeddings → recherche par similarité) est
  démontrable de bout en bout dessus, mais **ne constitue pas un corpus RAG
  exploitable en l'état** pour répondre correctement à un professionnel de
  terrain. À traiter avant US-04 réel/US-06 : trouver ou produire du contenu
  avec des réponses.
- **Limitation connue — pas de date/auteur par fichier** : aucune métadonnée
  de date de dernière modification ni d'auteur individuel n'existe dans les
  fichiers sources. `date_maj` est fixée à la date de la séance de cadrage
  (2026-09-24, seule date fiable disponible) et `auteur` à "La Sauvegarde du
  Nord" (auteur collectif). À corriger si des métadonnées fiables par
  document deviennent disponibles.

## US-01 / US-02 — statut

- **US-01 (ingestion)** : fait. `bun run seed` (dans `api/`) lit
  `documents-association/` et `matiere/`, extrait le texte, découpe en chunks
  avec métadonnées complètes.
- **US-02 (embeddings)** : le pipeline est codé et testé (stockage + requête
  de similarité pgvector, `api/src/db.test.ts`), mais **bloqué en exécution
  réelle** : `task:embed` proxie toujours OpenAI (`text-embedding-3-small`),
  même en mode `anthropic`, et `OPENAI_API_KEY` n'a volontairement pas été
  fournie pour l'instant. `bun run seed` échoue donc avec un `401` explicite
  et actionnable (`api/src/embed.ts`, `EmbeddingAuthError`), pas un vecteur
  factice silencieux.

  Pour lever le blocage : poser `OPENAI_API_KEY=…` dans
  `core-platform/core-platform/.env`, relancer
  `./onboard-app.sh team09` (depuis `core-platform/core-platform/`), puis
  `bun run seed` (depuis `api/`). Le pipeline réessaiera automatiquement les
  documents dont les chunks n'ont pas encore été insérés (voir `upsertDocument`
  dans `api/src/db.ts` : un hash de contenu inchangé mais sans chunk associé
  redemande un ré-embedding, pour ne pas perdre silencieusement un document
  suite à un échec partiel précédent).

## Lancer l'ingestion (`api/`)

Prérequis : le socle plateforme tourne (`gitlab-ci-local
--force-shell-executor` depuis `core-platform/core-platform/`) et
`./bootstrap.sh` (à la racine de ce dépôt) a été exécuté au moins une fois.

```bash
cd api
bun install
bun test        # unitaires (chunking) + intégration Postgres (upsert, similarité)
bun run seed    # ingestion + embeddings réels — 401 attendu tant que OPENAI_API_KEY est absente
```

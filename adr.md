# Architecture Decision Record (ADR)

This file is the **single log** of the project's architecture decisions (framework/library choices, structural patterns, trade-offs with lasting impact).

## Why this file

- **Memory of the "why"**: the code shows *what*, the Git history shows *when*, but neither explains why one option was chosen over another. This file fills that gap.
- **Avoid re-litigating the same debates**: before any proposal with architectural impact, this file must be consulted so as not to contradict or silently redo a decision that's already been made.
- **Onboarding**: anyone (human or AI agent) joining the project can quickly understand the structuring choices and their trade-offs without having to ask the original authors.
- **Traceability of trade-offs**: each entry documents the alternatives considered and the consequences accepted, making it possible to judge later whether a decision should be revisited with full knowledge of the facts.

## Usage rules

- **Append-only**: this file is a chronological log, not a document to rewrite. New entries are added; existing entries are not modified.
- **One entry per structuring decision**, with at minimum:
  - Date
  - Decision (what was chosen)
  - Context / problem being solved
  - Alternatives considered
  - Consequences / trade-offs accepted
- If a past decision needs to be revisited, the new entry must say so explicitly rather than ignoring it.

---

## Decision log

### 2026-09-21 — Testing stack: Vitest + React Testing Library, Playwright for e2e later

- **Decision**: Adopt Vitest + React Testing Library as the standard for unit/component/integration tests, and Playwright for end-to-end tests once critical user flows exist. Documented in `docs/testing-guidelines.md`.
- **Context**: `docs/testing-guidelines.md` was referenced by CLAUDE.md but did not exist, and no test tooling was installed in the project (fresh Next.js 16 scaffold, no `test` script, no test dependencies).
- **Alternatives considered**:
  - Jest — more established with React historically, but slower and needs more config for ESM/TypeScript with Next.js 16; Vitest has largely superseded it for new projects.
  - Cypress for e2e — viable, but Playwright has better multi-browser support and faster CI execution.
- **Consequences / trade-offs accepted**: Tooling (Vitest, RTL, config, `test` script) is not yet installed — this is deliberately left as a separate, explicit task rather than bundled with the guidelines doc, to keep changes minimal and scoped. Playwright is deferred until there is an actual critical user flow worth covering, to avoid testing infrastructure ahead of real product surface.

### 2026-09-21 — Vitest + React Testing Library tooling installed

- **Decision**: Install and wire up the tooling decided above: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` as dev dependencies; `vitest.config.mts` (jsdom environment, native Vite tsconfig-paths resolution) and `vitest.setup.ts`; `npm test` and `npm run test:watch` scripts.
- **Context**: Follow-up to the same-day decision above — the guidelines existed but tooling did not. `@types/node` had to be bumped from `^20` to `^24` in `package.json` because Vitest 5 requires `@types/node` `^22 || >=24` as a peer, and the local Node runtime is v24.
- **Alternatives considered**: Used `vite-tsconfig-paths` plugin initially, then switched to Vite's native `resolve.tsconfigPaths: true` (Vite now supports this natively, removing an extra dependency and a deprecation warning).
- **Consequences / trade-offs accepted**: `@types/node` moving to `^24` narrows the supported Node range for type-checking to newer Node versions — acceptable since the local/dev runtime is already v24. Verified `npm run lint`, `npm run build`, and `npm test` all pass after the change.

### 2026-09-24 — `POST /api/v1/chat` request/response contract, locked in ahead of US-04

- **Decision**: Implement US-06 (chat front-end) now against a contract for the not-yet-built US-04 endpoint: request `{ "question": string }`; success (200) `{ "answer": string, "sources": Source[] }` with `Source = { title: string; date_maj: string; auteur: string; url?: string }`; `sources: []` represents the "je ne sais pas" case from US-04's own acceptance criteria (no invented source), rather than a special error or null. Errors follow the platform-standard envelope from `core-platform` (`{ "error": { "code": string; message: string; details?: object } }`), but the front does not assume that shape is always present — it falls back to a generic message when the body isn't parseable JSON in that shape (true today, since the route doesn't exist yet and 404s with Next.js's own HTML page). Types live in `src/app/chatbot/types.ts`, shared by the front now and by whoever implements the US-04 route handler later.
- **Context**: The user asked to implement US-06 immediately and wire US-04/US-05 in afterward. US-06 depends on US-04, which doesn't exist yet, so the front needed a concrete contract to code against rather than guessing at shapes later and reconciling two independent implementations.
- **Alternatives considered**: A single optional `source` object instead of a `sources` array — rejected by the user in favor of an array, since a real RAG answer may legitimately cite more than one passage/document.
- **Consequences / trade-offs accepted**: This contract is provisional until US-04 is actually implemented — whoever builds it must either conform to this shape or come back and revise this entry (and the shared `types.ts`) if it turns out not to fit the real retrieval/prompt pipeline. Until then, every question submitted from the browser will hit a live 404 and show a graceful "not available yet" error bubble instead of a real answer — expected, not a bug.

### 2026-09-24 — US-04 implemented with a fake corpus, not real RAG

- **Decision**: Implement `POST /api/v1/chat` as a real Next.js Route Handler (`src/app/api/v1/chat/route.ts`) that honors the contract above, but back it with a small hardcoded, keyword-matched fake corpus (`src/lib/chat/fakeCorpus.ts`) instead of real embeddings/similarity search (US-02) or a real document store (US-01) — neither exists yet, and US-02 additionally needs an `OPENAI_API_KEY` that isn't provisioned. No call is made to the LLM gateway either: matching and answer text are both fully deterministic and fake, not model-generated. Contract types moved to a new shared module (`src/lib/chat/contract.ts`) so the front (`src/app/chatbot/types.ts`) and the route handler import the same `Source`/`ChatApiResponse`/`ChatApiError` definitions instead of duplicating them.
- **Context**: User asked explicitly for "US-04 with fake data" to unblock the US-06 front end (which until now only ever saw a 404) without waiting on US-01/US-02/embeddings infrastructure. The acceptance criterion in the backlog ("réponse renvoyée avec source, date_maj, auteur explicites ; si aucun passage pertinent, réponse 'je ne sais pas'") is satisfied literally, just against a fake corpus rather than the real one.
- **Alternatives considered**: Calling the real LLM gateway (already wired, per team09 root `CLAUDE.md`) with a fake/static context passed in the prompt — rejected for this pass: it would add a live network dependency and non-deterministic output to something explicitly asked to be "fake data," and would make the route handler's tests flaky/slow for no real benefit yet.
- **Consequences / trade-offs accepted**: This is not real RAG — the corpus is 6 hardcoded HR topics matched by naive keyword `includes()`, not vector similarity, and will not generalize to arbitrary questions or real documents. It must be swapped out, not extended, when US-01/US-02 land (replace `fakeCorpus.findAnswer` with a real retrieval + LLM call behind the same route handler and contract). US-05 (rights filtering) still isn't wired in, so this endpoint currently returns the same fake answers to every caller regardless of profile — acceptable for now since there's no profile/auth (US-07) calling it yet, but must not go further without US-05 once real data is behind it.

### 2026-09-24 — Code applicatif rapatrié dans `app/`, seule copie qui survit à la VM

- **Decision**: Tout le code applicatif (front `src/`, et désormais l'API) vit dans `/srv/team09/app` (remote GitHub `Exaltemps-solidaire/edition1-team09`), plus dans `/srv/team09/exaltemps-solidaire`. Ce dernier dépôt garde le cadrage/contexte/matière (`cadrage/`, `contexte/`, `matiere/`, `documents-association/`), synchronisés en lecture seule sous `app/docs/exaltemps-solidaire/`.
- **Context**: `exaltemps-solidaire` n'a pas de remote git — tout son contenu est perdu à la destruction de la VM (le lendemain du hackathon, par contrainte de plateforme, voir `CLAUDE.md` racine de team09). `app/` est le seul dépôt câblé avec une identité de commit et une clé de push fonctionnelles.
- **Alternatives considered**: Laisser le code dans `exaltemps-solidaire` et ne pousser qu'en fin d'événement — rejeté : trop risqué (une VM qui meurt avant la synchro finale perd tout le travail), et contraire à l'instruction explicite de committer/pousser dès que quelque chose marche.
- **Consequences / trade-offs accepted**: Le cadrage (`cadrage/5-backlog-technique.md` etc.) existe maintenant en deux endroits (`exaltemps-solidaire/cadrage/` et `app/docs/exaltemps-solidaire/cadrage/`) — celui sous `app/` est la copie qui fait foi pour la suite du hackathon (celle qui survit), l'originale sert de brouillon de travail. Pas de script de sync automatique : resynchroniser manuellement (`rsync`) si le cadrage évolue encore côté `exaltemps-solidaire`.

### 2026-09-24 — `api/` en TypeScript + Bun, conforme à CCOE-RULES.md §2/§3

- **Decision**: Nouveau dossier top-level `app/api/` (TypeScript, runtime Bun), avec `pg` (client Postgres) et `mammoth` (extraction `.docx`) comme seules dépendances de production. Pas de framework HTTP pour l'instant — US-01/US-02 n'exposent aucune route, seulement des scripts (`bun run seed`) et des modules réutilisables (`db.ts`, `query.ts`, `embed.ts`) que US-04 pourra importer directement une fois branché sur le vrai corpus.
- **Context**: `app-builder-guidances/CCOE-RULES.md` §2/§3 impose Bun pour l'API/les workers, avec `api/`/`worker/`/`frontend/` en dossiers top-level séparés, chacun avec son propre `package.json` et son propre `Dockerfile` single-stage (pas encore écrit — pas nécessaire tant qu'aucune route n'est exposée, ce script tourne en one-shot depuis l'hôte).
- **Alternatives considered**: `worker/` avec une queue Redis façon `trendforge-ccoe-demo/idx-worker/` (extraction → chunk → embed → upsert en asynchrone, consommateur de stream Redis) — écarté pour ce lot : le corpus est statique et connu à l'avance (pas de flux d'upload continu côté hackathon), un script synchrone (`api/scripts/seed.ts`) suffit à couvrir le critère d'acceptation de US-01/US-02 sans la complexité d'une queue.
- **Consequences / trade-offs accepted**: Si l'équipe ajoute plus tard un vrai flux d'ingestion continu (upload utilisateur, cron), il faudra migrer vers un vrai `worker/` — le script actuel n'est pas prévu pour tourner en tâche de fond ni pour absorber une charge concurrente. `chunks`/`documents` sont conçus pour être réutilisés tels quels par ce futur worker (le schéma ne change pas, seul l'orchestrateur changerait).

### 2026-09-24 — Écart Next.js vs. React+Vite (`frontend/`), non tranché

- **Decision**: Le code front migré dans `app/frontend/` reste en Next.js (App Router), alors que `CCOE-RULES.md` §2 impose React+Vite pour le frontend. Ce point est noté ici comme **ouvert**, pas résolu — aucune migration n'a été faite dans ce lot (hors scope US-01/US-02).
- **Context**: Le front existant (chatbot US-06, déjà fonctionnel et testé) a été scaffoldé en Next.js avant que la contrainte CCOE ne soit vérifiée contre `app-builder-guidances/`. Migrer vers Vite maintenant réécrirait le routing (`src/app/`), la config de test (`vitest.config.mts` dépend actuellement du plugin Next.js implicite via `next/jest` ou équivalent — à vérifier), et retarderait US-01/US-02 sans bénéfice fonctionnel immédiat.
- **Alternatives considered**: Migrer immédiatement vers Vite — rejeté pour ce lot, la demande explicite de l'utilisateur était "fait moi l'US-02", pas une remise en conformité du stack front.
- **Consequences / trade-offs accepted**: Tant que ce point n'est pas tranché, `app/frontend/` viole une règle explicite de `CCOE-RULES.md`. À statuer avant US-06/US-07 (avant d'investir davantage dans ce front) : soit migrer vers Vite, soit documenter une dérogation explicite avec l'équipe/l'organisation du hackathon.

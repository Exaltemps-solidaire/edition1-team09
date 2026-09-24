import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Pool } from "pg";
import { loadDbConfig } from "./config";
import { closePool, getPool, insertChunks, migrate, upsertDocument } from "./db";
import { EMBEDDING_DIMENSION } from "./embed";
import { searchSimilar } from "./query";

// Intégration contre le vrai Postgres local (provisionné par bootstrap.sh).
// Pas d'appel réseau réel à task:embed ici : on injecte des vecteurs factices
// déterministes, uniquement pour vérifier le stockage pgvector et la requête
// de similarité — indépendant de la clé OPENAI (voir README.md).
function fakeEmbedding(seed: number): number[] {
  const v = new Array(EMBEDDING_DIMENSION).fill(0);
  v[seed % EMBEDDING_DIMENSION] = 1;
  return v;
}

const TEST_SOURCE = "__test__/db.test.ts.md";

let pool: Pool;

beforeAll(async () => {
  const config = await loadDbConfig();
  pool = getPool(config);
  await migrate(pool);
  await pool.query("DELETE FROM documents WHERE source = $1", [TEST_SOURCE]);
});

afterAll(async () => {
  await pool.query("DELETE FROM documents WHERE source = $1", [TEST_SOURCE]);
  await closePool();
});

describe("upsertDocument + insertChunks + searchSimilar", () => {
  test("insère un document et ses chunks, requêtables par similarité", async () => {
    const { docId, changed } = await upsertDocument(pool, {
      source: TEST_SOURCE,
      contentHash: "hash-v1",
      dateMaj: "2026-09-24",
      auteur: "La Sauvegarde du Nord",
    });
    expect(changed).toBe(true);

    await insertChunks(pool, docId, [
      { idx: 0, content: "chunk proche", embedding: fakeEmbedding(1), embeddingModel: "task:embed" },
      { idx: 1, content: "chunk loin", embedding: fakeEmbedding(500), embeddingModel: "task:embed" },
    ]);

    const results = await searchSimilar(pool, fakeEmbedding(1), 1);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("chunk proche");
    expect(results[0].source).toBe(TEST_SOURCE);
    expect(results[0].dateMaj).toBe("2026-09-24");
    expect(results[0].auteur).toBe("La Sauvegarde du Nord");
    expect(results[0].distance).toBeCloseTo(0, 5);
  });

  test("un re-upsert avec le même hash ne touche pas aux chunks existants (R-12-03)", async () => {
    const first = await upsertDocument(pool, {
      source: TEST_SOURCE,
      contentHash: "hash-v1",
      dateMaj: "2026-09-24",
      auteur: "La Sauvegarde du Nord",
    });
    expect(first.changed).toBe(false);

    const countBefore = await pool.query("SELECT count(*) FROM chunks WHERE doc_id = $1", [
      first.docId,
    ]);
    expect(Number(countBefore.rows[0].count)).toBe(2);
  });

  test("un hash inchangé mais sans chunks (échec partiel précédent) redemande un ré-embedding", async () => {
    const { docId } = await upsertDocument(pool, {
      source: TEST_SOURCE,
      contentHash: "hash-v1",
      dateMaj: "2026-09-24",
      auteur: "La Sauvegarde du Nord",
    });
    await pool.query("DELETE FROM chunks WHERE doc_id = $1", [docId]);

    const retry = await upsertDocument(pool, {
      source: TEST_SOURCE,
      contentHash: "hash-v1",
      dateMaj: "2026-09-24",
      auteur: "La Sauvegarde du Nord",
    });
    expect(retry.changed).toBe(true);
    expect(retry.docId).toBe(docId);
  });

  test("un re-upsert avec un hash différent supprime les anciens chunks", async () => {
    const { docId, changed } = await upsertDocument(pool, {
      source: TEST_SOURCE,
      contentHash: "hash-v2",
      dateMaj: "2026-09-25",
      auteur: "La Sauvegarde du Nord",
    });
    expect(changed).toBe(true);

    const count = await pool.query("SELECT count(*) FROM chunks WHERE doc_id = $1", [docId]);
    expect(Number(count.rows[0].count)).toBe(0);
  });
});

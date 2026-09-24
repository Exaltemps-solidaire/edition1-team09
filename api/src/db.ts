import { Pool } from "pg";
import type { DbConfig } from "./config";

let pool: Pool | undefined;

export function getPool(config: DbConfig): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

// R-12-15 : l'extension pgvector est créée par bootstrap.sh (rôle root), pas
// ici. Cette migration ne fait que le schéma applicatif.
export async function migrate(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      doc_id UUID PRIMARY KEY,
      source TEXT NOT NULL UNIQUE,
      content_hash TEXT NOT NULL,
      date_maj DATE NOT NULL,
      auteur TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      chunk_id UUID PRIMARY KEY,
      doc_id UUID NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
      chunk_idx INT NOT NULL,
      content TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding vector(1536) NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chunks_doc_id_idx ON chunks(doc_id)
  `);
}

export interface DocumentInput {
  source: string;
  contentHash: string;
  dateMaj: string;
  auteur: string;
}

// Remplace-plutôt-qu'accumule sur le hash de contenu (R-12-03) : si le
// document existe déjà avec le même hash, on ne touche à rien (ni aux
// documents, ni à ses chunks) ; sinon on met à jour la ligne et on supprime
// ses anciens chunks pour que l'appelant les réinsère à neuf.
export async function upsertDocument(
  pool: Pool,
  doc: DocumentInput,
): Promise<{ docId: string; changed: boolean }> {
  const existing = await pool.query<{ doc_id: string; content_hash: string }>(
    "SELECT doc_id, content_hash FROM documents WHERE source = $1",
    [doc.source],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.content_hash === doc.contentHash) {
      // Hash inchangé ne veut pas dire "rien à faire" : un run précédent a pu
      // écrire la ligne document puis échouer avant d'insérer les chunks
      // (ex. task:embed en 401). Sans ce garde-fou, un re-seed réussi
      // sauterait ce document pour toujours (R-12-03 suppose des chunks
      // présents, pas juste un hash qui matche).
      const chunkCount = await pool.query("SELECT count(*) FROM chunks WHERE doc_id = $1", [
        row.doc_id,
      ]);
      if (Number(chunkCount.rows[0].count) > 0) {
        return { docId: row.doc_id, changed: false };
      }
      return { docId: row.doc_id, changed: true };
    }
    await pool.query(
      "UPDATE documents SET content_hash = $2, date_maj = $3, auteur = $4 WHERE doc_id = $1",
      [row.doc_id, doc.contentHash, doc.dateMaj, doc.auteur],
    );
    await pool.query("DELETE FROM chunks WHERE doc_id = $1", [row.doc_id]);
    return { docId: row.doc_id, changed: true };
  }

  const docId = crypto.randomUUID();
  await pool.query(
    "INSERT INTO documents (doc_id, source, content_hash, date_maj, auteur) VALUES ($1, $2, $3, $4, $5)",
    [docId, doc.source, doc.contentHash, doc.dateMaj, doc.auteur],
  );
  return { docId, changed: true };
}

export interface ChunkInput {
  idx: number;
  content: string;
  embedding: number[];
  embeddingModel: string;
}

export async function insertChunks(
  pool: Pool,
  docId: string,
  chunks: ChunkInput[],
): Promise<void> {
  for (const chunk of chunks) {
    await pool.query(
      "INSERT INTO chunks (chunk_id, doc_id, chunk_idx, content, embedding_model, embedding) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        crypto.randomUUID(),
        docId,
        chunk.idx,
        chunk.content,
        chunk.embeddingModel,
        `[${chunk.embedding.join(",")}]`,
      ],
    );
  }
}

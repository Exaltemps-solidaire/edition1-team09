import type { Pool } from "pg";

export interface SimilarChunk {
  chunkId: string;
  content: string;
  distance: number;
  source: string;
  dateMaj: string;
  auteur: string;
}

// Distance cosinus (`<=>`) : plus petit = plus proche. pgvector l'index avec
// l'opérateur natif, pas besoin de normaliser les vecteurs à la main.
export async function searchSimilar(
  pool: Pool,
  embedding: number[],
  k: number,
): Promise<SimilarChunk[]> {
  const result = await pool.query(
    `SELECT c.chunk_id, c.content, c.embedding <=> $1::vector AS distance,
            d.source, to_char(d.date_maj, 'YYYY-MM-DD') AS date_maj, d.auteur
     FROM chunks c
     JOIN documents d ON d.doc_id = c.doc_id
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [`[${embedding.join(",")}]`, k],
  );
  return result.rows.map((row) => ({
    chunkId: row.chunk_id,
    content: row.content,
    distance: Number(row.distance),
    source: row.source,
    dateMaj: row.date_maj,
    auteur: row.auteur,
  }));
}

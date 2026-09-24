import { loadDbConfig, loadLlmConfig } from "../src/config";
import { closePool, getPool, insertChunks, migrate, upsertDocument } from "../src/db";
import { EMBEDDING_MODEL, EmbeddingAuthError, embedTexts } from "../src/embed";
import { ingestCorpus } from "../src/ingest";

async function main() {
  console.log("[seed] chargement config DB + LLM...");
  const [dbConfig, llmConfig] = await Promise.all([loadDbConfig(), loadLlmConfig()]);
  const pool = getPool(dbConfig);

  console.log("[seed] migration schéma (documents, chunks)...");
  await migrate(pool);

  console.log("[seed] ingestion du corpus (documents-association/, matiere/)...");
  const documents = await ingestCorpus();
  console.log(`[seed] ${documents.length} document(s) trouvé(s).`);

  let totalChunks = 0;
  let totalSkipped = 0;

  for (const doc of documents) {
    const { docId, changed } = await upsertDocument(pool, doc);
    if (!changed) {
      totalSkipped += doc.chunks.length;
      console.log(`  = ${doc.source} : inchangé (hash identique), ${doc.chunks.length} chunk(s) conservés`);
      continue;
    }

    console.log(`  → ${doc.source} : ${doc.chunks.length} chunk(s), appel task:embed...`);
    const embeddings = await embedTexts(
      doc.chunks.map((c) => c.content),
      llmConfig,
    );

    await insertChunks(
      pool,
      docId,
      doc.chunks.map((c, i) => ({
        idx: c.idx,
        content: c.content,
        embedding: embeddings[i],
        embeddingModel: EMBEDDING_MODEL,
      })),
    );
    totalChunks += doc.chunks.length;
  }

  console.log(
    `[seed] terminé : ${totalChunks} chunk(s) (ré)indexé(s), ${totalSkipped} inchangé(s).`,
  );
  await closePool();
}

main().catch(async (err) => {
  await closePool();
  if (err instanceof EmbeddingAuthError) {
    console.error(`[seed] ✗ ${err.message}`);
    process.exit(1);
  }
  console.error("[seed] ✗ échec inattendu :", err);
  process.exit(1);
});

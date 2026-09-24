import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { chunkText, type Chunk } from "./chunk";
import { extractText } from "./extract";

// Racine du corpus : docs/exaltemps-solidaire à la racine du repo app/. On ne
// remonte que les deux sous-dossiers listés par le backlog (US-01/US-02) —
// cadrage/ et contexte/ sont de la doc de pilotage hackathon, pas du corpus
// métier à indexer.
export const CORPUS_ROOT = join(import.meta.dir, "..", "..", "docs", "exaltemps-solidaire");
export const CORPUS_SUBDIRS = ["documents-association", "matiere"];

const SUPPORTED_EXTENSIONS = [".docx", ".md", ".txt"];

// Aucune métadonnée de date/auteur par fichier dans les sources : on fixe la
// date de la séance de cadrage (seule date fiable disponible) et l'auteur
// collectif de l'association. Limitation documentée dans README.md.
export const DATE_MAJ = "2026-09-24";
export const AUTEUR = "La Sauvegarde du Nord";

export interface IngestedDocument {
  source: string;
  contentHash: string;
  dateMaj: string;
  auteur: string;
  chunks: Chunk[];
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!SUPPORTED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    files.push(join(entry.parentPath ?? entry.path, entry.name));
  }
  return files;
}

async function sha256(text: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(text);
  return hasher.digest("hex");
}

export async function ingestCorpus(): Promise<IngestedDocument[]> {
  const documents: IngestedDocument[] = [];

  for (const subdir of CORPUS_SUBDIRS) {
    const dir = join(CORPUS_ROOT, subdir);
    const files = await listFiles(dir);

    for (const absolutePath of files) {
      const text = await extractText(absolutePath);
      const chunks = chunkText(text);
      if (chunks.length === 0) continue;

      documents.push({
        source: relative(CORPUS_ROOT, absolutePath),
        contentHash: await sha256(text),
        dateMaj: DATE_MAJ,
        auteur: AUTEUR,
        chunks,
      });
    }
  }

  return documents;
}

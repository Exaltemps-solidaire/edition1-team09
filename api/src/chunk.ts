export interface Chunk {
  idx: number;
  content: string;
}

const TARGET_SIZE = 500;
const OVERLAP = 80;

// Découpage par paragraphe (double saut de ligne), avec repli en découpage
// dur pour tout paragraphe qui dépasse à lui seul TARGET_SIZE. Chevauchement
// léger entre chunks consécutifs pour ne pas couper une idée en deux sans
// contexte de part et d'autre.
export function chunkText(text: string, targetSize = TARGET_SIZE, overlap = OVERLAP): Chunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const pieces: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= targetSize) {
      pieces.push(paragraph);
      continue;
    }
    for (let i = 0; i < paragraph.length; i += targetSize - overlap) {
      pieces.push(paragraph.slice(i, i + targetSize));
    }
  }

  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    const candidate = current.length > 0 ? `${current}\n\n${piece}` : piece;
    if (candidate.length > targetSize && current.length > 0) {
      chunks.push(current);
      const tail = current.slice(Math.max(0, current.length - overlap));
      const withTail = piece.length > 0 ? `${tail}\n\n${piece}` : tail;
      // Le chevauchement ne s'applique que s'il tient dans la taille cible —
      // sinon on repart du morceau seul plutôt que de produire un chunk plus
      // gros que targetSize (arrive avec des morceaux issus du découpage dur
      // d'un paragraphe déjà proche de la taille cible).
      current = withTail.length <= targetSize ? withTail : piece;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.map((content, idx) => ({ idx, content }));
}

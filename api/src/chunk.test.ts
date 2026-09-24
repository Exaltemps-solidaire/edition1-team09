import { describe, expect, test } from "bun:test";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  test("découpe un document connu en plusieurs chunks", () => {
    const paragraphs = Array.from(
      { length: 6 },
      (_, i) => `Paragraphe ${i} : ${"lorem ipsum dolor sit amet ".repeat(6)}`,
    );
    const text = paragraphs.join("\n\n");

    const chunks = chunkText(text, 200, 40);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.idx).toBe(i));
    // chaque paragraphe d'origine doit se retrouver dans au moins un chunk
    // (chunkText trim chaque paragraphe, donc on compare sur la version trim)
    for (const p of paragraphs) {
      expect(chunks.some((c) => c.content.includes(p.trim()))).toBe(true);
    }
  });

  test("un texte qui tient dans la taille cible ressort en un seul chunk", () => {
    const chunks = chunkText("Un court paragraphe.", 500, 80);
    expect(chunks).toEqual([{ idx: 0, content: "Un court paragraphe." }]);
  });

  test("un paragraphe plus long que la taille cible est découpé en dur", () => {
    const longParagraph = "x".repeat(1200);
    const chunks = chunkText(longParagraph, 500, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 500)).toBe(true);
  });

  test("un fichier vide ne produit aucun chunk", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
});

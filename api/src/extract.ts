import mammoth from "mammoth";

export async function extractText(absolutePath: string): Promise<string> {
  if (absolutePath.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ path: absolutePath });
    return result.value;
  }
  return Bun.file(absolutePath).text();
}

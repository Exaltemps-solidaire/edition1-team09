import type { LlmConfig } from "./config";

export const EMBEDDING_MODEL = "task:embed";
export const EMBEDDING_DIMENSION = 1536;

// Levée quand la passerelle répond 401 sur /v1/embeddings. Cas attendu tant
// que OPENAI_API_KEY n'est pas posée dans core-platform/.env (voir CLAUDE.md
// racine, §4) : task:embed proxie toujours OpenAI, même en mode `anthropic`,
// et l'infra ne fournit pas cette clé. Erreur explicite plutôt qu'un vecteur
// factice silencieux.
export class EmbeddingAuthError extends Error {
  constructor(status: number, body: string) {
    super(
      `task:embed a répondu ${status} (${body.trim() || "pas de détail"}). ` +
        "Cause attendue : OPENAI_API_KEY absente de core-platform/.env avant le premier seed " +
        "(voir CLAUDE.md racine du dépôt, §4, et README.md de cette app). " +
        "Pose la clé, relance `onboard-app.sh team09`, puis relance `bun run seed`.",
    );
    this.name = "EmbeddingAuthError";
  }
}

interface EmbeddingsResponse {
  data: { embedding: number[]; index: number }[];
}

export async function embedTexts(texts: string[], config: LlmConfig): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const res = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (res.status === 401) {
    throw new EmbeddingAuthError(res.status, await res.text());
  }
  if (!res.ok) {
    throw new Error(`task:embed a répondu ${res.status} : ${(await res.text()).trim()}`);
  }

  const body = (await res.json()) as EmbeddingsResponse;
  return body.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

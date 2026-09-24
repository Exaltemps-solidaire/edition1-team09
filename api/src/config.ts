// Lecture de la config DB / LLM : variables d'env si présentes, sinon Vault
// (via le même wrapper `bao` que bootstrap.sh — core-platform/lib/secrets.sh).
// Ces scripts tournent sur l'hôte (pas dans un conteneur), donc le `host`
// stocké dans Vault (`postgres.internal`) est forcé à `localhost` sauf si
// DB_HOST est explicitement fourni — le port 5432 est publié sur l'hôte par
// core-platform.

const SECRETS_SH =
  process.env.SECRETS_SH ?? "/srv/team09/core-platform/core-platform/lib/secrets.sh";

async function baoGetField(path: string, field: string): Promise<string> {
  const proc = Bun.spawn(
    ["bash", "-c", `source "${SECRETS_SH}" && bao kv get -field="${field}" "${path}"`],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Impossible de lire ${path}#${field} dans Vault (${SECRETS_SH}) : ${stderr.trim()}`,
    );
  }
  return stdout.trim();
}

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export async function loadDbConfig(): Promise<DbConfig> {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 5432,
      database: u.pathname.replace(/^\//, ""),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  }
  const secretPath = "secret/team09/postgres";
  const [port, database, user, password] = await Promise.all([
    baoGetField(secretPath, "port"),
    baoGetField(secretPath, "database"),
    baoGetField(secretPath, "user"),
    baoGetField(secretPath, "password"),
  ]);
  return {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(port),
    database,
    user,
    password,
  };
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
}

export async function loadLlmConfig(): Promise<LlmConfig> {
  if (process.env.LLM_VKEY) {
    return {
      baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:9080/v1",
      apiKey: process.env.LLM_VKEY,
    };
  }
  const apiKey = await baoGetField("secret/team09/llm", "virtual_key");
  return {
    baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:9080/v1",
    apiKey,
  };
}

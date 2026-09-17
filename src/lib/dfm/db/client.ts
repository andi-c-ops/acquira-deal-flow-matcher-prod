import { Pool, type QueryResultRow } from "pg";

import { getEnv } from "@/lib/dfm/config/env";

export interface RepoError {
  message: string;
}

export interface RepoResult<T> {
  data: T | null;
  error: RepoError | null;
}

let pool: Pool | null = null;

function encodePostgresPassword(value: string) {
  return (value.match(/%[0-9a-fA-F]{2}|[\s\S]/g) ?? [])
    .map((part) => (/^%[0-9a-fA-F]{2}$/.test(part) ? part : encodeURIComponent(part)))
    .join("");
}

function getSupabaseProjectRef() {
  const configuredUrl = process.env.SUPABASE_URL?.trim() ?? "";
  const match = configuredUrl.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co(?:\/|$)/i);
  return match?.[1] ?? null;
}

function normalizeSupabaseHostedUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return value;
  }

  const host = parsed.hostname.toLowerCase();
  const isSupabaseHost = host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com");
  if ((!isSupabaseHost && parsed.username !== "postgres") || !parsed.password) {
    return value;
  }

  const projectRef =
    getSupabaseProjectRef() ??
    host.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ??
    "jinjqqibkmsdmfwlizte";

  return `postgresql://postgres.${projectRef}:${encodePostgresPassword(parsed.password)}@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`;
}

function normalizePostgresConnectionString(value: string) {
  let trimmed = value.trim();

  const assignment = trimmed.match(/^[A-Z_][A-Z0-9_]*\s*=\s*/);
  if (assignment) {
    trimmed = trimmed.slice(assignment[0].length).trim();
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  if (!trimmed.includes("://")) {
    // Password-only values are raw secret text, not pre-encoded URLs. Encode
    // every reserved character, including a literal "%" followed by hex.
    const passwordOnlyUrl = `postgresql://postgres.jinjqqibkmsdmfwlizte:${encodeURIComponent(trimmed)}@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`;
    try {
      new URL(passwordOnlyUrl);
      return passwordOnlyUrl;
    } catch {
      throw new Error("Invalid PostgreSQL connection URL");
    }
  }

  try {
    new URL(trimmed);
    return normalizeSupabaseHostedUrl(trimmed);
  } catch {
    // Supabase passwords may contain URI-reserved characters. Repair only the
    // password portion while preserving the secret in the server environment.
  }

  const schemeEnd = trimmed.indexOf("://");
  const supabaseMarker = trimmed.lastIndexOf(".supabase.");
  if (schemeEnd < 0 || supabaseMarker < 0) {
    throw new Error("Invalid PostgreSQL connection URL");
  }

  const hostSeparator = trimmed.lastIndexOf("@", supabaseMarker);
  if (hostSeparator < schemeEnd + 3) {
    throw new Error("Invalid PostgreSQL connection URL");
  }

  const userInfo = trimmed.slice(schemeEnd + 3, hostSeparator);
  const passwordSeparator = userInfo.indexOf(":");
  if (passwordSeparator <= 0) {
    throw new Error("Invalid PostgreSQL connection URL");
  }

  const user = userInfo.slice(0, passwordSeparator);
  const password = userInfo.slice(passwordSeparator + 1);
  const repaired = `${trimmed.slice(0, schemeEnd + 3)}${user}:${encodePostgresPassword(password)}@${trimmed.slice(hostSeparator + 1)}`;

  try {
    new URL(repaired);
    return normalizeSupabaseHostedUrl(repaired);
  } catch {
    throw new Error("Invalid PostgreSQL connection URL");
  }
}

function getDatabaseUrl() {
  const env = getEnv();
  const databaseUrl = env.DIRECT_URL ?? env.DATABASE_URL ?? null;

  if (!databaseUrl) {
    throw new Error(
      "Database client requires DIRECT_URL or DATABASE_URL, or a Supabase service role configuration",
    );
  }

  const parsed = new URL(normalizePostgresConnectionString(databaseUrl));
  if (parsed.searchParams.get("sslmode") === "require") {
    parsed.searchParams.set("sslmode", "no-verify");
  }

  return parsed.toString();
}

function getPool() {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

  return pool;
}

export async function closePool() {
  if (!pool) {
    return;
  }

  const currentPool = pool;
  pool = null;
  await currentPool.end();
}

function success<T>(data: T | null): RepoResult<T> {
  return {
    data,
    error: null,
  };
}

function failure<T>(error: unknown): RepoResult<T> {
  return {
    data: null,
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

export async function queryMany<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<RepoResult<T[]>> {
  try {
    const result = await getPool().query<T>(text, values);
    return success(result.rows);
  } catch (error) {
    return failure<T[]>(error);
  }
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<RepoResult<T>> {
  try {
    const result = await getPool().query<T>(text, values);
    if (result.rows.length === 0) {
      return success<T>(null);
    }
    return success(result.rows[0]);
  } catch (error) {
    return failure<T>(error);
  }
}

export async function queryMaybeOne<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<RepoResult<T>> {
  return queryOne<T>(text, values);
}

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

function getDatabaseUrl() {
  const env = getEnv();
  const databaseUrl = env.DIRECT_URL ?? env.DATABASE_URL ?? null;

  if (!databaseUrl) {
    throw new Error(
      "Database client requires DIRECT_URL or DATABASE_URL, or a Supabase service role configuration",
    );
  }

  const parsed = new URL(databaseUrl);
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

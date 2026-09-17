import { Pool } from "pg";

import type { DfmStorageAdapter, QueryRow, RepoResult } from "./adapter";

interface QueryRunner {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

export interface PostgresAdapterOptions {
  connectionString?: string;
  pool?: QueryRunner;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

function success<T>(data: T | null): RepoResult<T> {
  return { data, error: null };
}

function failure<T>(error: unknown): RepoResult<T> {
  return {
    data: null,
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

/**
 * PostgreSQL implementation of the provider-neutral DFM storage boundary.
 * A query runner can be injected for local contract tests without starting a
 * database or supplying a credential.
 */
export function createPostgresAdapter(options: PostgresAdapterOptions): DfmStorageAdapter {
  const runner = options.pool ?? createPool(options);
  let closed = false;

  return {
    async queryMany<T extends QueryRow>(text: string, values: unknown[] = []) {
      try {
        const result = await runner.query<T>(text, values);
        return success(result.rows);
      } catch (error) {
        return failure<T[]>(error);
      }
    },

    async queryOne<T extends QueryRow>(text: string, values: unknown[] = []) {
      try {
        const result = await runner.query<T>(text, values);
        return success(result.rows[0] ?? null);
      } catch (error) {
        return failure<T>(error);
      }
    },

    async queryMaybeOne<T extends QueryRow>(text: string, values: unknown[] = []) {
      return this.queryOne<T>(text, values);
    },

    async close() {
      if (closed) return;
      closed = true;
      await runner.end();
    },
  };
}

function createPool(options: PostgresAdapterOptions): Pool {
  const connectionString = options.connectionString?.trim();
  if (!connectionString) {
    throw new Error("DFM PostgreSQL adapter requires an explicit connection string");
  }

  return new Pool({
    connectionString,
    max: options.max ?? 5,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 15_000,
  });
}

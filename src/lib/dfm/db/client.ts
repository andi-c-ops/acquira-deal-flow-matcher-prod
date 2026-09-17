import { getDedicatedDfmDatabaseUrl } from "@/lib/dfm/config/dedicated-database";
import { createPostgresAdapter } from "@/lib/dfm/db/postgres-adapter";
import type { DfmStorageAdapter, QueryRow, RepoError, RepoResult } from "@/lib/dfm/db/adapter";

export type { RepoError, RepoResult } from "@/lib/dfm/db/adapter";

let activeAdapter: DfmStorageAdapter | null = null;

function getDatabaseUrl() {
  return getDedicatedDfmDatabaseUrl(process.env);
}

function getAdapter() {
  if (activeAdapter) {
    return activeAdapter;
  }

  activeAdapter = createPostgresAdapter({ connectionString: getDatabaseUrl() });
  return activeAdapter;
}

/** Install a provider-neutral adapter for local contract tests or a future DFM provider. */
export function installDfmStorageAdapter(adapter: DfmStorageAdapter) {
  if (activeAdapter) {
    throw new Error("A DFM storage adapter is already installed");
  }
  activeAdapter = adapter;
}

export async function closePool() {
  if (!activeAdapter) {
    return;
  }

  const currentAdapter = activeAdapter;
  activeAdapter = null;
  await currentAdapter.close();
}

export async function queryMany<T extends QueryRow>(
  text: string,
  values: unknown[] = [],
): Promise<RepoResult<T[]>> {
  return getAdapter().queryMany<T>(text, values);
}

export async function queryOne<T extends QueryRow>(
  text: string,
  values: unknown[] = [],
): Promise<RepoResult<T>> {
  return getAdapter().queryOne<T>(text, values);
}

export async function queryMaybeOne<T extends QueryRow>(
  text: string,
  values: unknown[] = [],
): Promise<RepoResult<T>> {
  return getAdapter().queryMaybeOne<T>(text, values);
}

export interface RepoError {
  message: string;
}

export interface RepoResult<T> {
  data: T | null;
  error: RepoError | null;
}

/** Row shape exposed by SQL providers. The adapter owns provider-specific row typing. */
export type QueryRow = Record<string, any>;

/**
 * Provider-neutral storage boundary for DFM repositories.
 *
 * The repository layer only needs these result-shaped query operations. A
 * provider implementation may use PostgreSQL, another managed database, or
 * a fixture-backed test runner without changing repository call sites.
 */
export interface DfmStorageAdapter {
  queryMany<T extends QueryRow>(text: string, values?: unknown[]): Promise<RepoResult<T[]>>;
  queryOne<T extends QueryRow>(text: string, values?: unknown[]): Promise<RepoResult<T>>;
  queryMaybeOne<T extends QueryRow>(text: string, values?: unknown[]): Promise<RepoResult<T>>;
  close(): Promise<void>;
}

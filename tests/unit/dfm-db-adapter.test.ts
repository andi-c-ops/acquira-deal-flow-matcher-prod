import assert from "node:assert/strict";
import test from "node:test";

import { getDedicatedDfmDatabaseUrl } from "../../src/lib/dfm/config/dedicated-database";
import { createPostgresAdapter } from "../../src/lib/dfm/db/postgres-adapter";

class FakeQueryRunner {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  endCalls = 0;

  constructor(private readonly rows: unknown[][]) {}

  async query<T>(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    return { rows: (this.rows.shift() ?? []) as T[] };
  }

  async end() {
    this.endCalls += 1;
  }
}

test("dedicated DFM database configuration does not fall back to legacy variables", () => {
  assert.equal(
    getDedicatedDfmDatabaseUrl({ DFM_DATABASE_URL: "  postgres://dfm.example/db  ", DIRECT_URL: "legacy" }),
    "postgres://dfm.example/db",
  );
  assert.throws(
    () => getDedicatedDfmDatabaseUrl({ DIRECT_URL: "legacy", SUPABASE_URL: "https://crm.example" }),
    /DFM_DATABASE_URL is required/,
  );
});

test("PostgreSQL adapter normalizes repository query results without a database", async () => {
  const runner = new FakeQueryRunner([[{ id: "run-1" }], [], [{ id: "cursor-1" }]]);
  const adapter = createPostgresAdapter({ pool: runner });

  assert.deepEqual(await adapter.queryMany<{ id: string }>("select runs", ["daily"]), {
    data: [{ id: "run-1" }],
    error: null,
  });
  assert.deepEqual(await adapter.queryOne<{ id: string }>("select missing"), {
    data: null,
    error: null,
  });
  assert.deepEqual(await adapter.queryMaybeOne<{ id: string }>("select cursor"), {
    data: { id: "cursor-1" },
    error: null,
  });
  assert.deepEqual(runner.calls, [
    { text: "select runs", values: ["daily"] },
    { text: "select missing", values: [] },
    { text: "select cursor", values: [] },
  ]);

  await adapter.close();
  await adapter.close();
  assert.equal(runner.endCalls, 1);
});

test("PostgreSQL adapter returns repository-shaped errors", async () => {
  const runner = {
    async query() {
      throw new Error("connection refused");
    },
    async end() {},
  };
  const adapter = createPostgresAdapter({ pool: runner });

  assert.deepEqual(await adapter.queryOne("select 1"), {
    data: null,
    error: { message: "connection refused" },
  });
});

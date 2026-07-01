import { queryMaybeOne, queryOne } from "@/lib/dfm/db/client";

function toTimestampString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (value && typeof value === "object" && "toISOString" in value) {
    const candidate = value as { toISOString?: () => string };
    if (typeof candidate.toISOString === "function") {
      return candidate.toISOString();
    }
  }

  return null;
}

export async function getSyncCursor(key: string) {
  return queryMaybeOne(`select * from dfm_private.sync_cursors where key = $1`, [key]);
}

export async function upsertSyncCursor(
  key: string,
  patch: {
    cursorValue?: string | null;
    cursorTimestamp?: string | null;
    metadata?: Record<string, unknown> | null;
  },
) {
  return queryOne(
    `
      insert into dfm_private.sync_cursors (
        key,
        cursor_value,
        cursor_timestamp,
        metadata
      )
      values ($1, $2, $3, $4::jsonb)
      on conflict (key)
      do update set
        cursor_value = excluded.cursor_value,
        cursor_timestamp = excluded.cursor_timestamp,
        metadata = excluded.metadata
      returning *
    `,
    [
      key,
      patch.cursorValue ?? null,
      patch.cursorTimestamp ?? null,
      JSON.stringify(patch.metadata ?? null),
    ],
  );
}

export async function advanceSyncCursorTimestampMonotonic(
  key: string,
  patch: {
    cursorTimestamp: string;
    metadata?: Record<string, unknown> | null;
  },
) {
  const existingResult = await getSyncCursor(key);
  if (existingResult.error) {
    return existingResult;
  }

  const existingTimestamp = toTimestampString(existingResult.data?.cursor_timestamp);
  const nextTimestamp = patch.cursorTimestamp;

  if (
    existingTimestamp &&
    new Date(existingTimestamp).getTime() > new Date(nextTimestamp).getTime()
  ) {
    return upsertSyncCursor(key, {
      cursorTimestamp: existingTimestamp,
      cursorValue: existingResult.data?.cursor_value ?? null,
      metadata: {
        ...(patch.metadata ?? {}),
        monotonicGuard: {
          skippedRequestedCursorTimestamp: nextTimestamp,
          retainedCursorTimestamp: existingTimestamp,
        },
      },
    });
  }

  return upsertSyncCursor(key, {
    cursorTimestamp: nextTimestamp,
    cursorValue: existingResult.data?.cursor_value ?? null,
    metadata: patch.metadata ?? null,
  });
}

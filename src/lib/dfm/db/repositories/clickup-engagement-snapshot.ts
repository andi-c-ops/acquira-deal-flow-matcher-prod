import { getSyncCursor, upsertSyncCursor } from "@/lib/dfm/db/repositories/sync-cursors";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

const SNAPSHOT_CURSOR_KEY = "clickup_engagement_snapshot_v1";

export type ClickupEngagementSnapshotRow = {
  aeThesisId: string;
  clickupListId: string;
  recentlyUpdatedDeals14Days: number;
  recentlyUpdatedDeals30Days: number;
  lastClickupActivityAt: string | null;
};

export type ClickupEngagementSnapshot = {
  version: 1;
  observedAt: string;
  rows: ClickupEngagementSnapshotRow[];
};

export function parseClickupEngagementSnapshot(value: unknown): ClickupEngagementSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ClickupEngagementSnapshot>;
  const validRows = Array.isArray(candidate.rows) && candidate.rows.every((row) => {
    if (!row || typeof row !== "object") return false;
    const item = row as Partial<ClickupEngagementSnapshotRow>;
    return typeof item.aeThesisId === "string" &&
      typeof item.clickupListId === "string" &&
      typeof item.recentlyUpdatedDeals14Days === "number" &&
      typeof item.recentlyUpdatedDeals30Days === "number" &&
      (typeof item.lastClickupActivityAt === "string" || item.lastClickupActivityAt === null);
  });
  return candidate.version === 1 &&
    typeof candidate.observedAt === "string" &&
    validRows
    ? (candidate as ClickupEngagementSnapshot)
    : null;
}

export async function saveClickupEngagementSnapshot(snapshot: ClickupEngagementSnapshot) {
  const existing = await getSyncCursor(SNAPSHOT_CURSOR_KEY);
  if (existing.error) throw new Error(existing.error.message);
  unwrapSupabaseResult(
    await upsertSyncCursor(SNAPSHOT_CURSOR_KEY, {
      cursorTimestamp: snapshot.observedAt,
      metadata: { snapshot },
    }),
  );
  return { created: existing.data === null };
}

export async function loadClickupEngagementSnapshot(): Promise<ClickupEngagementSnapshot | null> {
  const result = await getSyncCursor(SNAPSHOT_CURSOR_KEY);
  if (result.error || !result.data) return null;
  const metadata = result.data.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  return parseClickupEngagementSnapshot((metadata as { snapshot?: unknown }).snapshot);
}

import { getEnv } from "@/lib/dfm/config/env";
import { getGoogleDriveAccessToken } from "@/lib/dfm/providers/google-oauth";
import { fetchWithTimeout } from "@/lib/dfm/utils/fetch";

const SNAPSHOT_FILE_NAME = "dfm-clickup-engagement-snapshot.json";
const READ_TIMEOUT_MS = 5_000;
const WRITE_TIMEOUT_MS = 20_000;

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

type DriveFile = { id?: string };
type DriveFileList = { files?: DriveFile[] };

function getFolderId() {
  const folderId = getEnv().GOOGLE_DRIVE_SNAPSHOT_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_SNAPSHOT_FOLDER_ID is required for the Drive engagement snapshot");
  }
  return folderId;
}

async function findSnapshotFile(token: string) {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", `name = '${SNAPSHOT_FILE_NAME}' and '${getFolderId()}' in parents and trashed = false`);
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("fields", "files(id)");
  url.searchParams.set("pageSize", "1");

  const response = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, READ_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Google Drive snapshot lookup failed with status ${response.status}`);
  const data = (await response.json()) as DriveFileList;
  return data.files?.[0]?.id ?? null;
}

function multipartBody(metadata: Record<string, unknown>, content: string) {
  const boundary = `dfm-${crypto.randomUUID()}`;
  return {
    boundary,
    body: [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      content,
      `--${boundary}--`,
      "",
    ].join("\r\n"),
  };
}

async function createSnapshotFile(token: string, snapshot: ClickupEngagementSnapshot) {
  const { boundary, body } = multipartBody(
    { name: SNAPSHOT_FILE_NAME, parents: [getFolderId()], mimeType: "application/json" },
    JSON.stringify(snapshot),
  );
  const response = await fetchWithTimeout(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    WRITE_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`Google Drive snapshot create failed with status ${response.status}`);
}

async function updateSnapshotFile(token: string, fileId: string, snapshot: ClickupEngagementSnapshot) {
  const response = await fetchWithTimeout(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(snapshot) },
    WRITE_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`Google Drive snapshot update failed with status ${response.status}`);
}

export async function saveClickupEngagementSnapshot(snapshot: ClickupEngagementSnapshot) {
  const token = await getGoogleDriveAccessToken();
  const fileId = await findSnapshotFile(token);
  if (fileId) {
    await updateSnapshotFile(token, fileId, snapshot);
    return { created: false };
  }
  await createSnapshotFile(token, snapshot);
  return { created: true };
}

export async function loadClickupEngagementSnapshot(): Promise<ClickupEngagementSnapshot | null> {
  try {
    const token = await getGoogleDriveAccessToken();
    const fileId = await findSnapshotFile(token);
    if (!fileId) return null;
    const response = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } },
      READ_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<ClickupEngagementSnapshot>;
    return data.version === 1 && typeof data.observedAt === "string" && Array.isArray(data.rows)
      ? (data as ClickupEngagementSnapshot)
      : null;
  } catch {
    return null;
  }
}

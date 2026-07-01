import { getEnv } from "@/lib/dfm/config/env";
import { fetchWithTimeout } from "@/lib/dfm/utils/fetch";

export interface ClickupDealsRoute {
  folderId: string;
  folderName: string;
  dealsListId: string;
}

interface ClickupFolderResponse {
  folders?: Array<{
    id?: string;
    name?: string;
    lists?: Array<{
      id?: string;
      name?: string;
    }>;
  }>;
}

export function normalizeClickupRouteName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function listDealsRoutesForSpace(spaceId: string): Promise<ClickupDealsRoute[]> {
  const env = getEnv();
  if (!env.CLICKUP_API_KEY) {
    throw new Error("CLICKUP_API_KEY is required for ClickUp routing");
  }

  const response = await fetchWithTimeout(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, {
    headers: {
      Authorization: env.CLICKUP_API_KEY,
    },
  }, 30_000);

  if (!response.ok) {
    throw new Error(`ClickUp folder fetch failed with status ${response.status}`);
  }

  const data = (await response.json()) as ClickupFolderResponse;
  return (data.folders ?? [])
    .map((folder) => {
      const dealsList = (folder.lists ?? []).find((list) => list.name === "Deals");
      if (!folder.id || !folder.name || !dealsList?.id) {
        return null;
      }

      return {
        folderId: folder.id,
        folderName: folder.name,
        dealsListId: dealsList.id,
      } satisfies ClickupDealsRoute;
    })
    .filter((route): route is ClickupDealsRoute => route !== null);
}

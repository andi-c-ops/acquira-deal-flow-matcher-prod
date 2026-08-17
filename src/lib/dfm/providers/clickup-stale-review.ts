import { getEnv } from "@/lib/dfm/config/env";
import { fetchWithTimeout } from "@/lib/dfm/utils/fetch";

export interface ClickupStaleListRoute {
  aeName: string;
  clickupListId: string;
}

export interface LiveStaleClickupTask {
  aeName: string;
  taskId: string;
  taskName: string;
  taskUrl: string | null;
  status: string | null;
  lastTouchedAt: string | null;
  daysStale: number;
}

export interface LiveClickupEngagementTask {
  aeName: string;
  clickupListId: string;
  taskId: string;
  taskName: string;
  taskUrl: string | null;
  status: string | null;
  lastTouchedAt: string | null;
}

interface ClickupFilteredTaskResponse {
  tasks?: Array<{
    id?: string;
    name?: string;
    url?: string;
    date_updated?: string;
    date_created?: string;
    list?: {
      id?: string;
      name?: string;
    };
    status?: {
      status?: string;
      type?: string;
    };
  }>;
}

const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
const LIST_BATCH_SIZE = 10;
const MAX_RATE_LIMIT_RETRIES = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseClickupTimestamp(value: string | undefined) {
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return new Date(numeric);
}

function daysBetween(now: Date, then: Date) {
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

function chunk<T>(values: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}

async function fetchFilteredTasksPage(input: {
  listIds: string[];
  dateUpdatedLt?: number;
  dateUpdatedGt?: number;
  page: number;
}) {
  const env = getEnv();
  if (!env.CLICKUP_API_KEY) {
    throw new Error("CLICKUP_API_KEY is required for live ClickUp stale review");
  }
  if (!env.CLICKUP_TEAM_ID) {
    throw new Error("CLICKUP_TEAM_ID is required for live ClickUp stale review");
  }

  const url = new URL(`https://api.clickup.com/api/v2/team/${env.CLICKUP_TEAM_ID}/task`);
  for (const listId of input.listIds) {
    url.searchParams.append("list_ids[]", listId);
  }
  url.searchParams.set("include_closed", "false");
  url.searchParams.set("subtasks", "false");
  url.searchParams.set("order_by", "updated");
  url.searchParams.set("reverse", "true");
  if (typeof input.dateUpdatedLt === "number") {
    url.searchParams.set("date_updated_lt", String(input.dateUpdatedLt));
  }
  if (typeof input.dateUpdatedGt === "number") {
    url.searchParams.set("date_updated_gt", String(input.dateUpdatedGt));
  }
  url.searchParams.set("page", String(input.page));

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          Authorization: env.CLICKUP_API_KEY,
        },
      },
      REQUEST_TIMEOUT_MS,
    );

    if (response.ok) {
      return (await response.json()) as ClickupFilteredTaskResponse;
    }

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      await sleep((attempt + 1) * 1_500);
      continue;
    }

    throw new Error(`ClickUp filtered task fetch failed with status ${response.status}`);
  }

  throw new Error("ClickUp filtered task fetch failed after retry exhaustion");
}

export async function listLiveStaleClickupTasks(
  routes: ClickupStaleListRoute[],
  thresholdDays: number,
  sampleLimit: number,
) {
  const uniqueRoutes = Array.from(
    new Map(
      routes
        .filter((route) => route.clickupListId.trim().length > 0)
        .map((route) => [route.clickupListId, route]),
    ).values(),
  );
  const routeMap = new Map(uniqueRoutes.map((route) => [route.clickupListId, route]));
  const now = new Date();
  const thresholdMs = now.getTime() - thresholdDays * 86_400_000;
  const results: LiveStaleClickupTask[] = [];

  for (const listBatch of chunk(uniqueRoutes, LIST_BATCH_SIZE)) {
    const listIds = listBatch.map((route) => route.clickupListId);

    for (let page = 0; ; page += 1) {
      const data = await fetchFilteredTasksPage({
        listIds,
        dateUpdatedLt: thresholdMs,
        page,
      });
      const tasks = data.tasks ?? [];

      for (const task of tasks) {
        const lastTouched =
          parseClickupTimestamp(task.date_updated) ?? parseClickupTimestamp(task.date_created);
        if (!lastTouched) {
          continue;
        }

        const listId = task.list?.id;
        const route = listId ? routeMap.get(listId) : null;
        const daysStale = daysBetween(now, lastTouched);

        results.push({
          aeName: route?.aeName ?? task.list?.name ?? "Unknown AE",
          taskId: task.id ?? "unknown-task-id",
          taskName: task.name ?? "Untitled task",
          taskUrl:
            typeof task.url === "string" && task.url.length > 0
              ? task.url
              : task.id
                ? `https://app.clickup.com/t/${task.id}`
                : null,
          status: task.status?.status ?? null,
          lastTouchedAt: lastTouched.toISOString(),
          daysStale,
        });
      }

      if (tasks.length < PAGE_SIZE) {
        break;
      }
    }
  }

  results.sort((left, right) => {
    const leftTime = left.lastTouchedAt ? new Date(left.lastTouchedAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightTime = right.lastTouchedAt ? new Date(right.lastTouchedAt).getTime() : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime;
  });

  return {
    totalCount: results.length,
    samples: results.slice(0, sampleLimit),
  };
}

export async function listLiveClickupEngagementTasks(
  routes: ClickupStaleListRoute[],
  updatedWithinDays: number,
) {
  const uniqueRoutes = Array.from(
    new Map(
      routes
        .filter((route) => route.clickupListId.trim().length > 0)
        .map((route) => [route.clickupListId, route]),
    ).values(),
  );
  const routeMap = new Map(uniqueRoutes.map((route) => [route.clickupListId, route]));
  const thresholdMs = Date.now() - updatedWithinDays * 86_400_000;
  const results: LiveClickupEngagementTask[] = [];

  const batchTasks = await Promise.all(
    chunk(uniqueRoutes, LIST_BATCH_SIZE).map(async (listBatch) => {
      const listIds = listBatch.map((route) => route.clickupListId);
      const batchResults: LiveClickupEngagementTask[] = [];

      for (let page = 0; ; page += 1) {
        const data = await fetchFilteredTasksPage({
          listIds,
          dateUpdatedGt: thresholdMs,
          page,
        });
        const tasks = data.tasks ?? [];

        for (const task of tasks) {
          const lastTouched =
            parseClickupTimestamp(task.date_updated) ?? parseClickupTimestamp(task.date_created);
          if (!lastTouched) {
            continue;
          }

          const listId = task.list?.id;
          const route = listId ? routeMap.get(listId) : null;

          batchResults.push({
            aeName: route?.aeName ?? task.list?.name ?? "Unknown AE",
            clickupListId: listId ?? route?.clickupListId ?? "unknown-list-id",
            taskId: task.id ?? "unknown-task-id",
            taskName: task.name ?? "Untitled task",
            taskUrl:
              typeof task.url === "string" && task.url.length > 0
                ? task.url
                : task.id
                  ? `https://app.clickup.com/t/${task.id}`
                  : null,
            status: task.status?.status ?? null,
            lastTouchedAt: lastTouched.toISOString(),
          });
        }

        if (tasks.length < PAGE_SIZE) {
          break;
        }
      }
      return batchResults;
    }),
  );

  results.push(...batchTasks.flat());

  return results;
}

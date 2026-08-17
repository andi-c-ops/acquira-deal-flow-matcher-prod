import { listActiveAeTheses } from "@/lib/dfm/db/repositories/ae-theses";
import { saveClickupEngagementSnapshot } from "@/lib/dfm/providers/google-drive-engagement-snapshot";
import { listLiveClickupEngagementTasks } from "@/lib/dfm/providers/clickup-stale-review";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

const DAY_MS = 86_400_000;

function latestActivityAt(values: Array<string | null>) {
  return values
    .filter((value): value is string => typeof value === "string")
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

export async function refreshClickupEngagementSnapshotWorkflow() {
  const activeAes = unwrapSupabaseResult(await listActiveAeTheses());
  const routes = activeAes
    .filter((ae) => typeof ae.clickup_list_id === "string" && ae.clickup_list_id.trim().length > 0)
    .map((ae) => ({
      aeThesisId: String(ae.id),
      aeName: String(ae.ae_name ?? "Unknown AE"),
      clickupListId: String(ae.clickup_list_id),
    }));

  const tasks = await listLiveClickupEngagementTasks(routes, 30);
  const fourteenDaysAgo = Date.now() - 14 * DAY_MS;
  const tasksByList = new Map<string, typeof tasks>();

  for (const task of tasks) {
    const listTasks = tasksByList.get(task.clickupListId) ?? [];
    listTasks.push(task);
    tasksByList.set(task.clickupListId, listTasks);
  }

  const snapshotRows = routes.map((route) => {
    const listTasks = tasksByList.get(route.clickupListId) ?? [];
    const recentlyUpdatedDeals14Days = listTasks.filter((task) => {
      return task.lastTouchedAt && new Date(task.lastTouchedAt).getTime() >= fourteenDaysAgo;
    }).length;

    return {
      aeThesisId: route.aeThesisId,
      clickupListId: route.clickupListId,
      recentlyUpdatedDeals14Days,
      recentlyUpdatedDeals30Days: listTasks.length,
      lastClickupActivityAt: latestActivityAt(listTasks.map((task) => task.lastTouchedAt)),
    };
  });

  const observedAt = new Date().toISOString();
  const saved = await saveClickupEngagementSnapshot({
    version: 1,
    observedAt,
    rows: snapshotRows,
  });

  return {
    ok: true,
    activeAes: activeAes.length,
    routedAes: routes.length,
    recentTasksObserved: tasks.length,
    snapshotsSaved: snapshotRows.length,
    observedAt,
    snapshotFileCreated: saved.created,
  };
}

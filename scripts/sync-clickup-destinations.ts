import { listActiveAeTheses, updateAeClickupListId } from "@/lib/dfm/db/repositories/ae-theses";
import {
  listDealsRoutesForSpace,
  normalizeClickupRouteName,
} from "@/lib/dfm/providers/clickup-routing";
import { unwrapSupabaseResult } from "@/lib/dfm/utils/supabase";

const ACCELERATOR_PORTFOLIO_SPACE_ID = "90142575724";

function readBooleanEnv(name: string, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function nameTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/& ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !["and", "&"].includes(token));
}

function hasCompoundAeName(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes(" & ") || normalized.includes(" and ");
}

function folderTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function tokenMatches(folderToken: string, aeToken: string) {
  return folderToken === aeToken || folderToken.startsWith(aeToken) || aeToken.startsWith(folderToken);
}

function resolveRoute(
  aeName: string,
  routes: Awaited<ReturnType<typeof listDealsRoutesForSpace>>,
) {
  const exact = routes.find(
    (route) => normalizeClickupRouteName(route.folderName) === normalizeClickupRouteName(aeName),
  );
  if (exact) {
    return {
      route: exact,
      strategy: "exact",
    } as const;
  }

  if (hasCompoundAeName(aeName)) {
    return null;
  }

  const aeTokens = nameTokens(aeName);
  if (aeTokens.length < 2) {
    return null;
  }

  const firstToken = aeTokens[0];
  const lastToken = aeTokens[aeTokens.length - 1];

  const candidates = routes.filter((route) => {
    const tokens = folderTokens(route.folderName);
    const firstMatches = tokens.some((token) => tokenMatches(token, firstToken));
    const lastMatches = tokens.some((token) => tokenMatches(token, lastToken));
    return firstMatches && lastMatches;
  });

  if (candidates.length !== 1) {
    return null;
  }

  return {
    route: candidates[0],
    strategy: "first_last_unique",
  } as const;
}

async function main() {
  const dryRun = readBooleanEnv("CLICKUP_DESTINATION_SYNC_DRY_RUN", true);
  const activeAes = unwrapSupabaseResult(await listActiveAeTheses());
  const routes = await listDealsRoutesForSpace(ACCELERATOR_PORTFOLIO_SPACE_ID);
  const routeMap = new Map(routes.map((route) => [normalizeClickupRouteName(route.folderName), route]));

  const summary = {
    dryRun,
    activeAes: activeAes.length,
    clickupRoutes: routes.length,
    matched: 0,
    updated: 0,
    unchanged: 0,
    strategyBreakdown: {} as Record<string, number>,
    unmatched: [] as Array<{ aeName: string; aeEmail?: string | null }>,
  };

  for (const ae of activeAes) {
    const aeName = String(ae.ae_name);
    const exactRoute = routeMap.get(normalizeClickupRouteName(aeName));
    const resolved =
      exactRoute != null
        ? {
            route: exactRoute,
            strategy: "exact",
          }
        : resolveRoute(aeName, routes);

    if (!resolved) {
      summary.unmatched.push({
        aeName,
        aeEmail: typeof ae.ae_email === "string" ? ae.ae_email : null,
      });
      continue;
    }

    summary.matched += 1;
    summary.strategyBreakdown[resolved.strategy] =
      (summary.strategyBreakdown[resolved.strategy] ?? 0) + 1;

    if (String(ae.clickup_list_id ?? "") === resolved.route.dealsListId) {
      summary.unchanged += 1;
      continue;
    }

    if (!dryRun) {
      unwrapSupabaseResult(await updateAeClickupListId(String(ae.id), resolved.route.dealsListId));
    }

    summary.updated += 1;

    console.log(
      JSON.stringify(
        {
          dryRun,
          aeName,
          aeEmail: typeof ae.ae_email === "string" ? ae.ae_email : null,
          folderName: resolved.route.folderName,
          dealsListId: resolved.route.dealsListId,
          strategy: resolved.strategy,
        },
        null,
        2,
      ),
    );
  }

  console.log(JSON.stringify(summary, null, 2));

  if (summary.unmatched.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

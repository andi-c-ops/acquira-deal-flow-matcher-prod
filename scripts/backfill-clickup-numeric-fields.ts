import { Client } from "pg";

const DEAL_CUSTOM_FIELD_IDS = {
  cashFlow: "98f50a47-2c8f-4a29-a186-b39a2e79b639",
  purchasePrice: "4add9c5e-c695-4512-a295-1aa166dec9df",
} as const;

type CandidateRow = {
  job_id: string;
  clickup_task_id: string;
  deal_id: string;
  business_name: string;
  price: string | number | null;
  ebitda: string | number | null;
};

type ClickupTaskField = {
  id?: string;
  name?: string;
  value?: unknown;
};

type ClickupTaskResponse = {
  id?: string;
  name?: string;
  custom_fields?: ClickupTaskField[];
};

function readBooleanEnv(name: string, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function readPositiveIntEnv(name: string, defaultValue: number) {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readNonNegativeIntEnv(name: string, defaultValue: number) {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return parsed;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? null;
  if (!databaseUrl) {
    throw new Error("DIRECT_URL or DATABASE_URL is required");
  }

  const parsed = new URL(databaseUrl);
  if (parsed.searchParams.get("sslmode") === "require") {
    parsed.searchParams.set("sslmode", "no-verify");
  }

  return parsed.toString();
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function coerceNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | null) {
  return value == null ? null : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

async function fetchTask(taskId: string, apiKey: string) {
  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ClickUp task fetch failed for ${taskId} with status ${response.status}`);
  }

  return (await response.json()) as ClickupTaskResponse;
}

async function setCustomFieldValue(taskId: string, fieldId: string, value: number, apiKey: string) {
  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/field/${fieldId}`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(
      `ClickUp custom field update failed for task ${taskId}, field ${fieldId} with status ${response.status}${details ? `: ${details}` : ""}`,
    );
  }
}

function getTaskFieldValue(task: ClickupTaskResponse, fieldId: string) {
  const field = (task.custom_fields ?? []).find((candidate) => candidate.id === fieldId);
  return field?.value ?? null;
}

async function main() {
  const dryRun = readBooleanEnv("CLICKUP_NUMERIC_BACKFILL_DRY_RUN", true);
  const includeTasks = readBooleanEnv("CLICKUP_NUMERIC_BACKFILL_INCLUDE_TASKS", true);
  const limit = readPositiveIntEnv("CLICKUP_NUMERIC_BACKFILL_LIMIT", 500);
  const offset = readNonNegativeIntEnv("CLICKUP_NUMERIC_BACKFILL_OFFSET", 0);
  const apiKey = getRequiredEnv("CLICKUP_API_KEY");

  const client = new Client({
    connectionString: getDatabaseUrl(),
  });

  await client.connect();

  try {
    const result = await client.query<CandidateRow>(
      `
        select
          receipts.job_id,
          receipts.clickup_task_id,
          jobs.deal_id::text as deal_id,
          deals.business_name,
          deals.price,
          deals.ebitda
        from dfm_private.clickup_delivery_receipts receipts
        join dfm_private.clickup_delivery_jobs jobs
          on jobs.id = receipts.job_id
        join dfm_public.deals_normalized deals
          on deals.id = jobs.deal_id
        where jobs.status = 'sent'
          and (deals.price is not null or deals.ebitda is not null)
        order by receipts.created_at desc
        limit $1
        offset $2
      `,
      [limit, offset],
    );

    const summary = {
      dryRun,
      includeTasks,
      offset,
      scanned: result.rows.length,
      candidatesWithAnyMissingField: 0,
      purchasePriceUpdated: 0,
      cashFlowUpdated: 0,
      skippedAlreadyFilled: 0,
      skippedNoSourceValue: 0,
      failures: 0,
      touchedTasks: [] as Array<Record<string, unknown>>,
    };

    for (const row of result.rows) {
      const purchasePrice = coerceNumericValue(row.price);
      const cashFlow = coerceNumericValue(row.ebitda);

      if (purchasePrice == null && cashFlow == null) {
        summary.skippedNoSourceValue += 1;
        continue;
      }

      try {
        const task = await fetchTask(row.clickup_task_id, apiKey);
        const currentPurchasePrice = getTaskFieldValue(task, DEAL_CUSTOM_FIELD_IDS.purchasePrice);
        const currentCashFlow = getTaskFieldValue(task, DEAL_CUSTOM_FIELD_IDS.cashFlow);

        const needsPurchasePrice = currentPurchasePrice == null && purchasePrice != null;
        const needsCashFlow = currentCashFlow == null && cashFlow != null;

        if (!needsPurchasePrice && !needsCashFlow) {
          summary.skippedAlreadyFilled += 1;
          continue;
        }

        summary.candidatesWithAnyMissingField += 1;

        if (!dryRun && needsPurchasePrice) {
          await setCustomFieldValue(
            row.clickup_task_id,
            DEAL_CUSTOM_FIELD_IDS.purchasePrice,
            purchasePrice,
            apiKey,
          );
        }

        if (!dryRun && needsCashFlow) {
          await setCustomFieldValue(
            row.clickup_task_id,
            DEAL_CUSTOM_FIELD_IDS.cashFlow,
            cashFlow,
            apiKey,
          );
        }

        if (needsPurchasePrice) {
          summary.purchasePriceUpdated += 1;
        }
        if (needsCashFlow) {
          summary.cashFlowUpdated += 1;
        }

        if (includeTasks) {
          summary.touchedTasks.push({
            taskId: row.clickup_task_id,
            dealName: row.business_name,
            purchasePrice,
            purchasePriceFormatted: formatCurrency(purchasePrice),
            cashFlow,
            cashFlowFormatted: formatCurrency(cashFlow),
            updatedPurchasePrice: needsPurchasePrice,
            updatedCashFlow: needsCashFlow,
            dryRun,
          });
        }
      } catch (error) {
        summary.failures += 1;
        summary.touchedTasks.push({
          taskId: row.clickup_task_id,
          dealName: row.business_name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(JSON.stringify(summary, null, 2));

    if (summary.failures > 0) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

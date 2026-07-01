import { getEnv } from "@/lib/dfm/config/env";
import { logError } from "@/lib/dfm/observability/logger";

export interface CreateClickupDealTaskInput {
  aeName: string;
  dealName: string;
  matchQuality: string;
  scorePct: number;
  description: string;
  clickupListId: string;
  businessDescription?: string | null;
  cashFlow?: number | null;
  dealLink?: string | null;
  industry?: string | null;
  location?: string | null;
  multiple?: number | null;
  purchasePrice?: number | null;
  state?: string | null;
  dryRun?: boolean;
}

export interface CreateClickupDealTaskResult {
  taskId: string;
  taskUrl: string;
  providerResponse: Record<string, unknown>;
}

const DEAL_CUSTOM_FIELD_IDS = {
  businessDescription: "a1ee8056-21a3-4b25-b4cc-34885ef2f60c",
  cashFlow: "98f50a47-2c8f-4a29-a186-b39a2e79b639",
  dealLink: "0c6b33bc-6d02-475b-9890-356b6e44228c",
  industry: "22b3c5e3-f261-462a-b79c-01c45802792b",
  location: "5798a709-78d9-438d-8f21-846c6b8e7c4b",
  multiple: "3fc6a6a8-4818-46a0-a299-77a01d446ff8",
  purchasePrice: "4add9c5e-c695-4512-a295-1aa166dec9df",
  state: "fbaf0a0d-9785-412c-abe5-2feb6b20b6f8",
  aeName: "5798a5a4-0f46-4fc9-bd89-8e429224218a",
} as const;

function buildCustomFields(input: CreateClickupDealTaskInput) {
  return [
    input.businessDescription
      ? { id: DEAL_CUSTOM_FIELD_IDS.businessDescription, value: input.businessDescription }
      : null,
    input.dealLink ? { id: DEAL_CUSTOM_FIELD_IDS.dealLink, value: input.dealLink } : null,
    input.industry ? { id: DEAL_CUSTOM_FIELD_IDS.industry, value: input.industry } : null,
    input.location ? { id: DEAL_CUSTOM_FIELD_IDS.location, value: input.location } : null,
    input.state ? { id: DEAL_CUSTOM_FIELD_IDS.state, value: input.state } : null,
    input.aeName ? { id: DEAL_CUSTOM_FIELD_IDS.aeName, value: input.aeName } : null,
  ].filter(Boolean);
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
      `ClickUp custom field update failed for field ${fieldId} with status ${response.status}${details ? `: ${details}` : ""}`,
    );
  }
}

async function trySetNumericCustomField(input: {
  taskId: string;
  fieldId: string;
  value: number | null | undefined;
  apiKey: string;
  fieldLabel: string;
  warnings: string[];
}) {
  if (input.value == null) {
    return;
  }

  try {
    await setCustomFieldValue(input.taskId, input.fieldId, input.value, input.apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.warnings.push(`${input.fieldLabel}: ${message}`);
    logError("ClickUp numeric custom field update failed after task creation", {
      taskId: input.taskId,
      fieldId: input.fieldId,
      fieldLabel: input.fieldLabel,
      value: input.value,
      error: message,
    });
  }
}

export async function createClickupDealTask(
  input: CreateClickupDealTaskInput,
): Promise<CreateClickupDealTaskResult> {
  if (input.dryRun) {
    return {
      taskId: "dry-run-task",
      taskUrl: "https://app.clickup.com/t/dry-run-task",
      providerResponse: {
        stub: true,
        dryRun: true,
        clickupListId: input.clickupListId,
      },
    };
  }

  const env = getEnv();
  if (!env.CLICKUP_API_KEY) {
    throw new Error("CLICKUP_API_KEY is required for live ClickUp task creation");
  }
  const response = await fetch(`https://api.clickup.com/api/v2/list/${input.clickupListId}/task`, {
    method: "POST",
    headers: {
      Authorization: env.CLICKUP_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `[${input.matchQuality}] ${input.dealName}`,
      description: input.description,
      tags: ["deal-flow", input.matchQuality.toLowerCase()],
      custom_fields: buildCustomFields(input),
    }),
  });

  if (!response.ok) {
    throw new Error(`ClickUp task creation failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    id?: string;
    url?: string;
  } & Record<string, unknown>;

  const taskId = data.id ?? "unknown-task-id";
  const warnings: string[] = [];

  await trySetNumericCustomField({
    taskId,
    fieldId: DEAL_CUSTOM_FIELD_IDS.purchasePrice,
    value: input.purchasePrice,
    apiKey: env.CLICKUP_API_KEY,
    fieldLabel: "purchasePrice",
    warnings,
  });

  await trySetNumericCustomField({
    taskId,
    fieldId: DEAL_CUSTOM_FIELD_IDS.cashFlow,
    value: input.cashFlow,
    apiKey: env.CLICKUP_API_KEY,
    fieldLabel: "cashFlow",
    warnings,
  });

  await trySetNumericCustomField({
    taskId,
    fieldId: DEAL_CUSTOM_FIELD_IDS.multiple,
    value: input.multiple,
    apiKey: env.CLICKUP_API_KEY,
    fieldLabel: "multiple",
    warnings,
  });

  return {
    taskId,
    taskUrl: typeof data.url === "string" ? data.url : `https://app.clickup.com/t/${taskId}`,
    providerResponse: warnings.length > 0 ? { ...data, numericFieldWarnings: warnings } : data,
  };
}

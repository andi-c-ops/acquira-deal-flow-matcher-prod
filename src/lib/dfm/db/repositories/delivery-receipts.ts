import { queryMaybeOne, queryOne } from "@/lib/dfm/db/client";

export interface InsertDeliveryReceiptInput {
  jobId: string;
  clickupTaskId: string;
  clickupTaskUrl?: string | null;
  providerResponseJson?: Record<string, unknown> | null;
}

export async function insertDeliveryReceipt(input: InsertDeliveryReceiptInput) {
  return queryOne(
    `
      insert into dfm_private.clickup_delivery_receipts (
        job_id,
        clickup_task_id,
        clickup_task_url,
        provider_response_json
      )
      values ($1, $2, $3, $4::jsonb)
      on conflict (job_id)
      do update set
        clickup_task_id = dfm_private.clickup_delivery_receipts.clickup_task_id,
        clickup_task_url = coalesce(
          dfm_private.clickup_delivery_receipts.clickup_task_url,
          excluded.clickup_task_url
        ),
        provider_response_json = coalesce(
          dfm_private.clickup_delivery_receipts.provider_response_json,
          excluded.provider_response_json
        )
      returning *
    `,
    [
      input.jobId,
      input.clickupTaskId,
      input.clickupTaskUrl ?? null,
      JSON.stringify(input.providerResponseJson ?? null),
    ],
  );
}

export async function getDeliveryReceiptByJobId(jobId: string) {
  return queryMaybeOne(
    `select * from dfm_private.clickup_delivery_receipts where job_id = $1`,
    [jobId],
  );
}

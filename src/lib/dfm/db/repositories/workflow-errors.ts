import { queryOne } from "@/lib/dfm/db/client";

export interface InsertWorkflowErrorInput {
  errorType: string;
  errorMessage: string;
  runId?: string | null;
  jobId?: string | null;
  errorJson?: Record<string, unknown> | null;
}

export async function insertWorkflowError(input: InsertWorkflowErrorInput) {
  return queryOne(
    `
      insert into dfm_private.workflow_errors (
        run_id,
        job_id,
        error_type,
        error_message,
        error_json
      )
      values ($1, $2, $3::dfm_private.error_type, $4, $5::jsonb)
      returning *
    `,
    [
      input.runId ?? null,
      input.jobId ?? null,
      input.errorType,
      input.errorMessage,
      JSON.stringify(input.errorJson ?? null),
    ],
  );
}

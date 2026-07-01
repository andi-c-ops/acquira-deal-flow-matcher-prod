import { randomUUID } from "node:crypto";

import type { BaseRunResult, RunReplayInput } from "@/lib/dfm/domain/types";
import { logInfo } from "@/lib/dfm/observability/logger";

export async function runReplayWorkflow(input: RunReplayInput): Promise<BaseRunResult> {
  const runId = randomUUID();
  logInfo("Starting DFM replay workflow", { runId, input });

  return {
    ok: true,
    runId,
    status: "running",
    summary: {
      mode: input.mode,
      dryRun: input.dryRun ?? true,
      replayTarget: input.runId ?? input.aeThesisId ?? null,
    },
  };
}

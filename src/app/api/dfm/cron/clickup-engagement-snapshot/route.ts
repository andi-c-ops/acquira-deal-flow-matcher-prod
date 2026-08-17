import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/dfm/auth/verify-cron";
import { logError } from "@/lib/dfm/observability/logger";
import { refreshClickupEngagementSnapshotWorkflow } from "@/lib/dfm/workflows/refresh-clickup-engagement-snapshot";

// This isolated scan may take longer than an interactive agent request.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await refreshClickupEngagementSnapshotWorkflow());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError("ClickUp engagement snapshot refresh failed", { message });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

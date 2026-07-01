import { NextResponse } from "next/server";

import { verifyInternalRequest } from "@/lib/dfm/auth/verify-internal-request";
import { replayRunSchema } from "@/lib/dfm/domain/schemas";
import { runReplayWorkflow } from "@/lib/dfm/workflows/run-replay";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!verifyInternalRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const input = replayRunSchema.parse(json);
  const result = await runReplayWorkflow(input);

  return NextResponse.json(result);
}

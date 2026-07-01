import { NextResponse } from "next/server";

import { verifyEventSignature } from "@/lib/dfm/auth/verify-event-signature";
import { newAeEventSchema } from "@/lib/dfm/domain/schemas";
import { runNewAeBackfillWorkflow } from "@/lib/dfm/workflows/run-new-ae-backfill";

export async function POST(request: Request) {
  if (!verifyEventSignature(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const input = newAeEventSchema.parse(json);
  const result = await runNewAeBackfillWorkflow(input);

  return NextResponse.json(result);
}

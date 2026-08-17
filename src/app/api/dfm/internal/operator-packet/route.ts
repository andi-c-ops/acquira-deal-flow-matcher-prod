import { NextResponse } from "next/server";

import {
  closeOperatorAgentPacketRuntime,
  loadOperatorAgentPacket,
} from "@/lib/dfm/agents/operator-packet-runtime";
import { verifyInternalRequest } from "@/lib/dfm/auth/verify-internal-request";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyInternalRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const packet = await loadOperatorAgentPacket();
    return NextResponse.json({
      ok: true,
      packet,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  } finally {
    await closeOperatorAgentPacketRuntime();
  }
}

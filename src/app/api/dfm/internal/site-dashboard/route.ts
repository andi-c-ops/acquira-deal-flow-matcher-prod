import { NextResponse } from "next/server";

import {
  closeOperatorAgentPacketRuntime,
  loadOperatorAgentPacket,
} from "@/lib/dfm/agents/operator-packet-runtime";
import { verifyDashboardReadRequest } from "@/lib/dfm/auth/verify-dashboard-read-request";

export const maxDuration = 30;

export async function GET(request: Request) {
  if (!verifyDashboardReadRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const packet = await loadOperatorAgentPacket();
    const sitePacket = {
      ...packet,
      coverageReview: {
        ...packet.coverageReview,
        flaggedAes: packet.coverageReview.flaggedAes.map(({ aeEmail: _aeEmail, ...ae }) => ae),
      },
    };
    return NextResponse.json({ ok: true, packet: sitePacket });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    await closeOperatorAgentPacketRuntime();
  }
}

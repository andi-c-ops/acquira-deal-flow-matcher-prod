import { NextResponse } from "next/server";

import {
  closeOperatorAgentPacketRuntime,
  loadOperatorAgentPacket,
} from "@/lib/dfm/agents/operator-packet-runtime";
import { verifyTendReadRequest } from "@/lib/dfm/auth/verify-tend-read-request";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!verifyTendReadRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const packet = await loadOperatorAgentPacket();
    const redactedPacket = {
      ...packet,
      coverageReview: {
        ...packet.coverageReview,
        flaggedAes: packet.coverageReview.flaggedAes.map(({ aeEmail: _aeEmail, ...ae }) => ae),
      },
    };

    return NextResponse.json(
      {
        ok: true,
        schemaVersion: "1.0",
        feedId: "acquira-deal-flow-health",
        controlRoomUrl: "https://acquira-deal-flow-control-room.andicunanan2024.chatgpt.site/",
        packet: redactedPacket,
      },
      {
        headers: {
          "cache-control": "no-store",
          "x-robots-tag": "noindex, nofollow",
        },
      },
    );
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

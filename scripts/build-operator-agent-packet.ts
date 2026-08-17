import {
  closeOperatorAgentPacketRuntime,
  loadOperatorAgentPacket,
} from "@/lib/dfm/agents/operator-packet-runtime";

async function main() {
  try {
    const packet = await loadOperatorAgentPacket();
    console.log(JSON.stringify(packet, null, 2));
  } finally {
    await closeOperatorAgentPacketRuntime();
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});

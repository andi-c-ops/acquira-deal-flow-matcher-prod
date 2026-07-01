import { getEnv } from "@/lib/dfm/config/env";

export function verifyEventSignature(request: Request): boolean {
  const signature = request.headers.get("x-dfm-event-secret");
  return signature === getEnv().DFM_EVENT_SECRET;
}

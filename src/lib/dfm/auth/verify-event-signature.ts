import { getEnv } from "@/lib/dfm/config/env";
import { matchesConfiguredSecret } from "@/lib/dfm/auth/secret-rollover";

export function verifyEventSignature(request: Request): boolean {
  const signature = request.headers.get("x-dfm-event-secret");
  const env = getEnv();
  return matchesConfiguredSecret(signature, env.DFM_EVENT_SECRET, env.DFM_EVENT_SECRET_NEXT);
}

import { getEnv } from "@/lib/dfm/config/env";

export function verifyInternalRequest(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${getEnv().DFM_INTERNAL_SECRET}`;
}

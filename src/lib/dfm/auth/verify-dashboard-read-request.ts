import { getEnv } from "@/lib/dfm/config/env";

export function verifyDashboardReadRequest(request: Request): boolean {
  const token = getEnv().DFM_DASHBOARD_READ_TOKEN;
  const authHeader = request.headers.get("authorization");
  return Boolean(token) && authHeader === `Bearer ${token}`;
}

import { hasOperatorSession } from "@/lib/dfm/auth/operator-session";

export default async function ReconcileDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ jobId?: string; taskId?: string }>;
}) {
  const sessionOk = await hasOperatorSession();
  const params = await searchParams;

  if (!sessionOk) {
    return (
      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "32px" }}>
        <h1>Operator session required</h1>
        <p>Open the protected operator dashboard first, then return to this reconciliation page.</p>
        <a href="/dfm/operator">Open operator dashboard</a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "720px", margin: "0 auto", padding: "32px" }}>
      <p style={{ color: "#0f766e", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
        Deal Flow Matcher
      </p>
      <h1>Controlled delivery reconciliation</h1>
      <p>
        This verifies one existing ClickUp task against one processing delivery job. It writes a receipt only
        when the task is in the job&apos;s configured list and has the expected deal title.
      </p>
      <form action="/api/dfm/internal/reconcile-delivery" method="post" style={{ display: "grid", gap: "16px", marginTop: "24px" }}>
        <label style={{ display: "grid", gap: "6px" }}>
          <span>Delivery job ID</span>
          <input name="jobId" required defaultValue={params.jobId ?? ""} style={{ padding: "10px" }} />
        </label>
        <label style={{ display: "grid", gap: "6px" }}>
          <span>Existing ClickUp task ID</span>
          <input name="taskId" required defaultValue={params.taskId ?? ""} style={{ padding: "10px" }} />
        </label>
        <label style={{ display: "flex", gap: "8px", alignItems: "start" }}>
          <input type="checkbox" name="confirmation" value="RECONCILE_EXISTING_TASK" required />
          <span>I confirm that this exact task should satisfy this exact delivery job.</span>
        </label>
        <button type="submit" style={{ width: "fit-content", padding: "11px 16px", fontWeight: 700 }}>
          Verify and reconcile
        </button>
      </form>
      <p style={{ marginTop: "24px" }}>
        <a href="/dfm/operator">Return to operator dashboard</a>
      </p>
    </main>
  );
}

import { closePool } from "@/lib/dfm/db/client";
import { runDailyWorkflow } from "@/lib/dfm/workflows/run-daily";

function readBooleanEnv(name: string, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

async function main() {
  const dryRun = readBooleanEnv("RECOVERY_DRY_RUN", true);
  const skipNotifications = readBooleanEnv("RECOVERY_SKIP_NOTIFICATIONS", false);
  const cursorStartOverride = process.env.RECOVERY_CURSOR_START ?? null;
  const cursorEndOverride = process.env.RECOVERY_CURSOR_END ?? null;

  if (!cursorStartOverride || !cursorEndOverride) {
    throw new Error("RECOVERY_CURSOR_START and RECOVERY_CURSOR_END are required");
  }

  const result = await runDailyWorkflow({
    dryRun,
    force: true,
    cursorStartOverride,
    cursorEndOverride,
    skipNotifications,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });

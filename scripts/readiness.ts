type Check = {
  label: string;
  ok: boolean;
  detail: string;
};

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function formatCheck(check: Check) {
  const prefix = check.ok ? "OK" : "MISSING";
  return `${prefix}  ${check.label}: ${check.detail}`;
}

function buildChecks() {
  const env = process.env;
  const checks: Check[] = [
    {
      label: "Managed Postgres connection",
      ok:
        hasValue(env.SUPABASE_SERVICE_ROLE_KEY) ||
        hasValue(env.DIRECT_URL) ||
        hasValue(env.DATABASE_URL),
      detail:
        hasValue(env.SUPABASE_SERVICE_ROLE_KEY) ||
        hasValue(env.DIRECT_URL) ||
        hasValue(env.DATABASE_URL)
          ? hasValue(env.SUPABASE_SERVICE_ROLE_KEY)
            ? "Supabase service role configured"
            : hasValue(env.DIRECT_URL)
              ? "DIRECT_URL configured"
              : "DATABASE_URL configured"
          : "required for cron, worker, dedupe, and cursor persistence",
    },
    {
      label: "Airtable API key",
      ok: hasValue(env.AIRTABLE_API_KEY),
      detail: hasValue(env.AIRTABLE_API_KEY) ? "configured" : "required for daily deal intake",
    },
    {
      label: "Cron secret",
      ok: hasValue(env.CRON_SECRET),
      detail: hasValue(env.CRON_SECRET) ? "configured" : "required for Vercel cron auth",
    },
    {
      label: "Internal worker secret",
      ok: hasValue(env.DFM_INTERNAL_SECRET),
      detail: hasValue(env.DFM_INTERNAL_SECRET)
        ? "configured"
        : "required for internal worker and replay routes",
    },
    {
      label: "ClickUp API key",
      ok: hasValue(env.CLICKUP_API_KEY),
      detail: hasValue(env.CLICKUP_API_KEY)
        ? "configured"
        : "required for live ClickUp task delivery",
    },
    {
      label: "ClickUp team id",
      ok: hasValue(env.CLICKUP_TEAM_ID),
      detail: hasValue(env.CLICKUP_TEAM_ID) ? "configured" : "recommended for future ClickUp mapping",
    },
    {
      label: "Notification sender",
      ok: hasValue(env.GMAIL_SENDER),
      detail: hasValue(env.GMAIL_SENDER) ? "configured" : "required for report and error emails",
    },
    {
      label: "Notification recipient",
      ok: hasValue(env.NOTIFICATION_TO),
      detail: hasValue(env.NOTIFICATION_TO) ? "configured" : "required for report and error emails",
    },
  ];

  if (env.NOTIFICATION_PROVIDER === "gmail_oauth") {
    checks.push(
      {
        label: "Google OAuth client",
        ok: hasValue(env.GOOGLE_OAUTH_CLIENT_JSON) || hasValue(env.GOOGLE_OAUTH_CLIENT_FILE),
        detail:
          hasValue(env.GOOGLE_OAUTH_CLIENT_JSON) || hasValue(env.GOOGLE_OAUTH_CLIENT_FILE)
            ? hasValue(env.GOOGLE_OAUTH_CLIENT_JSON)
              ? "inline JSON configured"
              : "file path configured"
            : "required for Gmail and Sheets token refresh",
      },
      {
        label: "Google Gmail token",
        ok: hasValue(env.GOOGLE_GMAIL_TOKEN_JSON) || hasValue(env.GOOGLE_GMAIL_TOKEN_FILE),
        detail:
          hasValue(env.GOOGLE_GMAIL_TOKEN_JSON) || hasValue(env.GOOGLE_GMAIL_TOKEN_FILE)
            ? hasValue(env.GOOGLE_GMAIL_TOKEN_JSON)
              ? "inline JSON configured"
              : "file path configured"
            : "required for Gmail OAuth notifications",
      },
      {
        label: "Google Sheets token or API key",
        ok:
          hasValue(env.GOOGLE_API_KEY) ||
          hasValue(env.GOOGLE_SHEETS_TOKEN_JSON) ||
          hasValue(env.GOOGLE_SHEETS_TOKEN_FILE),
        detail:
          hasValue(env.GOOGLE_API_KEY) ||
          hasValue(env.GOOGLE_SHEETS_TOKEN_JSON) ||
          hasValue(env.GOOGLE_SHEETS_TOKEN_FILE)
            ? hasValue(env.GOOGLE_API_KEY)
              ? "API key configured"
              : hasValue(env.GOOGLE_SHEETS_TOKEN_JSON)
                ? "inline token JSON configured"
                : "file path configured"
            : "required for daily new-AE check",
      },
    );
  } else {
    checks.push({
      label: "Gmail app password",
      ok: hasValue(env.GMAIL_APP_PASSWORD),
      detail: hasValue(env.GMAIL_APP_PASSWORD)
        ? "configured"
        : "required when NOTIFICATION_PROVIDER=gmail",
    });
  }

  return checks;
}

function main() {
  const checks = buildChecks();
  const failing = checks.filter((check) => !check.ok);

  console.log("DFM readiness check");
  console.log("");
  for (const check of checks) {
    console.log(formatCheck(check));
  }

  console.log("");
  if (failing.length === 0) {
    console.log("Ready for unattended execution.");
    return;
  }

  console.log(`Not ready: ${failing.length} required item(s) missing.`);
  process.exitCode = 1;
}

main();

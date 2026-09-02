import { z } from "zod";

const optionalRolloverSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  AIRTABLE_API_KEY: z.string().min(1),
  AIRTABLE_BASE_ID: z.string().min(1),
  AIRTABLE_TABLE_ID: z.string().min(1),
  AIRTABLE_VIEW_ID: z.string().optional(),
  CLICKUP_API_KEY: z.string().optional(),
  CLICKUP_TEAM_ID: z.string().optional(),
  CRON_SECRET: z.string().min(1).optional(),
  CRON_SECRET_NEXT: optionalRolloverSecret,
  DFM_INTERNAL_SECRET: z.string().min(1).optional(),
  DFM_INTERNAL_SECRET_NEXT: optionalRolloverSecret,
  DFM_DASHBOARD_READ_TOKEN: z.string().min(1).optional(),
  DFM_EVENT_SECRET: z.string().min(1).optional(),
  DFM_EVENT_SECRET_NEXT: optionalRolloverSecret,
  GOOGLE_SHEET_ID: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_SHEET_RANGE: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_FILE: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_JSON: z.string().optional(),
  GOOGLE_GMAIL_TOKEN_FILE: z.string().optional(),
  GOOGLE_GMAIL_TOKEN_JSON: z.string().optional(),
  GOOGLE_SHEETS_TOKEN_FILE: z.string().optional(),
  GOOGLE_SHEETS_TOKEN_JSON: z.string().optional(),
  NOTIFICATION_PROVIDER: z.enum(["gmail", "gmail_oauth"]).default("gmail"),
  GMAIL_SENDER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  NOTIFICATION_TO: z.string().optional(),
});

export type DfmEnv = z.infer<typeof envSchema>;

export function parseDfmEnv(source: Record<string, string | undefined>): DfmEnv {
  return envSchema.parse(source);
}

let cachedEnv: DfmEnv | null = null;

export function getEnv(): DfmEnv {
  if (cachedEnv) return cachedEnv;
  cachedEnv = parseDfmEnv(process.env);
  return cachedEnv;
}

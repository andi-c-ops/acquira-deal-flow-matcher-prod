import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

import type { DeliveryMinMatchQuality } from "@/lib/dfm/matching/delivery-threshold";
import { normalizeDeliveryMinMatchQuality } from "@/lib/dfm/matching/delivery-threshold";

type Action = "list" | "set";
type ListMode = "exceptions" | "all";

const DEFAULT_ENV_FILE =
  "/Users/andicunanan/Documents/CompanyOS/empowerlabs-ccworkspace/config/acquira-crm.env.local";

type AeThesisRow = {
  id: string;
  ae_name: string;
  ae_email: string | null;
  clickup_list_id: string | null;
  delivery_min_match_quality?: string | null;
};

let pool: Pool | null = null;

function loadEnvFileIfNeeded() {
  if (process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.SUPABASE_DB_URL) {
    return;
  }

  const envFile = process.env.DFM_ENV_FILE ?? DEFAULT_ENV_FILE;
  const resolvedPath = resolve(envFile);
  if (!existsSync(resolvedPath)) {
    return;
  }

  for (const rawLine of readFileSync(resolvedPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex < 1) continue;

    const key = normalizedLine.slice(0, separatorIndex).trim();
    let value = normalizedLine.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function getDatabaseUrl() {
  loadEnvFileIfNeeded();
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    throw new Error(
      "Missing database connection. Set DIRECT_URL, DATABASE_URL, SUPABASE_DB_URL, or DFM_ENV_FILE.",
    );
  }

  const parsed = new URL(databaseUrl);
  if (parsed.searchParams.get("sslmode") === "require") {
    parsed.searchParams.set("sslmode", "no-verify");
  }
  return parsed.toString();
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
  }
  return pool;
}

async function listActiveAeTheses() {
  const result = await getPool().query<AeThesisRow>(
    `
      select id, ae_name, ae_email, clickup_list_id, delivery_min_match_quality
        from dfm_public.ae_theses
       where status = 'active'
       order by ae_name asc
    `,
  );
  return result.rows;
}

async function updateAeDeliveryMinMatchQuality(
  aeThesisId: string,
  deliveryMinMatchQuality: DeliveryMinMatchQuality,
) {
  const result = await getPool().query<AeThesisRow>(
    `
      update dfm_public.ae_theses
         set delivery_min_match_quality = $2
       where id = $1
       returning id, ae_name, ae_email, clickup_list_id, delivery_min_match_quality
    `,
    [aeThesisId, deliveryMinMatchQuality],
  );
  if (result.rows.length !== 1) {
    throw new Error(`Expected to update 1 AE row, updated ${result.rows.length}`);
  }
  return result.rows[0];
}

function readBooleanEnv(name: string, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function readAction(): Action {
  const value = process.env.DFM_DELIVERY_THRESHOLD_ACTION?.trim().toLowerCase() ?? "list";
  if (value === "list" || value === "set") return value;
  throw new Error("DFM_DELIVERY_THRESHOLD_ACTION must be list or set");
}

function readListMode(): ListMode {
  const value = process.env.DFM_DELIVERY_THRESHOLD_LIST_MODE?.trim().toLowerCase() ?? "exceptions";
  if (value === "exceptions" || value === "all") return value;
  throw new Error("DFM_DELIVERY_THRESHOLD_LIST_MODE must be exceptions or all");
}

function readDeliveryMinMatchQuality(): DeliveryMinMatchQuality {
  const value = process.env.DFM_DELIVERY_THRESHOLD_VALUE;
  if (value !== "Strong" && value !== "Moderate") {
    throw new Error("DFM_DELIVERY_THRESHOLD_VALUE must be Strong or Moderate");
  }
  return value;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function matchesSelector(ae: AeThesisRow) {
  const id = process.env.DFM_DELIVERY_THRESHOLD_AE_ID?.trim();
  const email = process.env.DFM_DELIVERY_THRESHOLD_AE_EMAIL?.trim();
  const name = process.env.DFM_DELIVERY_THRESHOLD_AE_NAME?.trim();

  if (id) return String(ae.id) === id;
  if (email) return normalize(ae.ae_email) === email.toLowerCase();
  if (name) return normalize(ae.ae_name) === name.toLowerCase();

  throw new Error(
    "Set one selector: DFM_DELIVERY_THRESHOLD_AE_ID, DFM_DELIVERY_THRESHOLD_AE_EMAIL, or DFM_DELIVERY_THRESHOLD_AE_NAME",
  );
}

function formatAe(ae: AeThesisRow) {
  return {
    aeId: ae.id,
    aeName: ae.ae_name,
    aeEmail: ae.ae_email,
    clickupListId: ae.clickup_list_id,
    deliveryMinMatchQuality: normalizeDeliveryMinMatchQuality(ae.delivery_min_match_quality),
  };
}

async function listThresholds() {
  const listMode = readListMode();
  const activeAes = await listActiveAeTheses();
  const rows = activeAes
    .map((ae) => formatAe(ae))
    .filter((ae) => listMode === "all" || ae.deliveryMinMatchQuality === "Strong");

  console.log(
    JSON.stringify(
      {
        action: "list",
        listMode,
        activeAes: activeAes.length,
        returned: rows.length,
        rows,
      },
      null,
      2,
    ),
  );
}

async function setThreshold() {
  const dryRun = readBooleanEnv("DFM_DELIVERY_THRESHOLD_DRY_RUN", true);
  const value = readDeliveryMinMatchQuality();
  const activeAes = await listActiveAeTheses();
  const matches = activeAes.filter((ae) => matchesSelector(ae));

  if (matches.length !== 1) {
    console.log(
      JSON.stringify(
        {
          action: "set",
          dryRun,
          requestedValue: value,
          matches: matches.map((ae) => formatAe(ae)),
        },
        null,
        2,
      ),
    );
    throw new Error(`Expected exactly 1 AE match, found ${matches.length}`);
  }

  const before = formatAe(matches[0]);
  let after = before;
  if (!dryRun) {
    after = formatAe(await updateAeDeliveryMinMatchQuality(before.aeId, value));
  } else {
    after = {
      ...before,
      deliveryMinMatchQuality: value,
    };
  }

  console.log(
    JSON.stringify(
      {
        action: "set",
        dryRun,
        before,
        after,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const action = readAction();
  if (action === "list") {
    await listThresholds();
    return;
  }
  await setThreshold();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool?.end();
});

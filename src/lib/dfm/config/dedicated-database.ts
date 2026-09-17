/**
 * Dedicated DFM database contract for the migration path.
 *
 * This intentionally does not fall back to DIRECT_URL, DATABASE_URL, or
 * SUPABASE_URL. DFM runtime and operator paths must remain separate from
 * Acquira CRM persistence.
 */
export function getDedicatedDfmDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
) {
  const value = source.DFM_DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DFM_DATABASE_URL is required for the dedicated DFM database");
  }
  return value;
}

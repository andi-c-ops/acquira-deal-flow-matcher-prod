export function unwrapSupabaseResult<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) {
    throw new Error(result.error.message);
  }

  if (result.data === null) {
    throw new Error("Supabase query returned no data");
  }

  return result.data;
}

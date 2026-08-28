import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

/**
 * Privileged Supabase client using the secret ("service_role") key — it
 * bypasses Row Level Security entirely. Server-only, and only for the
 * specific cases where that's actually required:
 *
 *   - Student-facing operations (join a quiz, submit an answer, complete a
 *     session). Students never sign in with Supabase Auth, so there is no
 *     `auth.uid()` for RLS to key off — authorization for these calls must
 *     be implemented in the calling code (e.g. validating a session token)
 *     BEFORE using this client, not delegated to Postgres.
 *   - Trusted server-side jobs that legitimately need to read/write across
 *     teachers (e.g. a future admin/maintenance task).
 *
 * Teacher-facing reads/writes should go through `./server`'s
 * `createClient()` instead, which respects RLS.
 *
 * Never import this file from a Client Component or any module that ships
 * to the browser — `server-only` turns that into a build error.
 */
export function createAdminClient() {
  const env = getEnv();

  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

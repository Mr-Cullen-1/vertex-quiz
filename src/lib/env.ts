import "server-only";
import { z } from "zod";

/**
 * Server-only environment schema. Importing "server-only" makes any
 * accidental import from a Client Component a build error, rather than a
 * leaked secret discovered later.
 *
 * Validation is lazy (see `getEnv()` below) — importing this module must
 * never throw, only calling `getEnv()` does. That keeps pages/routes that
 * don't touch Supabase or Gemini working even before those credentials
 * exist, instead of crashing the whole app on an unrelated request.
 */
/**
 * zod's built-in `z.httpUrl()`/`z.url()` require a dotted, TLD-like
 * hostname and reject bare hosts like `localhost` or `127.0.0.1` — which
 * breaks the most common local-dev values (`http://localhost:3000`, or a
 * locally-run `supabase start` at `http://127.0.0.1:54321`). This is a
 * plain http(s)-only check instead.
 */
const httpUrl = (message: string) =>
  z.string().refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { error: message }
  );

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl(
    "NEXT_PUBLIC_SUPABASE_URL must be a valid URL, e.g. https://xyzcompany.supabase.co"
  ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required — the 'anon'/'publishable' key from Supabase → Project Settings → API"),
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1, "SUPABASE_SECRET_KEY is required — the 'service_role'/'secret' key from Supabase → Project Settings → API. Server-only, never exposed to the client."),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  NEXT_PUBLIC_APP_URL: httpUrl("NEXT_PUBLIC_APP_URL must be a valid http(s) URL").default(
    "http://localhost:3000"
  ),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Validates and returns server-side environment variables. Throws a single
 * readable error listing every missing/invalid variable, rather than
 * failing deep inside a Supabase/Gemini call with an unrelated message.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(value)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${details}\n\n` +
        "Copy .env.example to .env.local and fill in the real values."
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Cheap presence check for code paths (e.g. the session-refresh proxy) that
 * must degrade gracefully instead of throwing when Supabase isn't
 * configured yet. Does not validate format — just "is something set".
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

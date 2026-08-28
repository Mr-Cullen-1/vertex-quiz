// Verifies that required environment variables are present and well-formed
// WITHOUT ever printing their values — only pass/fail per variable. Reads
// from process.env, which the caller populates via `node --env-file=.env.local`.
import { z } from "zod";

// Plain http(s)-only check — zod's built-in z.httpUrl()/z.url() reject bare
// hosts like `localhost` or `127.0.0.1`, which breaks local-dev values.
const httpUrl = () =>
  z.string().refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "must be a valid http(s) URL");

const checks = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    schema: httpUrl(),
    detail: (v) => `${v.startsWith("https://") ? "https" : "http"}, host set: ${Boolean(new URL(v).hostname)}`,
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    schema: z.string().min(20),
    detail: (v) => `length ${v.length}`,
  },
  {
    key: "SUPABASE_SECRET_KEY",
    schema: z.string().min(20),
    detail: (v) => `length ${v.length}`,
  },
  {
    key: "GEMINI_API_KEY",
    schema: z.string().min(10),
    detail: (v) => `length ${v.length}`,
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    schema: httpUrl(),
    detail: (v) => `${v.startsWith("https://") ? "https" : "http"}`,
  },
];

let allOk = true;

for (const { key, schema, detail } of checks) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") {
    console.log(`MISSING  ${key}`);
    allOk = false;
    continue;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    console.log(`INVALID  ${key} — ${result.error.issues[0]?.message ?? "does not match expected format"}`);
    allOk = false;
    continue;
  }
  console.log(`OK       ${key} (${detail(raw)})`);
}

console.log("");
console.log(allOk ? "All required environment variables are present and well-formed." : "One or more environment variables are missing or invalid.");
process.exit(allOk ? 0 : 1);

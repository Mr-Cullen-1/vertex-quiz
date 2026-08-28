import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { assertNoError } from "@/lib/supabase/assert-no-error";

export const metadata: Metadata = {
  title: "Settings — Vertex Quiz",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const { data: profile, error } = claims
    ? await supabase
        .from("profiles")
        .select("full_name, created_at")
        .eq("id", claims.sub)
        .maybeSingle()
    : { data: null, error: null };

  assertNoError(error, "Failed to load your profile");

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Your Vertex Quiz account.
        </p>
      </div>

      <div className="max-w-lg rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <dl className="flex flex-col divide-y divide-border">
          <div className="flex items-center justify-between py-3 first:pt-0">
            <dt className="text-sm text-muted-foreground">Name</dt>
            <dd className="text-sm font-medium text-foreground">
              {profile?.full_name || "Not set"}
            </dd>
          </div>
          <div className="flex items-center justify-between py-3">
            <dt className="text-sm text-muted-foreground">Email</dt>
            <dd className="text-sm font-medium text-foreground">
              {claims?.email ?? "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between py-3 last:pb-0">
            <dt className="text-sm text-muted-foreground">Member since</dt>
            <dd className="text-sm font-medium text-foreground">
              {memberSince ?? "—"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

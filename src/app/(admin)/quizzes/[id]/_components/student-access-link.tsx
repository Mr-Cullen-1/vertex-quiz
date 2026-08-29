"use client";

import { useState } from "react";
import { Check, Copy, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StudentAccessLink({ joinUrl }: { joinUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser (permissions,
      // insecure context) — the URL is still visible and selectable in
      // the input below, so this is a silent no-op, not a broken feature.
    }
  }

  return (
    <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-ai/10 text-ai">
          <LinkIcon className="size-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Student access link</h3>
          <p className="text-sm text-muted-foreground">
            Share this link — students join with just their first and last name.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input readOnly value={joinUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}

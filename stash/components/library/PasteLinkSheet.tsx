"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { cleanUrl, detectPlatform, extractUrl } from "@/lib/links";
import { enqueue, flush } from "@/lib/outbox";
import { haptic } from "@/lib/haptics";

/** Paste a link instead of sharing it (handy on a computer, or for a copied link). */
export function PasteLinkSheet({
  open,
  onClose,
  spaceId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  spaceId?: string | null;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const raw = extractUrl(value);
  const invalid = value.trim().length > 0 && !raw;

  const save = async () => {
    if (!raw) return;
    const url = cleanUrl(raw);
    await enqueue({
      clientId: crypto.randomUUID(),
      sourceUrl: url,
      platform: detectPlatform(url),
      spaceId: spaceId ?? null,
      sharedTitle: null,
      savedAt: new Date().toISOString(),
    });
    haptic();
    setValue("");
    onSaved();
    onClose();
    void flush();
  };

  return (
    <Sheet open={open} onClose={onClose} label="Save a link" title="Save a link">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField
          label="Link"
          hideLabel
          type="url"
          inputMode="url"
          autoFocus
          placeholder="https://www.instagram.com/reel/…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={invalid ? "That doesn't look like a link." : undefined}
          hint="Tip: in Instagram or TikTok, tap Share → Stash to save without leaving the app."
        />
        <Button type="submit" disabled={!raw} fullWidth>
          Save
        </Button>
      </form>
    </Sheet>
  );
}

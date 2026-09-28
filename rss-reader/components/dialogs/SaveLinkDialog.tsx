"use client";

import * as React from "react";
import { Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { ArticleSummary } from "@/lib/types";
import { cacheLaterForOffline } from "@/components/layout/OfflineSupport";

interface SaveLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Save any web page to Read Later; the server extracts the readable text. */
export function SaveLinkDialog({ open, onOpenChange }: SaveLinkDialogProps) {
  const { setView, setLaterTab, setSelectedArticleId, setMobilePane } = useReaderState();
  const { mutate } = useSWRConfig();
  const [url, setUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setUrl("");
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/later", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save this link");
      const article = body.article as ArticleSummary;
      await mutate((key) => typeof key === "string" && key.startsWith("/api/articles"));
      toast.success(body.existed ? "Moved to the top of Later" : "Saved to Later");
      cacheLaterForOffline();
      onOpenChange(false);
      setView({ type: "later", label: "Later" });
      setLaterTab("queue");
      setSelectedArticleId(article.id);
      setMobilePane("reader");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Save a link</DialogTitle>
            <DialogDescription>
              Paste any article or video link. It&rsquo;s saved to Later with the text cleaned up
              for reading.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="pl-9"
              aria-label="Link to save"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !url.trim()} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save to Later
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

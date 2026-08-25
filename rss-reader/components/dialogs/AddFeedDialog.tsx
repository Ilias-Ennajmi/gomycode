"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Rss } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { addFeed, useCategories, useFeeds } from "@/lib/hooks/useFeeds";

interface FeedPreview {
  feedUrl: string;
  title: string;
  description?: string;
  siteUrl?: string;
  faviconUrl?: string;
  articleCount: number;
}

interface AddFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddFeedDialog({ open, onOpenChange }: AddFeedDialogProps) {
  const [url, setUrl] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("none");
  const [preview, setPreview] = React.useState<FeedPreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const { categories } = useCategories();
  const { mutate: mutateFeeds } = useFeeds();
  const { mutate: mutateCategories } = useCategories();

  React.useEffect(() => {
    if (!open) {
      setUrl("");
      setCategoryId("none");
      setPreview(null);
      setPreviewError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (!url.trim()) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/feeds/preview?url=${encodeURIComponent(url.trim())}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Could not fetch feed — check URL");
        setPreview(body);
      } catch (error) {
        setPreview(null);
        setPreviewError(error instanceof Error ? error.message : "Could not fetch feed");
      } finally {
        setPreviewLoading(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [url]);

  async function handleSubmit() {
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const feed = await addFeed(url.trim(), categoryId === "none" ? undefined : categoryId);
      toast.success(`Feed added: ${feed.title}`);
      mutateFeeds();
      mutateCategories();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not fetch feed — check URL");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Feed</DialogTitle>
          <DialogDescription>
            Paste an RSS feed URL or a website URL — we&rsquo;ll find the feed for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="feed-url">Feed or site URL</Label>
            <Input
              id="feed-url"
              placeholder="https://example.com/feed.xml"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
            />
          </div>

          <div className="min-h-[76px] rounded-md border bg-muted/40 p-3">
            {previewLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Looking up feed…
              </div>
            )}
            {!previewLoading && previewError && (
              <p className="text-sm text-destructive">{previewError}</p>
            )}
            {!previewLoading && !previewError && preview && (
              <div className="flex items-start gap-3">
                <FeedFavicon title={preview.title} faviconUrl={preview.faviconUrl} size={32} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{preview.title}</p>
                  {preview.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {preview.description}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {preview.articleCount} article{preview.articleCount === 1 ? "" : "s"} found
                  </p>
                </div>
              </div>
            )}
            {!previewLoading && !previewError && !preview && (
              <div className="flex h-full items-center gap-2 text-sm text-muted-foreground">
                <Rss className="h-4 w-4" /> Feed preview will appear here
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Category (optional)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorized</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!url.trim() || submitting}>
            {submitting ? "Adding…" : "Add Feed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

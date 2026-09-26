"use client";

import * as React from "react";
import { toast } from "sonner";
import { EyeOff, Plus, TrendingUp, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedFavicon } from "@/components/shared/FeedFavicon";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { useFilters } from "@/lib/hooks/useFilters";
import type { FeedSummary, FilterRuleSummary } from "@/lib/types";

interface ContentFiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COPY = {
  hide: {
    keywordLabel: "Hide articles containing",
    keywordPlaceholder: "crypto, NFT, sponsored",
    feedLabel: "Mute a feed",
    feedHint: "Muted feeds disappear from All, Today and categories, but you can still open them.",
    empty: "Nothing hidden yet.",
  },
  boost: {
    keywordLabel: "Boost articles containing",
    keywordPlaceholder: "Apple, open source",
    feedLabel: "Boost a feed",
    feedHint: "Boosted articles rise to the top of For You.",
    empty: "Nothing boosted yet.",
  },
} as const;

export function ContentFiltersDialog({ open, onOpenChange }: ContentFiltersDialogProps) {
  const [tab, setTab] = React.useState<"hide" | "boost">("hide");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Content filters</DialogTitle>
          <DialogDescription>
            Hide what you never want to see, and boost what you always do.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "hide" | "boost")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="hide" className="gap-1.5">
              <EyeOff className="h-3.5 w-3.5" /> Hide
            </TabsTrigger>
            <TabsTrigger value="boost" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Boost
            </TabsTrigger>
          </TabsList>
          <TabsContent value="hide">
            <RuleEditor action="hide" />
          </TabsContent>
          <TabsContent value="boost">
            <RuleEditor action="boost" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function RuleEditor({ action }: { action: "hide" | "boost" }) {
  const copy = COPY[action];
  const { rules, addRule, removeRule } = useFilters();
  const { feeds } = useFeeds();
  const [keywords, setKeywords] = React.useState("");
  const [feedId, setFeedId] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const ownRules = rules.filter((r) => r.action === action);
  const feedById = new Map(feeds.map((f) => [f.id, f]));
  const takenFeedIds = new Set(ownRules.filter((r) => r.match === "feed").map((r) => r.value));
  const availableFeeds = feeds.filter((f) => !takenFeedIds.has(f.id));

  async function save(rule: Omit<FilterRuleSummary, "id">, reset: () => void) {
    setSaving(true);
    try {
      await addRule(rule);
      reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save filter");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pt-2">
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (keywords.trim()) {
            save({ action, match: "keyword", value: keywords }, () => setKeywords(""));
          }
        }}
      >
        <Label htmlFor={`${action}-keywords`}>{copy.keywordLabel}</Label>
        <div className="flex gap-2">
          <Input
            id={`${action}-keywords`}
            placeholder={copy.keywordPlaceholder}
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <Button type="submit" size="icon" disabled={!keywords.trim() || saving} aria-label="Add">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Separate several words with commas.</p>
      </form>

      <div className="space-y-1.5">
        <Label>{copy.feedLabel}</Label>
        <div className="flex gap-2">
          <Select value={feedId} onValueChange={setFeedId}>
            <SelectTrigger>
              <SelectValue placeholder={availableFeeds.length ? "Choose a feed" : "No feeds left"} />
            </SelectTrigger>
            <SelectContent>
              {availableFeeds.map((feed) => (
                <SelectItem key={feed.id} value={feed.id}>
                  {feed.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            disabled={!feedId || saving}
            aria-label="Add"
            onClick={() => save({ action, match: "feed", value: feedId }, () => setFeedId(""))}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{copy.feedHint}</p>
      </div>

      <div className="flex min-h-10 flex-wrap gap-2 rounded-lg border bg-muted/30 p-2.5">
        {ownRules.length === 0 ? (
          <p className="self-center px-1 text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          ownRules.map((rule) => (
            <RuleChip
              key={rule.id}
              rule={rule}
              feed={rule.match === "feed" ? feedById.get(rule.value) : undefined}
              onRemove={() =>
                removeRule(rule.id).catch(() => toast.error("Could not delete filter"))
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function RuleChip({
  rule,
  feed,
  onRemove,
}: {
  rule: FilterRuleSummary;
  feed?: FeedSummary;
  onRemove: () => void;
}) {
  const label = rule.match === "feed" ? feed?.title ?? "Deleted feed" : rule.value;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-1 pl-2.5 pr-1 text-sm">
      {rule.match === "feed" && <FeedFavicon title={label} faviconUrl={feed?.faviconUrl} size={14} />}
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

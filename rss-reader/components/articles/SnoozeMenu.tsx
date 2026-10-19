"use client";

import * as React from "react";
import { AlarmClockOff } from "lucide-react";
import { toast } from "sonner";
import { mutate as globalMutate } from "swr";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { snoozeArticle } from "@/lib/hooks/useArticles";
import { Slot } from "@radix-ui/react-slot";
import { ActionSheet, useIsPhone } from "@/components/ui/sheet";
import { formatSnooze, snoozeOptions } from "@/lib/snooze";
import type { ArticleSummary } from "@/lib/types";

function refreshLists() {
  return globalMutate((key) => typeof key === "string" && key.startsWith("/api/articles"));
}

export function isSnoozed(article: Pick<ArticleSummary, "snoozedUntil">) {
  return Boolean(article.snoozedUntil && new Date(article.snoozedUntil).getTime() > Date.now());
}

/** Snooze: hide the article until a chosen time, when it comes back to the top of Later. */
export async function snooze(article: ArticleSummary, until: Date | null) {
  try {
    await snoozeArticle(article.id, until);
    await refreshLists();
    if (until) {
      toast.success(`Snoozed until ${formatSnooze(until)}`, {
        description: "It will come back to Later, with a notification.",
        action: {
          label: "Undo",
          onClick: () => snoozeArticle(article.id, null).then(refreshLists),
        },
      });
    } else {
      toast.success("Back in Later");
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not snooze");
  }
}

export function SnoozeMenu({
  article,
  children,
  align = "end",
}: {
  article: ArticleSummary;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  const snoozed = isSnoozed(article);
  // Computed when the menu opens, so "This evening" is right even hours later.
  const [options, setOptions] = React.useState(() => snoozeOptions());
  const phone = useIsPhone();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  if (phone) {
    return (
      <>
        <Slot
          onClick={(event: React.MouseEvent) => {
            event.stopPropagation();
            setOptions(snoozeOptions());
            setSheetOpen(true);
          }}
        >
          {children}
        </Slot>
        <ActionSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={snoozed ? `Snoozed until ${formatSnooze(article.snoozedUntil!)}` : "Snooze until…"}
          sections={[
            {
              actions: [
                ...options.map((option) => ({
                  id: option.id,
                  label: option.label,
                  hint: formatSnooze(option.until),
                  onSelect: () => void snooze(article, option.until),
                })),
                ...(snoozed
                  ? [
                      {
                        id: "unsnooze",
                        label: "Unsnooze now",
                        icon: <AlarmClockOff />,
                        onSelect: () => void snooze(article, null),
                      },
                    ]
                  : []),
              ],
            },
          ]}
        />
      </>
    );
  }
  return (
    <DropdownMenu onOpenChange={(open) => open && setOptions(snoozeOptions())}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-72" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {snoozed ? `Snoozed until ${formatSnooze(article.snoozedUntil!)}` : "Snooze until…"}
        </DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => snooze(article, option.until)}
            className="justify-between gap-3"
          >
            <span>{option.label}</span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {formatSnooze(option.until)}
            </span>
          </DropdownMenuItem>
        ))}
        {snoozed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => snooze(article, null)} className="gap-2">
              <AlarmClockOff className="h-4 w-4" /> Unsnooze now
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

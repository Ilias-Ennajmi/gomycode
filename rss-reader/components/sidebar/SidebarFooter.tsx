"use client";

import type { DiscoverKind } from "@/lib/discover/catalog";
import * as React from "react";
import dynamic from "next/dynamic";
import {
  Bell,
  Compass,
  Download,
  FolderCog,
  Keyboard,
  Library,
  LogOut,
  Settings,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationSettings } from "@/components/layout/NotificationSettings";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { needingAttention } from "@/lib/feed-health";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n";

const SettingsPanel = dynamic(
  () => import("@/components/layout/SettingsPanel").then((m) => m.SettingsPanel),
  { ssr: false }
);

interface SidebarFooterProps {
  onAddFeed: (kind?: DiscoverKind) => void;
  onManageSources: (attention?: boolean) => void;
  onManageCategories: () => void;
  onContentFilters: () => void;
  onImportOpml: () => void;
  onShowShortcuts: () => void;
}

export function SidebarFooter(props: SidebarFooterProps) {
  const { t } = useT();
  const {
    onAddFeed,
    onManageSources,
    onManageCategories,
    onContentFilters,
    onImportOpml,
    onShowShortcuts,
  } = props;
  const { feeds } = useFeeds();
  const attention = needingAttention(feeds).length;
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  return (
    <div className="space-y-2 border-t p-3 max-md:border-t-0 max-md:pt-0">
      <div className="grid grid-cols-2 gap-1">
        <Button variant="ghost" className="justify-start gap-2 px-2.5" onClick={() => onAddFeed()}>
          <Compass className="h-4 w-4" /> {t("Discover")}
        </Button>
        <Button
          variant="ghost"
          className="justify-start gap-2 px-2.5"
          onClick={() => onManageSources(attention > 0)}
          title={attention > 0 ? `${attention} need attention` : undefined}
        >
          <Library className="h-4 w-4" /> {t("Sources")}
          {attention > 0 && (
            <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              {attention}
            </span>
          )}
        </Button>
      </div>
      <Separator className="hidden md:block" />
      <div className="hidden items-center justify-around md:flex">
        <IconAction label={t("Manage categories")} onClick={onManageCategories}>
          <FolderCog className="h-4 w-4" />
        </IconAction>
        <IconAction label={t("Content filters")} onClick={onContentFilters}>
          <SlidersHorizontal className="h-4 w-4" />
        </IconAction>
        <IconAction label={t("Import OPML")} onClick={onImportOpml}>
          <Upload className="h-4 w-4" />
        </IconAction>
        <IconAction label={t("Export OPML")} onClick={() => window.open("/api/opml", "_blank")}>
          <Download className="h-4 w-4" />
        </IconAction>
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <Bell className="h-4 w-4" />
                  <span className="sr-only">{t("Notifications")}</span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("Notifications")}</TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="start" className="w-80 p-1">
            <NotificationSettings />
          </PopoverContent>
        </Popover>
        <IconAction label={t("Keyboard shortcuts")} onClick={onShowShortcuts}>
          <Keyboard className="h-4 w-4" />
        </IconAction>
        <IconAction label={t("Settings")} onClick={() => setSettingsOpen(true)}>
          <Settings className="h-4 w-4" />
        </IconAction>
        <IconAction label={t("Sign out")} onClick={signOut}>
          <LogOut className="h-4 w-4" />
        </IconAction>
      </div>
      {/* Desktop: the same Settings screen as the phone, in a dialog. */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="h-[min(88vh,820px)] max-w-xl gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">{t("Settings")}</DialogTitle>
          {settingsOpen && <SettingsPanel {...props} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={onClick}
        >
          {children}
          <span className="sr-only">{t(label)}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t(label)}</TooltipContent>
    </Tooltip>
  );
}

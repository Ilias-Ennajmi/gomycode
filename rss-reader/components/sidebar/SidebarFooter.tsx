"use client";

import type { DiscoverKind } from "@/lib/discover/catalog";
import {
  Compass,
  Download,
  FolderCog,
  Keyboard,
  Library,
  LogOut,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

interface SidebarFooterProps {
  onAddFeed: (kind?: DiscoverKind) => void;
  onManageSources: () => void;
  onManageCategories: () => void;
  onContentFilters: () => void;
  onImportOpml: () => void;
  onShowShortcuts: () => void;
}

export function SidebarFooter({
  onAddFeed,
  onManageSources,
  onManageCategories,
  onContentFilters,
  onImportOpml,
  onShowShortcuts,
}: SidebarFooterProps) {
  return (
    <div className="space-y-2 border-t p-3 max-md:border-t-0 max-md:pt-0">
      <div className="grid grid-cols-2 gap-1">
        <Button variant="ghost" className="justify-start gap-2 px-2.5" onClick={() => onAddFeed()}>
          <Compass className="h-4 w-4" /> Discover
        </Button>
        <Button variant="ghost" className="justify-start gap-2 px-2.5" onClick={onManageSources}>
          <Library className="h-4 w-4" /> Sources
        </Button>
      </div>
      <Separator className="hidden md:block" />
      <div className="hidden items-center justify-around md:flex">
        <IconAction label="Manage categories" onClick={onManageCategories}>
          <FolderCog className="h-4 w-4" />
        </IconAction>
        <IconAction label="Content filters" onClick={onContentFilters}>
          <SlidersHorizontal className="h-4 w-4" />
        </IconAction>
        <IconAction label="Import OPML" onClick={onImportOpml}>
          <Upload className="h-4 w-4" />
        </IconAction>
        <IconAction label="Export OPML" onClick={() => window.open("/api/opml", "_blank")}>
          <Download className="h-4 w-4" />
        </IconAction>
        <IconAction label="Keyboard shortcuts" onClick={onShowShortcuts}>
          <Keyboard className="h-4 w-4" />
        </IconAction>
        <IconAction label="Sign out" onClick={signOut}>
          <LogOut className="h-4 w-4" />
        </IconAction>
      </div>
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
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

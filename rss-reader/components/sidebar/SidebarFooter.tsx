"use client";

import {
  Compass,
  Download,
  FolderCog,
  Keyboard,
  LogOut,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

interface SidebarFooterProps {
  onAddFeed: () => void;
  onManageCategories: () => void;
  onContentFilters: () => void;
  onImportOpml: () => void;
  onShowShortcuts: () => void;
}

export function SidebarFooter({
  onAddFeed,
  onManageCategories,
  onContentFilters,
  onImportOpml,
  onShowShortcuts,
}: SidebarFooterProps) {
  return (
    <div className="space-y-2 border-t p-3 max-md:border-t-0 max-md:pt-0">
      <Button variant="ghost" className="w-full justify-start gap-2" onClick={onAddFeed}>
        <Compass className="h-4 w-4" /> Discover sources
      </Button>
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

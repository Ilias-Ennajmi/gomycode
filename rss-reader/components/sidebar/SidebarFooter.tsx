"use client";

import { Download, FolderCog, Keyboard, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

interface SidebarFooterProps {
  onAddFeed: () => void;
  onManageCategories: () => void;
  onImportOpml: () => void;
  onShowShortcuts: () => void;
}

export function SidebarFooter({
  onAddFeed,
  onManageCategories,
  onImportOpml,
  onShowShortcuts,
}: SidebarFooterProps) {
  return (
    <div className="space-y-2 border-t p-3">
      <Button variant="ghost" className="w-full justify-start gap-2" onClick={onAddFeed}>
        <Plus className="h-4 w-4" /> Add Feed
      </Button>
      <Separator />
      <div className="flex items-center justify-around">
        <IconAction label="Manage categories" onClick={onManageCategories}>
          <FolderCog className="h-4 w-4" />
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
      </div>
    </div>
  );
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
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onClick}>
          {children}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

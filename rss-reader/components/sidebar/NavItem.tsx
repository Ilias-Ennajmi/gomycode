"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}

export function NavItem({ icon, label, count, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-accent font-medium text-accent-foreground"
          : "text-foreground/80 hover:bg-accent/60 hover:text-foreground"
      )}
    >
      <span className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {!!count && (
        <Badge
          variant="secondary"
          className="h-5 min-w-5 justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary"
        >
          {count > 99 ? "99+" : count}
        </Badge>
      )}
    </button>
  );
}

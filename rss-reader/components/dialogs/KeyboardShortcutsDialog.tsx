"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: Array<[string, string]> = [
  ["j", "Next article"],
  ["k", "Previous article"],
  ["o / Enter", "Open article in reader"],
  ["v", "Open original in new tab"],
  ["s / b", "Toggle save / bookmark"],
  ["m", "Toggle read / unread"],
  ["r", "Refresh feeds"],
  ["?", "Show shortcuts help"],
  ["/", "Focus search"],
  ["Esc", "Close dialog / deselect"],
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Move fast without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-1.5">
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {key}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  createCategory,
  deleteCategory,
  updateCategory,
  useCategories,
} from "@/lib/hooks/useFeeds";
import { cn } from "@/lib/utils";
import type { CategorySummary } from "@/lib/types";

const PRESET_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
];

interface ManageCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageCategoriesDialog({ open, onOpenChange }: ManageCategoriesDialogProps) {
  const { categories, mutate } = useCategories();
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CategorySummary | null>(null);
  const dragIndex = React.useRef<number | null>(null);
  const [localOrder, setLocalOrder] = React.useState<CategorySummary[]>([]);

  React.useEffect(() => {
    setLocalOrder(categories);
  }, [categories]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createCategory(newName.trim(), PRESET_COLORS[categories.length % PRESET_COLORS.length]);
      setNewName("");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create category");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(category: CategorySummary, name: string) {
    if (!name.trim() || name.trim() === category.name) return;
    try {
      await updateCategory(category.id, { name: name.trim() });
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename category");
    }
  }

  async function handleColorChange(category: CategorySummary, color: string) {
    try {
      await updateCategory(category.id, { color });
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update color");
    }
  }

  async function handleDelete(category: CategorySummary) {
    try {
      await deleteCategory(category.id);
      toast.success(`Deleted ${category.name}`);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete category");
    }
  }

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragOver(index: number, e: React.DragEvent) {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    setLocalOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex.current!, 1);
      next.splice(index, 0, moved);
      dragIndex.current = index;
      return next;
    });
  }

  async function handleDragEnd() {
    dragIndex.current = null;
    try {
      await Promise.all(
        localOrder.map((category, index) => updateCategory(category.id, { order: index }))
      );
      mutate();
    } catch {
      toast.error("Could not save new order");
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Rename, recolor, reorder, or delete your categories.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            {localOrder.map((category, index) => (
              <div
                key={category.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(index, e)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-2 rounded-md border bg-background p-2"
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                <ColorPicker
                  color={category.color}
                  onChange={(color) => handleColorChange(category, color)}
                />
                <InlineRename
                  value={category.name}
                  onCommit={(name) => handleRename(category, name)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(category)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {localOrder.length === 0 && (
              <p className="py-2 text-center text-sm text-muted-foreground">
                No categories yet.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              placeholder="New category name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={!newName.trim() || creating} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name}?`}
        description="Feeds in this category will become uncategorized."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) return handleDelete(deleteTarget);
        }}
      />
    </>
  );
}

function InlineRename({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => setDraft(value), [value]);

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setEditing(false);
            onCommit(draft);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-7 flex-1"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex-1 truncate rounded px-1.5 py-1 text-left text-sm hover:bg-accent"
    >
      {value}
    </button>
  );
}

function ColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-5 w-5 rounded-full ring-2 ring-offset-2 ring-offset-background"
        style={{ backgroundColor: color, boxShadow: `0 0 0 2px ${color}33` }}
        aria-label="Choose color"
      />
      {open && (
        <div className="absolute left-0 top-7 z-20 flex gap-1.5 rounded-md border bg-popover p-2 shadow-md">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                onChange(preset);
                setOpen(false);
              }}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full",
                preset === color && "ring-2 ring-foreground"
              )}
              style={{ backgroundColor: preset }}
              aria-label={preset}
            >
              {preset === color && <Check className="h-3 w-3 text-white" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCategories, useFeeds } from "@/lib/hooks/useFeeds";

interface ImportOpmlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportOpmlDialog({ open, onOpenChange }: ImportOpmlDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { mutate: mutateFeeds } = useFeeds();
  const { mutate: mutateCategories } = useCategories();

  React.useEffect(() => {
    if (!open) setFile(null);
  }, [open]);

  function handleFiles(files: FileList | null) {
    const picked = files?.[0];
    if (picked && (picked.name.endsWith(".opml") || picked.name.endsWith(".xml"))) {
      setFile(picked);
    } else if (picked) {
      toast.error("Please choose a .opml file");
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/opml", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not import OPML file");

      toast.success(`Imported ${body.imported} feed${body.imported === 1 ? "" : "s"}`);
      if (body.errors?.length) {
        toast.error(`${body.errors.length} feed(s) failed to import`);
      }
      mutateFeeds();
      mutateCategories();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import OPML file");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import OPML</DialogTitle>
          <DialogDescription>
            Bulk-add feeds from an OPML export of another RSS reader.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            dragging ? "border-primary bg-accent/50" : "border-border hover:bg-accent/30"
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          {file ? (
            <p className="text-sm font-medium">{file.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium">Drop your .opml file here</p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".opml,.xml"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!file || importing}>
            {importing ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Importing…
              </>
            ) : (
              "Import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

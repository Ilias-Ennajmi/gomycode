"use client";

import * as React from "react";
import { Check, Copy, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReaderState } from "@/lib/hooks/useReaderState";

interface EmailNewsletterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Newsletters that only come by email: name one, get an address to sign up with, and its
 * issues land in Newsletters → Email.
 */
export function EmailNewsletterDialog({ open, onOpenChange }: EmailNewsletterDialogProps) {
  const { setView, setNewsletterKind } = useReaderState();
  const { mutate } = useSWRConfig();
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<{ title: string; email: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setCreated(null);
    setCopied(false);
  }, [open]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/newsletters/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't create an address");
      setCreated({ title: body.feed.title, email: body.feed.email });
      mutate((key) => typeof key === "string" && key.startsWith("/api/feeds"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create an address");
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created.email);
    setCopied(true);
    toast.success("Address copied");
  }

  function done() {
    onOpenChange(false);
    setView({ type: "newsletters", label: "Newsletters" });
    setNewsletterKind("email");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {!created ? (
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" /> Email newsletter
              </DialogTitle>
              <DialogDescription>
                For newsletters that only come by email. You get an address to sign up with, and
                every issue shows up in Newsletters → Email.
              </DialogDescription>
            </DialogHeader>
            <label className="mt-4 block text-sm font-medium" htmlFor="newsletter-name">
              Newsletter name
            </label>
            <Input
              id="newsletter-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Morning Brew"
              className="mt-1.5"
              autoFocus
              maxLength={120}
            />
            <DialogFooter className="mt-5">
              <Button type="submit" disabled={creating || !name.trim()} className="gap-1.5">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create address
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div>
            <DialogHeader>
              <DialogTitle>Sign up with this address</DialogTitle>
              <DialogDescription>
                Use it on {created.title}&rsquo;s sign-up page instead of your own email.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex items-center gap-2 rounded-xl border bg-muted/50 p-2 pl-3">
              <code className="min-w-0 flex-1 break-all text-sm">{created.email}</code>
              <Button
                size="sm"
                variant={copied ? "secondary" : "default"}
                onClick={copy}
                className="shrink-0 gap-1.5"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Paste the address in the newsletter&rsquo;s sign-up form.</li>
              <li>
                Its confirmation email arrives in Newsletters → Email within the hour (or tap
                refresh). Open it and tap the confirm link.
              </li>
              <li>New issues then arrive there on their own.</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              The address is from Kill the Newsletter, a free service that turns emails into a feed.
              You can copy it again from the newsletter&rsquo;s menu in the sources list.
            </p>
            <DialogFooter className="mt-5">
              <Button onClick={done}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

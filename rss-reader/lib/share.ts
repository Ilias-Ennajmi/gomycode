import { toast } from "sonner";

/** Native share sheet where available (mobile), clipboard otherwise. */
export async function shareLink(title: string, url: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch {
      // user cancelled or share failed — fall back to clipboard
    }
  }
  await navigator.clipboard.writeText(url);
  toast.success("Link copied to clipboard");
}

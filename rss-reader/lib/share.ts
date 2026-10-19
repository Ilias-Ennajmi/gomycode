import { toast } from "sonner";
import { cleanLink } from "@/lib/links";

/** Native share sheet where available (mobile), clipboard otherwise. Tracking parameters are dropped. */
export async function shareLink(title: string, url: string) {
  const link = cleanLink(url);
  if (navigator.share) {
    try {
      await navigator.share({ title, url: link });
      return;
    } catch {
      // user cancelled or share failed — fall back to clipboard
    }
  }
  await navigator.clipboard.writeText(link);
  toast.success("Link copied to clipboard");
}

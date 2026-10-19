"use client";

import * as React from "react";
import { toast } from "sonner";
import { Languages, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const TRANSLATE_LANGUAGES: { id: string; label: string }[] = [
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
  { id: "ar", label: "العربية" },
  { id: "es", label: "Español" },
  { id: "de", label: "Deutsch" },
];

const LAST_KEY = "translate-to";

/** The article in another language, kept once made. Returns the translated HTML. */
export async function fetchTranslation(articleId: string, to: string) {
  const res = await fetch(`/api/articles/${articleId}/translate?to=${to}`, { method: "POST" });
  const body = (await res.json()) as { html?: string; error?: string };
  if (!res.ok || !body.html) throw new Error(body.error || "Couldn't translate this article");
  return body.html;
}

/** Keeps the translation of the open article (if any), and which language it's in. */
export function useTranslation(articleId: string | null) {
  const [state, setState] = React.useState<{ id: string; to: string; html: string } | null>(null);
  const [loading, setLoading] = React.useState<string | null>(null);
  const current = state && state.id === articleId ? state : null;

  const translate = React.useCallback(
    async (to: string) => {
      if (!articleId) return;
      setLoading(to);
      try {
        const html = await fetchTranslation(articleId, to);
        setState({ id: articleId, to, html });
        try {
          localStorage.setItem(LAST_KEY, to);
        } catch {
          // Fine.
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't translate this article");
      } finally {
        setLoading(null);
      }
    },
    [articleId]
  );
  const original = React.useCallback(() => setState(null), []);
  return { translation: current, loading, translate, original };
}

export function TranslateMenu({
  translation,
  loading,
  onTranslate,
  onOriginal,
  className,
}: {
  translation: { to: string } | null;
  loading: string | null;
  onTranslate: (to: string) => void;
  onOriginal: () => void;
  className?: string;
}) {
  const [last, setLast] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setLast(localStorage.getItem(LAST_KEY));
    } catch {
      // Fine.
    }
  }, []);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-10 w-10", translation && "text-primary", className)}
          aria-label="Translate"
          title="Translate"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Languages className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Read in</DropdownMenuLabel>
        {TRANSLATE_LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.id}
            onSelect={() => onTranslate(language.id)}
            className={cn(
              "justify-between",
              translation?.to === language.id && "font-semibold text-primary"
            )}
          >
            {language.label}
            {last === language.id && !translation && (
              <span className="text-[10px] text-muted-foreground">last</span>
            )}
          </DropdownMenuItem>
        ))}
        {translation && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOriginal}>Original</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ExternalLink } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { SPACE_BG } from "@/components/ui/space";
import { Logo } from "@/components/brand/Logo";
import { Illustration } from "@/components/brand/Illustration";
import { parseCollection, type Collection } from "@/lib/collection";
import { PLATFORM_LABEL } from "@/lib/links";
import { getPublicClient } from "@/lib/supabase/public";

/*
 * A shared collection: read-only, public, no identity. The page reads through
 * stash.get_collection(slug) with the public key (no service key anywhere),
 * which only answers for a live collection link and only returns share-safe
 * fields. Thumbnails are signed for an hour through a Storage policy that only
 * covers saves inside a shared collection.
 */

const load = cache(async (slug: string): Promise<{ collection: Collection; thumbs: Record<string, string> } | null> => {
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(slug)) return null;
  const supabase = getPublicClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_collection", { p_slug: slug });
  if (error) return null;
  const collection = parseCollection(data);
  if (!collection) return null;
  const paths = collection.saves.map((s) => s.thumbPath).filter((p): p is string => Boolean(p));
  const thumbs: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("stash-thumbs").createSignedUrls(paths, 3600);
    for (const row of signed ?? []) if (row.path && row.signedUrl) thumbs[row.path] = row.signedUrl;
  }
  return { collection, thumbs };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  await connection();
  const found = await load(slug);
  return {
    title: found ? found.collection.name : "Shared collection",
    robots: { index: false, follow: false },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await connection();
  const found = await load(slug);
  if (!found) notFound();
  const { collection: c, thumbs } = found;

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pb-safe pt-safe">
      <div className="flex items-center justify-between pt-6 pb-4">
        <Logo variant="lockup" size={28} title="Stash" />
        <span className="text-caption text-fg-muted">Shared collection · read-only</span>
      </div>
      <header className={cx("mb-6 flex flex-col gap-3 rounded-xl p-6 text-on-space", SPACE_BG[c.color])}>
        <span className="inline-flex h-8 items-center gap-2 self-start rounded-full border-2 border-on-space/30 px-3 text-label">
          {c.kind === "project" ? "Project" : "Topic"} · {c.saves.length} {c.saves.length === 1 ? "save" : "saves"}
        </span>
        <h1 className="text-display">{c.name}</h1>
        {c.description && <p className="text-body">{c.description}</p>}
      </header>

      {c.saves.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Illustration name="empty" />
          <p className="text-body text-fg-muted">Nothing in this collection yet.</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {c.saves.map((s) => {
            const thumb = s.thumbPath ? thumbs[s.thumbPath] : undefined;
            const who = [s.creator && `@${s.creator.replace(/^@/, "")}`, PLATFORM_LABEL[s.platform]].filter(Boolean).join(" · ");
            return (
              <li key={s.key} className="relative flex gap-4 overflow-hidden rounded-lg bg-surface p-3 shadow-pop">
                <span aria-hidden className={cx("absolute inset-x-0 top-0 h-[var(--edge)]", SPACE_BG[c.color])} />
                <div className="relative aspect-9/16 w-24 shrink-0 overflow-hidden rounded-card bg-raised">
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL
                    <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {s.applied && (
                    <span className="self-start rounded-full bg-fg px-3 py-0.5 text-caption text-background">Applied</span>
                  )}
                  {s.title && <h2 className="font-display text-heading text-fg">{s.title}</h2>}
                  {s.keyIdea && <p className="text-body text-fg">{s.keyIdea}</p>}
                  {s.takeaways.length > 0 && (
                    <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-fg-muted">
                      {s.takeaways.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="truncate text-caption text-fg-muted">{who}</span>
                    {s.sourceUrl && (
                      <a
                        href={s.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="flex h-12 shrink-0 items-center gap-1 rounded-full bg-raised px-4 text-label text-fg"
                      >
                        Open <ExternalLink size={20} strokeWidth={2} aria-hidden />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <footer className="flex flex-col items-center gap-2 py-10 text-center text-caption text-fg-muted">
        <Logo variant="tile" size={32} />
        Shared from Stash: save reels, watch them, use them.
      </footer>
    </main>
  );
}

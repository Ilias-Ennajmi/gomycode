import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// A published collection: a read-only page anyone with the link can open (the middleware
// lets /c/ through). Titles link to the originals; nothing here needs a sign-in.

async function load(slug: string) {
  return prisma.collection.findUnique({
    where: { slug },
    include: {
      items: {
        orderBy: { addedAt: "desc" },
        include: {
          article: {
            select: {
              id: true,
              title: true,
              link: true,
              summary: true,
              imageUrl: true,
              author: true,
              publishedAt: true,
              feed: { select: { title: true, faviconUrl: true } },
            },
          },
        },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const collection = await load(params.slug);
  if (!collection) return { title: "Collection" };
  return {
    title: `${collection.name} · a Reader collection`,
    description: collection.description ?? `${collection.items.length} articles`,
    robots: { index: false },
  };
}

function excerpt(text: string | null, max = 180) {
  if (!text) return "";
  const plain = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max).replace(/\s+\S*$/, "")}…` : plain;
}

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const collection = await load(params.slug);
  if (!collection) notFound();
  const dates = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-10 text-foreground">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          A collection · {collection.items.length} article{collection.items.length === 1 ? "" : "s"}
        </p>
        <h1 className="mt-2 text-balance font-serif text-4xl font-semibold leading-tight tracking-tight">
          {collection.name}
        </h1>
        {collection.description && (
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {collection.description}
          </p>
        )}
      </header>
      <ol className="space-y-6">
        {collection.items.map(({ article }) => (
          <li key={article.id} className="flex gap-4">
            {article.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={article.imageUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-20 w-24 shrink-0 rounded-xl object-cover"
              />
            )}
            <div className="min-w-0">
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-semibold leading-snug hover:underline"
              >
                {article.title}
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                {[article.feed.title, article.author, dates.format(article.publishedAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {article.summary && (
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {excerpt(article.summary)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <footer className="mt-12 border-t pt-4 text-xs text-muted-foreground">
        Shared from Reader.
      </footer>
    </main>
  );
}

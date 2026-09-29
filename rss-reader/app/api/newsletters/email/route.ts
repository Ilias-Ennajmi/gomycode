import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEmailInbox } from "@/lib/newsletters";
import { fetchAndParseFeed } from "@/lib/rss";
import { insertNewArticles } from "@/lib/ingest";

export const maxDuration = 30;

/**
 * A new email newsletter: an address to sign up with, whose emails land in
 * Newsletters → Email (through a Kill the Newsletter feed, checked on every refresh).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) {
    return NextResponse.json({ error: "Give the newsletter a name" }, { status: 400 });
  }
  const categoryId = typeof body.categoryId === "string" ? body.categoryId : null;

  let inbox;
  try {
    inbox = await createEmailInbox(title);
  } catch (error) {
    console.error("Creating an email inbox failed", error);
    return NextResponse.json(
      { error: "Couldn't create an address right now. Try again in a minute." },
      { status: 502 }
    );
  }

  const feed = await prisma.feed.create({
    data: {
      type: "newsletter",
      platform: "email",
      email: inbox.email,
      title,
      url: inbox.feedUrl,
      description: "Email newsletter",
      categoryId,
      lastFetched: new Date(),
    },
  });

  // Usually empty until the first email; fine either way.
  await fetchAndParseFeed(inbox.feedUrl)
    .then((parsed) => insertNewArticles(feed.id, parsed.articles))
    .catch(() => undefined);

  return NextResponse.json({ feed: { id: feed.id, title: feed.title, email: feed.email } });
}

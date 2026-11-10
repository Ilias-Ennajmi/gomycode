// A known world for end-to-end tests: two sites, a news outlet, a YouTube channel and a
// podcast, with read and unread articles, saved ones, an episode half-listened, one with a
// sponsor chapter and one with a transcript. Wipes the database first, so it refuses to run
// anywhere but a local one.
//   DATABASE_URL=postgresql://…@localhost/… npx tsx e2e/seed.ts
import { PrismaClient } from "@prisma/client";

const FIXTURES = process.env.FIXTURES_URL ?? "http://localhost:3101";

export const IDS = {
  sleep: "e2e-episode-sleep",
  sponsor: "e2e-episode-sponsor",
  video: "e2e-video-long",
  noCors: "e2e-episode-nocors",
};

function assertLocal(url: string | undefined) {
  if (!url || !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
    throw new Error("e2e/seed.ts only runs against a local database (it deletes everything)");
  }
}

const ago = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

export async function seed() {
  assertLocal(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = current_schema() and tablename <> '_prisma_migrations'`;
    if (tables.length) {
      await prisma.$executeRawUnsafe(
        `truncate ${tables.map((t) => `"${t.tablename}"`).join(", ")} cascade`
      );
    }

    const design = await prisma.category.create({ data: { name: "UX Design", order: 0 } });
    const marketing = await prisma.category.create({ data: { name: "Marketing", order: 1 } });

    const feed = (data: {
      title: string;
      slug: string;
      type?: "rss" | "youtube" | "podcast" | "newsletter";
      categoryId?: string;
      newsDesk?: string;
    }) =>
      prisma.feed.create({
        data: {
          title: data.title,
          type: data.type ?? "rss",
          url:
            data.type === "podcast"
              ? `${FIXTURES}/podcast/${data.slug}.xml`
              : `${FIXTURES}/feed/${data.slug}.xml`,
          siteUrl: `${FIXTURES}/`,
          categoryId: data.categoryId,
          newsDesk: data.newsDesk,
          language: "en",
          // Fresh: nothing tries to refresh them during a test.
          lastFetched: new Date(),
        },
      });

    const ux = await feed({ title: "UX Collective", slug: "ux", categoryId: design.id });
    const weekly = await feed({
      title: "Marketing Weekly",
      slug: "weekly",
      categoryId: marketing.id,
    });
    const verge = await feed({ title: "The Verge", slug: "verge", newsDesk: "tech" });
    const channel = await feed({ title: "Test Channel", slug: "channel", type: "youtube" });
    const show = await feed({ title: "Test Lab Podcast", slug: "lab", type: "podcast" });

    const titles: Array<[string, string]> = [
      [ux.id, "Why your onboarding flow loses 40% of users"],
      [weekly.id, "Brand voice: a practical guide"],
      [ux.id, "Design systems that scale"],
      [weekly.id, "What nobody tells you about retention"],
      [ux.id, "Typography on small screens"],
      [weekly.id, "A better way to run experiments"],
      [ux.id, "The case for fewer settings"],
      [weekly.id, "Pricing pages that convert"],
      [ux.id, "Motion that explains"],
      [weekly.id, "Newsletters people open"],
    ];
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < titles.length; i++) {
        const [feedId, title] = titles[i];
        const n = round * titles.length + i + 1;
        await prisma.article.create({
          data: {
            feedId,
            title: `${title} (${n})`,
            link: `${FIXTURES}/article/${n}`,
            summary: "A short summary of the article so the card has a line of context.",
            content:
              `<p>${"A paragraph of the article body, long enough to read. ".repeat(12)}</p>`.repeat(
                4
              ),
            publishedAt: ago(n * 5),
            isRead: n % 4 === 0,
            isSaved: n % 5 === 0,
            savedAt: n % 5 === 0 ? ago(n) : null,
          },
        });
      }
    }
    for (let n = 1; n <= 4; n++) {
      await prisma.article.create({
        data: {
          feedId: verge.id,
          title: `The new chip that changes laptops (${n})`,
          link: `${FIXTURES}/news/${n}`,
          summary: "A news story.",
          imageUrl: `${FIXTURES}/art.png`,
          publishedAt: ago(n * 3),
        },
      });
    }

    await prisma.article.create({
      data: {
        id: IDS.video,
        feedId: channel.id,
        // As DeArrow left it: the plain title shown, the creator's kept.
        title: "A long video",
        altTitle: "A long video",
        originalTitle: "You WON'T BELIEVE this video",
        brandingAt: ago(1),
        link: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        isVideo: true,
        durationSeconds: 900,
        publishedAt: ago(20),
        transcript: [
          { t: 0, text: "Welcome to the channel." },
          { t: 10, text: "Today a tiny tip about focus." },
        ],
      },
    });
    await prisma.highlight.create({
      data: { articleId: IDS.video, text: "Focus is a muscle you train.", note: "Try it daily" },
    });

    const episode = (data: {
      id: string;
      title: string;
      seconds: number;
      hoursAgo: number;
      watched?: number;
      /** Served without CORS headers, like a show that doesn't allow sound effects. */
      plain?: boolean;
      chapters?: { t: number; title: string }[];
      transcript?: { t: number; text: string }[];
    }) =>
      prisma.article.create({
        data: {
          id: data.id,
          feedId: show.id,
          title: data.title,
          link: `${FIXTURES}/episode/${data.id}`,
          summary: `Notes for ${data.title}.`,
          publishedAt: ago(data.hoursAgo),
          audioUrl: `${FIXTURES}/${data.plain ? "audio-plain" : "audio"}/${data.seconds}.wav`,
          audioType: "audio/wav",
          durationSeconds: data.seconds,
          watchedSeconds: data.watched ?? null,
          chapters: data.chapters ?? undefined,
          transcript: data.transcript ?? undefined,
          imageUrl: `${FIXTURES}/art.png`,
        },
      });
    await episode({
      id: IDS.noCors,
      title: "A show without CORS",
      seconds: 240,
      hoursAgo: 40,
      plain: true,
    });
    await episode({
      id: IDS.sleep,
      title: "The Science of Sleep",
      seconds: 360,
      hoursAgo: 30,
      watched: 40,
      chapters: [
        { t: 0, title: "Welcome" },
        { t: 20, title: "Why deep sleep matters" },
        { t: 45, title: "Morning light" },
      ],
      transcript: [
        {
          t: 0,
          text: "Welcome to the show. Today we talk about sleep and why it matters for memory.",
        },
        {
          t: 20,
          text: "Deep sleep is when the brain files the day away, and caffeine after noon delays it.",
        },
        {
          t: 45,
          text: "The second thing is light: morning sunlight sets the clock for the whole day.",
        },
      ],
    });
    await episode({
      id: IDS.sponsor,
      title: "Essentials: Manage Stress",
      seconds: 240,
      hoursAgo: 50,
      watched: 30,
      chapters: [
        { t: 0, title: "Introduction" },
        { t: 30, title: "First topic" },
        { t: 65, title: "Sponsor: Example" },
        { t: 100, title: "Second topic & wrap-up" },
      ],
    });
    await episode({ id: "e2e-episode-plain", title: "A plain episode", seconds: 60, hoursAgo: 70 });

    return { feeds: 5 };
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  seed()
    .then(() => console.log("seeded"))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

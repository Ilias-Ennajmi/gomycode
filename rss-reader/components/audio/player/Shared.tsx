"use client";

export function chapterAt(chapters: { t: number; title: string }[], seconds: number) {
  let title = "";
  for (const chapter of chapters) if (chapter.t <= seconds + 0.5) title = chapter.title;
  return title;
}

export function Empty({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

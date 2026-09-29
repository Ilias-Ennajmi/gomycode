import { ShareSave } from "./ShareSave";

// Target of "Share → Reader" on Android (manifest share_target and the app's SEND intent).
// Apps put the link in `url`, or only in `text` next to a headline, so both are checked.
export default function SharePage({
  searchParams,
}: {
  searchParams: { url?: string; text?: string; title?: string };
}) {
  const link = findLink(searchParams.url) ?? findLink(searchParams.text);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <ShareSave link={link} title={searchParams.title} />
    </main>
  );
}

function findLink(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[).,;!?]+$/, "") : null;
}

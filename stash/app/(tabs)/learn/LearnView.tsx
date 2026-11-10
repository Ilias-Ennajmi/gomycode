"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, Hash } from "lucide-react";
import { LearnHighlights } from "@/components/learn/LearnHighlights";
import { AiLabel } from "@/components/ui/AiLabel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, SPACE_TINT } from "@/components/ui/space";
import { PageHeader } from "@/components/shell/PageHeader";
import { RecallCard } from "@/components/learn/RecallCard";
import { ContextCheck } from "@/components/reminders/ContextCheck";
import { useLoop } from "@/lib/hooks/useLoop";
import { gradeCard, type Review } from "@/lib/loop";
import { DAILY_CAP, VERDICT_GRADE, VERDICT_LABEL, sm2, type Verdict } from "@/lib/sm2";

function nextIn(days: number): string {
  if (days <= 1) return "tomorrow";
  if (days < 30) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

export function LearnView() {
  const router = useRouter();
  const { toast } = useToast();
  const loop = useLoop();
  const { lib } = loop;

  const savesById = useMemo(() => new Map(lib.saves.map((s) => [s.id, s])), [lib.saves]);
  const spacesById = useMemo(() => new Map(lib.spaces.map((s) => [s.id, s])), [lib.spaces]);
  const deck = loop.dueCards;
  const card = deck[0];
  const save = card ? savesById.get(card.saveId) : undefined;
  const space = save?.spaceId ? spacesById.get(save.spaceId) : undefined;
  const keptCount = lib.saves.filter((s) => s.kept).length;
  const doneToday = loop.answeredToday;

  const leave = (cardId: string, review: Review) => {
    // Answered cards leave the deck at once (optimistic); the daily cap counts them.
    loop.setCards((prev) => prev.filter((c) => c.id !== cardId));
    loop.setReviews((prev) => [review, ...prev]);
  };

  const selfGrade = (verdict: Verdict) => {
    if (!card) return;
    const grade = VERDICT_GRADE[verdict];
    const now = new Date();
    const next = sm2(card, grade, now);
    leave(card.id, { cardId: card.id, answeredAt: now.toISOString(), grade, text: null, feedback: null });
    toast({ message: `${VERDICT_LABEL[verdict]} · back ${nextIn(next.intervalDays)}` });
    void gradeCard(card, grade, now).catch(() => toast({ message: "Couldn't save that grade. It'll ask again." }));
  };

  const loading = !loop.loaded || (lib.loading && lib.saves.length === 0);

  return (
    <>
      <ContextCheck rule="learn_open" />
      <PageHeader
        title="Learn"
        trailing={
          loop.streak > 0 ? (
            <span className="mb-1 flex h-10 items-center gap-1 rounded-full bg-fg px-3 text-label text-background" aria-label={`${loop.streak}-day streak`}>
              <Flame size={20} strokeWidth={2.25} aria-hidden /> {loop.streak}
            </span>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-8 px-4 pb-6">
        <section aria-label="Recall" className="flex flex-col gap-3">
          {loading ? (
            <Skeleton shape="block" className="h-72 rounded-xl" />
          ) : card ? (
            <RecallCard
              key={card.id}
              card={card}
              position={doneToday + 1}
              total={Math.min(DAILY_CAP, doneToday + deck.length)}
              spaceName={space?.name}
              color={space?.color ?? "inbox"}
              onSelfGrade={selfGrade}
              onGraded={() => {}}
              onNext={() => leave(card.id, { cardId: card.id, answeredAt: new Date().toISOString(), grade: null, text: null, feedback: null })}
            />
          ) : keptCount === 0 && doneToday === 0 ? (
            <EmptyState
              illustration="learn"
              title="Nothing to recall yet"
              message="Keep a video by swiping right in Play. A few days later its recall cards show up here."
              actionLabel="Open Play"
              onAction={() => router.push("/play?queue=today")}
            />
          ) : (
            <EmptyState
              illustration="done"
              title={doneToday > 0 ? "All caught up" : "Nothing due right now"}
              message={
                doneToday >= DAILY_CAP
                  ? `That's ${DAILY_CAP} for today. The rest wait for tomorrow.`
                  : doneToday > 0
                    ? `${doneToday} answered today. Nice work.`
                    : "Kept saves come back here a few days after you keep them."
              }
              className="rounded-xl bg-surface py-6 shadow-pop"
            />
          )}
        </section>

        <section id="syntheses" aria-labelledby="syntheses-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="syntheses-title" className="text-title">
            Syntheses
          </h2>
          {loop.syntheses.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed border-line p-4 text-body text-fg-muted">
              When a Space or a topic gathers 5 saves, the AI reads them together and shows what they agree on here.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {loop.syntheses.map((s) => {
                const sp = s.spaceId ? spacesById.get(s.spaceId) : undefined;
                const firstDisagreeing = s.disagreements[0]?.saveIds[0];
                const disagreeCount = new Set(s.disagreements.flatMap((d) => d.saveIds)).size;
                return (
                  <li key={s.id}>
                    <article className={cx("flex flex-col gap-3 rounded-xl p-5 text-fg", SPACE_TINT[sp?.color ?? "inbox"])}>
                      <div className="flex items-center justify-between gap-2">
                        <AiLabel text="Synthesis" />
                        <span className="text-caption text-fg-muted">{s.saveCount} saves</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {sp && (
                          <span className="flex items-center gap-2 text-caption text-fg-muted">
                            <span aria-hidden className={cx("h-2 w-2 rounded-full", SPACE_BG[sp.color])} />
                            {sp.name}
                          </span>
                        )}
                        {!sp && s.tag && (
                          // A topic synthesis: across Spaces, for every save tagged with it.
                          <Link href={`/library?c=${encodeURIComponent(`tag:${s.tag.toLowerCase()}`)}`} className="press -my-2 flex min-h-12 items-center gap-1.5 self-start text-label text-fg underline">
                            <Hash size={16} strokeWidth={2.25} aria-hidden />
                            {s.tag} · topic
                          </Link>
                        )}
                        {s.topic && <h3 className="text-heading">{s.topic}</h3>}
                      </div>
                      <ol className="flex flex-col gap-2">
                        {s.points.map((p, i) => (
                          <li key={i} className="flex items-start gap-3 text-body">
                            <span aria-hidden className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-caption text-on-space", SPACE_BG[sp?.color ?? "inbox"])}>
                              {i + 1}
                            </span>
                            {p}
                          </li>
                        ))}
                      </ol>
                      {s.suggestedAction && (
                        <p className="rounded-lg bg-surface p-3 text-body">
                          <span className="text-label">Try · </span>
                          {s.suggestedAction}
                        </p>
                      )}
                      {firstDisagreeing && (
                        <Link href={`/item/${firstDisagreeing}`} className="press inline-flex h-12 items-center self-start rounded-full bg-fg px-4 text-label text-background">
                          {disagreeCount} {disagreeCount === 1 ? "save disagrees" : "saves disagree"} · watch it
                        </Link>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <LearnHighlights savesById={savesById} onKept={(id) => lib.patchSave(id, { kept: true })} />
      </div>
    </>
  );
}

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flame, GraduationCap } from "lucide-react";
import { AiLabel } from "@/components/ui/AiLabel";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG } from "@/components/ui/space";
import { PageHeader } from "@/components/shell/PageHeader";
import { RecallCard } from "@/components/learn/RecallCard";
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
      <PageHeader
        title="Learn"
        trailing={
          loop.streak > 0 ? (
            <span className="flex items-center gap-1 pb-2 text-label text-fg" aria-label={`${loop.streak}-day streak`}>
              <Flame size={20} strokeWidth={2} aria-hidden /> {loop.streak}
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
              icon={GraduationCap}
              message="Keep a video by swiping right in Play. A few days later its recall cards show up here."
              actionLabel="Open Play"
              onAction={() => router.push("/play?queue=today")}
            />
          ) : (
            <Card size="lg" className="flex items-center gap-3">
              <CheckCircle2 size={24} strokeWidth={2} aria-hidden className="shrink-0" />
              <p className="text-body">
                {doneToday >= DAILY_CAP
                  ? `That's ${DAILY_CAP} for today. The rest wait for tomorrow.`
                  : doneToday > 0
                    ? `All caught up · ${doneToday} answered today.`
                    : "Nothing due right now. Kept saves come back here a few days after you keep them."}
              </p>
            </Card>
          )}
        </section>

        <section id="syntheses" aria-labelledby="syntheses-title" className="flex scroll-mt-4 flex-col gap-3">
          <h2 id="syntheses-title" className="text-heading">
            Syntheses
          </h2>
          {loop.syntheses.length === 0 ? (
            <p className="text-body text-fg-muted">When a Space gathers 5 saves, the AI reads them together and shows what they agree on here.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {loop.syntheses.map((s) => {
                const sp = s.spaceId ? spacesById.get(s.spaceId) : undefined;
                const firstDisagreeing = s.disagreements[0]?.saveIds[0];
                const disagreeCount = new Set(s.disagreements.flatMap((d) => d.saveIds)).size;
                return (
                  <li key={s.id}>
                    <Card size="lg" spaceColor={sp?.color} className="flex flex-col gap-3">
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
                        {s.topic && <h3 className="text-heading">{s.topic}</h3>}
                      </div>
                      <ul className="flex flex-col gap-2">
                        {s.points.map((p, i) => (
                          <li key={i} className="text-body">
                            • {p}
                          </li>
                        ))}
                      </ul>
                      {s.suggestedAction && <p className="text-body text-fg-muted">Try: {s.suggestedAction}</p>}
                      {firstDisagreeing && (
                        <Link href={`/item/${firstDisagreeing}`} className="inline-flex h-12 items-center text-label text-fg underline">
                          {disagreeCount} {disagreeCount === 1 ? "save disagrees" : "saves disagree"} · watch it
                        </Link>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

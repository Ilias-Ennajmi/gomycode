"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, Keyboard, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, SPACE_TINT, type SpaceColor } from "@/components/ui/space";
import { VoiceNoteButton } from "@/components/save/VoiceNoteButton";
import { requestGrade, waitForGrade, type RecallCard as Card, type Review } from "@/lib/loop";
import { VERDICT_LABEL, verdictFromGrade, type Verdict } from "@/lib/sm2";
import { haptic } from "@/lib/haptics";

type Phase = { kind: "ask" } | { kind: "grading" } | { kind: "result"; review: Review };

const VERDICTS: Verdict[] = ["got", "partly", "missed"];

/**
 * One recall question in its Space colour. Answer out loud (hold the mic) or
 * type it, and the worker grades it; the Got it / Partly / Missed buttons
 * always work too, with no worker at all.
 */
export function RecallCard({
  card,
  position,
  total,
  spaceName,
  color,
  onSelfGrade,
  onGraded,
  onNext,
}: {
  card: Card;
  position: number;
  total: number;
  spaceName?: string;
  color: SpaceColor;
  onSelfGrade: (verdict: Verdict) => void;
  onGraded: (review: Review) => void;
  onNext: () => void;
}) {
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const [showAnswer, setShowAnswer] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const cancelWait = useRef<(() => void) | null>(null);
  const settled = useRef(false);

  useEffect(() => () => cancelWait.current?.(), []);

  const submit = async (answer: { audio: Blob; mime: string } | { text: string }) => {
    setPhase({ kind: "grading" });
    const since = new Date(Date.now() - 5000);
    try {
      const jobId = await requestGrade(card, answer);
      const wait = waitForGrade(card.id, jobId, since);
      cancelWait.current = wait.cancel;
      const review = await wait.promise;
      if (settled.current) return; // graded by hand meanwhile
      if (review && review.grade !== null) {
        haptic();
        setPhase({ kind: "result", review });
        onGraded(review);
      } else {
        setPhase({ kind: "ask" });
        setShowAnswer(true);
        toast({ message: "Couldn't grade that one. Grade it yourself below." });
      }
    } catch {
      if (settled.current) return;
      setPhase({ kind: "ask" });
      setShowAnswer(true);
      toast({ message: navigator.onLine ? "Couldn't send your answer. Grade it yourself below." : "Offline. Grade it yourself below." });
    }
  };

  const verdict = phase.kind === "result" && phase.review.grade !== null ? verdictFromGrade(phase.review.grade) : null;

  return (
    <article aria-label="Recall card" className="rise-in relative flex flex-col overflow-hidden rounded-xl bg-surface text-fg shadow-pop">
      {/* The question sits on a solid block of its Space colour. */}
      <div className={cx("flex flex-col gap-3 p-5 pb-6 text-on-space", SPACE_BG[color])}>
        <div className="flex items-center justify-between gap-2 text-label">
          <span className="truncate">Recall{spaceName ? ` · ${spaceName}` : ""}</span>
          <span className="shrink-0 tabular-nums">
            {position} of {total}
          </span>
        </div>
        <h2 className="text-title">{card.prompt}</h2>
      </div>
      <div className="flex flex-col gap-4 p-5">

      {phase.kind === "grading" && (
        <div className="flex flex-col gap-2" role="status">
          <span className="text-label text-fg-muted">Grading your answer…</span>
          <Skeleton shape="line" />
          <Skeleton shape="line" className="w-2/3" />
        </div>
      )}

      {phase.kind === "result" && verdict && (
        <div className="flex flex-col gap-2" role="status">
          <span className="pop-in self-start rounded-full bg-fg px-4 py-1.5 text-label text-background">{VERDICT_LABEL[verdict]}</span>
          {phase.review.feedback && <p className="text-body">{phase.review.feedback}</p>}
          {phase.review.text && <p className="text-caption text-fg-muted">You said: “{phase.review.text}”</p>}
          <p className="text-caption text-fg-muted">Answer: {card.answer}</p>
        </div>
      )}

      {phase.kind !== "result" && showAnswer && (
        <p className={cx("rise-in rounded-lg p-4 text-body", SPACE_TINT[color])}>
          <span className="text-label">Answer · </span>
          {card.answer}
        </p>
      )}

      {phase.kind === "ask" && (
        <div className="flex flex-wrap gap-2">
          <VoiceNoteButton
            idleLabel="Hold to answer"
            holdHint="Hold to answer out loud"
            onRecorded={(blob, mime) => void submit({ audio: blob, mime })}
            onProblem={(m) => toast({ message: m })}
            className="flex-1"
          />
          <Button variant="secondary" icon={Keyboard} onClick={() => setTypeOpen(true)}>
            Type it
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={`/item/${card.saveId}`} className="press inline-flex h-12 items-center gap-2 rounded-full px-3 text-label text-fg hover:bg-raised">
          <PlayCircle size={24} strokeWidth={2} aria-hidden />
          Show me
        </Link>
        {phase.kind !== "result" && !showAnswer && (
          <Button variant="ghost" icon={Eye} onClick={() => setShowAnswer(true)}>
            Show answer
          </Button>
        )}
      </div>

      {phase.kind === "result" ? (
        <Button fullWidth onClick={onNext}>
          Next card
        </Button>
      ) : (
        <div role="group" aria-label="Grade it yourself" className="grid grid-cols-3 gap-2">
          {VERDICTS.map((v) => (
            <Button
              key={v}
              variant="secondary"
              className="w-full"
              onClick={() => {
                settled.current = true;
                cancelWait.current?.();
                haptic();
                onSelfGrade(v);
              }}
            >
              {VERDICT_LABEL[v]}
            </Button>
          ))}
        </div>
      )}

      </div>

      <Sheet open={typeOpen} onClose={() => setTypeOpen(false)} label="Type your answer" title="Type your answer">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const text = typed.trim();
            setTypeOpen(false);
            if (text) {
              setTyped("");
              void submit({ text });
            }
          }}
        >
          <p className="text-body">{card.prompt}</p>
          <label htmlFor={`answer-${card.id}`} className="sr-only">
            Your answer
          </label>
          <textarea
            id={`answer-${card.id}`}
            autoFocus
            rows={4}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="In your own words…"
            className="w-full rounded-lg border border-line bg-surface p-4 text-input text-fg outline-none placeholder:text-fg-subtle focus:border-fg"
          />
          <Button type="submit" fullWidth disabled={!typed.trim()}>
            Check my answer
          </Button>
        </form>
      </Sheet>
    </article>
  );
}

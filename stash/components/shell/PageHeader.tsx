import { ChevronLeft } from "lucide-react";
import { BackButton } from "./BackButton";

/** Screen title row. `back` renders a chevron that goes one level up. */
export function PageHeader({
  title,
  eyebrow,
  back,
  trailing,
  headingLevel = 1,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  back?: string;
  trailing?: React.ReactNode;
  /** 1 on screens; demos (e.g. /design) pass 2 so a page keeps one h1. */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header className="flex items-end justify-between gap-4 px-4 pt-6 pb-4">
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <BackButton
            fallback={back}
            label="Back"
            className="tap -ml-3 flex items-center justify-center rounded-full text-fg"
          >
            <ChevronLeft size={24} strokeWidth={2} aria-hidden />
          </BackButton>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="text-caption text-fg-muted">{eyebrow}</div>}
          <Heading className="truncate text-display">{title}</Heading>
        </div>
      </div>
      {trailing}
    </header>
  );
}

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Screen title row. `back` renders a chevron that goes one level up. */
export function PageHeader({
  title,
  eyebrow,
  back,
  trailing,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  back?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 px-4 pt-6 pb-4">
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <Link href={back} aria-label="Back" className="tap -ml-3 flex items-center justify-center rounded-full text-fg">
            <ChevronLeft size={24} strokeWidth={2} aria-hidden />
          </Link>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="text-caption text-fg-muted">{eyebrow}</div>}
          <h1 className="truncate text-display">{title}</h1>
        </div>
      </div>
      {trailing}
    </header>
  );
}

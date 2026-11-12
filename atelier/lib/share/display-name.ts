/**
 * Cleans a visitor's display name before it is stored. It removes what makes a name misleading or invisible (bidi overrides,
 * zero-width and other format characters, control characters, blank look-alikes) and nothing else: markup such as
 * "<script>" is kept verbatim because escaping is the renderer's job (every surface prints it as React text).
 */

const MAX_RAW = 512; // refuse absurd input without scanning it
const MAX_CHARS = 60;

// Characters that render as nothing but are not in a "format" category.
const BLANK_LOOKALIKES = /[͏ᅟᅠ឴឵⠀ㅤﾠ]/gu;

export function sanitiseDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > MAX_RAW) return null;

  const cleaned = raw
    .normalize("NFC")
    .replace(/\p{Cf}/gu, "") // zero-width, bidi overrides and isolates, soft hyphen, BOM
    .replace(/[\s\p{Z}\u0085]+/gu, " ") // every kind of whitespace, NEL included, becomes one space
    .replace(/[\p{Cc}\p{Co}\p{Cs}\p{Cn}]/gu, "") // control, private use, lone surrogates, unassigned
    .replace(BLANK_LOOKALIKES, "")
    .replace(/(\p{M}{3})\p{M}+/gu, "$1") // at most 3 stacked combining marks
    .replace(/ +/g, " ")
    .trim();

  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(cleaned)) return null; // nothing visible left
  if ([...cleaned].length > MAX_CHARS) return null;
  return cleaned;
}

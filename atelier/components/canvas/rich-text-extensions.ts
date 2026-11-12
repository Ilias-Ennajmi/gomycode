import { Extension } from "@tiptap/core";
import { FontSize, TextStyle } from "@tiptap/extension-text-style";
import { isSafeLinkHref } from "@/lib/engine/model/links";

/** Font sizes the editor offers (px). Any size set through the command is clamped to this range. */
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72, 96] as const;
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 96;

export function clampFontSize(px: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(px)));
}

/** Mixed font sizes as a `fontSize` attribute on the text-style mark; sizes are clamped to 12-96 px. */
export const RangedFontSize = FontSize.extend({
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) => {
          const px = Number.parseFloat(size);
          if (!Number.isFinite(px)) return false;
          return chain().setMark("textStyle", { fontSize: `${clampFontSize(px)}px` }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphLineHeight: {
      /** Line height (a multiple of the font size, 0.8 - 3) for the paragraphs and headings in the selection. */
      setParagraphLineHeight: (lineHeight: number) => ReturnType;
      unsetParagraphLineHeight: () => ReturnType;
    };
  }
}

const BLOCKS = ["paragraph", "heading"];

/** `lineHeight` as an attribute of paragraphs and headings. */
export const ParagraphLineHeight = Extension.create({
  name: "paragraphLineHeight",

  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const n = Number.parseFloat(el.style.lineHeight);
              return Number.isFinite(n) ? n : null;
            },
            renderHTML: (attrs: Record<string, unknown>) =>
              typeof attrs.lineHeight === "number" ? { style: `line-height: ${attrs.lineHeight}` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphLineHeight:
        (lineHeight: number) =>
        ({ commands }) => {
          if (!Number.isFinite(lineHeight)) return false;
          const v = Math.min(3, Math.max(0.8, lineHeight));
          return BLOCKS.map((t) => commands.updateAttributes(t, { lineHeight: v })).some(Boolean);
        },
      unsetParagraphLineHeight:
        () =>
        ({ commands }) =>
          BLOCKS.map((t) => commands.updateAttributes(t, { lineHeight: null })).some(Boolean),
    };
  },
});

export { TextStyle };

/** Tiptap's link option: only addresses that are already complete http(s) or mailto links are accepted. */
export const isAllowedLinkUri = (url: string): boolean => isSafeLinkHref(url);

/*
 * Class strings for form controls, built from token classes only (see app/globals.css for the
 * Tailwind <-> token mapping). Targets are 44 px tall: comfortable on touch and well above the
 * 24 px minimum. Motion is transform/opacity only and follows the token durations, which
 * prefers-reduced-motion collapses to zero.
 */
const press =
  "transition-[transform,opacity,background-color] duration-(--dur-fast) ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60";
const buttonBase = `inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-md px-4 text-(length:--text-md) font-medium ${press}`;

export const inputClass =
  "block min-h-11 w-full rounded-md border border-line bg-panel px-3 text-fg placeholder:text-fg-muted aria-[invalid=true]:border-alert";

export const buttonPrimary = `${buttonBase} bg-brand text-on-brand hoverable:opacity-90`;
export const buttonSecondary = `${buttonBase} border border-line bg-panel text-fg hoverable:border-fg-muted`;
export const buttonDanger = `${buttonBase} bg-alert text-canvas hoverable:opacity-90`;
export const labelClass = "mb-1 block text-(length:--text-sm) font-medium text-fg";
export const helpClass = "mt-1 text-(length:--text-sm) text-fg-muted";
export const errorClass = "mt-1 text-(length:--text-sm) text-alert";

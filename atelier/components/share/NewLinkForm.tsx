"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useRef, useState } from "react";
import { buttonPrimary, buttonSecondary, errorClass, helpClass, inputClass, labelClass } from "@/components/ui/controls";
import { EXPIRY_CHOICES, WELCOME_NOTE_MAX, type ExpiryChoice, type FormState, type RoundOption } from "@/lib/share/share-form";
import type { LinkPermission } from "@/lib/share/link";

export type FrameChoice = { id: string; name: string };

type Props = {
  value: FormState;
  onChange(next: FormState): void;
  frames: readonly FrameChoice[];
  rounds: readonly RoundOption[];
  /** False when the rounds API is not there: the round choice is off and says why. */
  roundsAvailable: boolean;
  errors: Record<string, string>;
  /** A message from the server that is not about one field. */
  formError: string | null;
  busy: boolean;
  onSubmit(): void;
  onCancel(): void;
};

const PERMISSIONS: { id: LinkPermission; label: string; help: string }[] = [
  { id: "view", label: "View only", help: "They can look, nothing else." },
  { id: "react", label: "View and react", help: "Pick, reject, ask for more like this, approve a direction." },
  { id: "comment", label: "View, react and comment", help: "Also leave pinned comments." },
];

const row = "flex min-h-11 items-start gap-3 py-2 text-(length:--text-md)";
const box = "mt-1 size-4 shrink-0 accent-(--color-accent)";

/**
 * The options of a new share link: what it shows (whole board or chosen frames; a published round or the live board), what a
 * visitor may do, a password, an expiry, a welcome note, and four switches. Every control has a visible label; every problem is
 * a sentence tied to its field with aria-describedby, and the first bad field takes focus after a failed submit.
 */
export function NewLinkForm({ value, onChange, frames, rounds, roundsAvailable, errors, formError, busy, onSubmit, onCancel }: Props) {
  const uid = useId();
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => onChange({ ...value, [k]: v });

  const id = (k: string) => `${uid}-${k}`;
  const err = (k: string) => errors[k];
  const describedBy = (k: string, ...more: string[]) => [...(err(k) ? [id(`${k}-err`)] : []), ...more].join(" ") || undefined;
  const fieldError = (k: string) => (err(k) ? <p id={id(`${k}-err`)} className={errorClass} data-field-error={k}>{err(k)}</p> : null);

  const noRounds = !roundsAvailable || rounds.length === 0;
  const noFrames = frames.length === 0;
  const errorCount = Object.keys(errors).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate data-share-form="" className="flex flex-col gap-5">
      {errorCount > 0 || formError ? (
        <p role="alert" className="rounded-md border border-alert px-3 py-2 text-(length:--text-sm) text-alert" data-form-alert="">
          {formError ?? `Fix ${errorCount} thing${errorCount === 1 ? "" : "s"} to continue.`}
        </p>
      ) : null}

      <div>
        <label htmlFor={id("name")} className={labelClass}>
          Link name
        </label>
        <input
          id={id("name")}
          className={inputClass}
          value={value.name}
          maxLength={120}
          autoComplete="off"
          aria-invalid={err("name") ? true : undefined}
          aria-describedby={describedBy("name", id("name-help"))}
          onChange={(e) => set("name", e.target.value)}
        />
        <p id={id("name-help")} className={helpClass}>
          Only you see this. It tells your links apart, for example the client&apos;s name.
        </p>
        {fieldError("name")}
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={describedBy("frameIds")}>
        <legend className={labelClass}>What they see</legend>
        <label className={row}>
          <input type="radio" name={id("scope")} className={box} checked={value.scope === "board"} onChange={() => set("scope", "board")} />
          <span>Whole board</span>
        </label>
        <label className={row}>
          <input type="radio" name={id("scope")} className={box} checked={value.scope === "frames"} disabled={noFrames} onChange={() => set("scope", "frames")} />
          <span>
            Chosen frames
            {noFrames ? <span className={`${helpClass} block`}>Add a frame to the board to share just part of it.</span> : null}
          </span>
        </label>
        {value.scope === "frames" && !noFrames ? (
          <ul className="m-0 ml-7 flex list-none flex-col p-0" aria-label="Frames to share">
            {frames.map((f) => (
              <li key={f.id}>
                <label className={row}>
                  <input
                    type="checkbox"
                    className={box}
                    checked={value.frameIds.includes(f.id)}
                    onChange={(e) => set("frameIds", e.target.checked ? [...value.frameIds, f.id] : value.frameIds.filter((x) => x !== f.id))}
                  />
                  <span>{f.name || "Frame"}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        {fieldError("frameIds")}
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={describedBy("roundId", id("mode-help"))}>
        <legend className={labelClass}>Which version</legend>
        <label className={row}>
          <input type="radio" name={id("mode")} className={box} checked={value.mode === "round"} disabled={noRounds} onChange={() => set("mode", "round")} />
          <span>Published round</span>
        </label>
        {value.mode === "round" && !noRounds ? (
          <div className="mb-2 ml-7">
            <label htmlFor={id("round")} className={labelClass}>
              Round
            </label>
            <select id={id("round")} className={inputClass} value={value.roundId ?? ""} onChange={(e) => set("roundId", e.target.value || null)}>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label.trim() ? `Round ${r.number} · ${r.label.trim()}` : `Round ${r.number}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <label className={row}>
          <input type="radio" name={id("mode")} className={box} checked={value.mode === "live"} onChange={() => set("mode", "live")} />
          <span>Live board</span>
        </label>
        <p id={id("mode-help")} className={`${helpClass} ml-7`}>
          {noRounds
            ? "Publish a round first to send a frozen version. Until then a link shows the live board."
            : value.mode === "round"
              ? "A round is frozen: your client sees it exactly as you published it, whatever you change later."
              : "Live: your client sees the board as it is right now, including unfinished edits."}
        </p>
        {fieldError("roundId")}
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={labelClass}>What they can do</legend>
        {PERMISSIONS.map((p) => (
          <label key={p.id} className={row}>
            <input type="radio" name={id("perm")} className={box} checked={value.permission === p.id} onChange={() => set("permission", p.id)} />
            <span>
              {p.label}
              <span className={`${helpClass} block`}>{p.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <label className={row}>
          <input type="checkbox" className={box} checked={value.passwordOn} onChange={(e) => set("passwordOn", e.target.checked)} />
          <span>Ask for a password</span>
        </label>
        {value.passwordOn ? (
          <div className="ml-7">
            <label htmlFor={id("password")} className={labelClass}>
              Password
            </label>
            <div className="flex items-center gap-2">
              <input
                id={id("password")}
                className={inputClass}
                type={showPassword ? "text" : "password"}
                value={value.password}
                autoComplete="new-password"
                spellCheck={false}
                maxLength={200}
                aria-invalid={err("password") ? true : undefined}
                aria-describedby={describedBy("password", id("password-help"))}
                onChange={(e) => set("password", e.target.value)}
              />
              <button
                type="button"
                className={`${buttonSecondary} shrink-0 px-3`}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
              </button>
            </div>
            <p id={id("password-help")} className={helpClass}>
              At least 4 characters. Share it separately from the link.
            </p>
            {fieldError("password")}
          </div>
        ) : null}
      </div>

      <div>
        <label htmlFor={id("expiry")} className={labelClass}>
          Expires
        </label>
        <select id={id("expiry")} className={inputClass} value={value.expiry} onChange={(e) => set("expiry", e.target.value as ExpiryChoice)} aria-describedby={describedBy("expiresAt")}>
          {EXPIRY_CHOICES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {value.expiry === "custom" ? (
          <div className="mt-2">
            <label htmlFor={id("date")} className={labelClass}>
              Last day the link works
            </label>
            <input
              id={id("date")}
              type="date"
              className={inputClass}
              value={value.customDate}
              aria-invalid={err("expiresAt") ? true : undefined}
              aria-describedby={describedBy("expiresAt")}
              onChange={(e) => set("customDate", e.target.value)}
            />
          </div>
        ) : null}
        {fieldError("expiresAt")}
      </div>

      <div>
        <label htmlFor={id("note")} className={labelClass}>
          Welcome note
        </label>
        <textarea
          id={id("note")}
          className={`${inputClass} min-h-24 py-2`}
          value={value.welcomeNote}
          rows={3}
          aria-invalid={err("welcomeNote") ? true : undefined}
          aria-describedby={describedBy("welcomeNote", id("note-count"))}
          onChange={(e) => set("welcomeNote", e.target.value)}
        />
        <p id={id("note-count")} className={`${helpClass} flex justify-between gap-3`}>
          <span>Shown to your client when they open the link. Plain text.</span>
          <span aria-label={`${value.welcomeNote.length} of ${WELCOME_NOTE_MAX} characters`} className={value.welcomeNote.length > WELCOME_NOTE_MAX ? "font-medium text-alert" : ""}>
            {value.welcomeNote.length}/{WELCOME_NOTE_MAX}
          </span>
        </p>
        {fieldError("welcomeNote")}
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={labelClass}>Extras</legend>
        <label className={row}>
          <input type="checkbox" className={box} checked={value.allowDownload} onChange={(e) => set("allowDownload", e.target.checked)} />
          <span>
            Allow download
            <span className={`${helpClass} block`}>Your client can save the frames as images or a PDF.</span>
          </span>
        </label>
        <label className={row}>
          <input type="checkbox" className={box} checked={value.watermark} onChange={(e) => set("watermark", e.target.checked)} />
          <span>
            Watermark
            <span className={`${helpClass} block`}>A faint mark across what they see.</span>
          </span>
        </label>
        <label className={row}>
          <input type="checkbox" className={box} checked={value.showCredits} onChange={(e) => set("showCredits", e.target.checked)} />
          <span>
            Show credits
            <span className={`${helpClass} block`}>Show each picture&apos;s credit and licence.</span>
          </span>
        </label>
        <label className={row}>
          <input type="checkbox" className={box} checked={value.blindVotes} onChange={(e) => set("blindVotes", e.target.checked)} />
          <span>
            Blind votes
            <span className={`${helpClass} block`}>Visitors don&apos;t see each other&apos;s reactions until you reveal them.</span>
          </span>
        </label>
      </fieldset>

      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex justify-end gap-3 border-t border-line bg-panel px-6 py-4">
        <button type="button" className={buttonSecondary} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={buttonPrimary} disabled={busy} data-submit="">
          {busy ? "Creating…" : "Create link"}
        </button>
      </div>
    </form>
  );
}

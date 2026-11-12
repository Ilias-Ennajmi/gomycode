"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signIn, type SignInState } from "./actions";
import { buttonPrimary, errorClass, inputClass, labelClass } from "@/components/ui/controls";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, {
    error: initialError,
  });
  const [show, setShow] = useState(false);

  const emailError = state.error && state.field === "email" ? state.error : undefined;
  // Everything that is not about the email field is shown under the password field.
  const passwordError = state.error && state.field !== "email" ? state.error : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.email ?? ""}
          className={inputClass}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
        />
        {emailError ? (
          <p id="email-error" role="alert" className={errorClass}>
            {emailError}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className={`${inputClass} pr-12`}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "password-error" : undefined}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-fg-muted pointer-coarse:size-11 hoverable:text-fg"
          >
            {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
        {passwordError ? (
          <p id="password-error" role="alert" className={errorClass}>
            {passwordError}
          </p>
        ) : null}
      </div>

      <button type="submit" className={buttonPrimary} disabled={pending} aria-disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

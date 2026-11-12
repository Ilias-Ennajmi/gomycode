"use client";

import { useActionState } from "react";
import { verifyCode, type VerifyState } from "./actions";
import { buttonPrimary, errorClass, helpClass, inputClass, labelClass } from "@/components/ui/controls";

export function VerifyForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(verifyCode, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="code" className={labelClass}>
          6-digit code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={7}
          autoFocus
          required
          className={`${inputClass} tracking-widest`}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "code-help code-error" : "code-help"}
        />
        <p id="code-help" className={helpClass}>
          Open your authenticator app and enter the code it shows for Atelier.
        </p>
        {state.error ? (
          <p id="code-error" role="alert" className={errorClass}>
            {state.error}
          </p>
        ) : null}
      </div>
      <button type="submit" className={buttonPrimary} disabled={pending} aria-disabled={pending}>
        {pending ? "Checking…" : "Verify"}
      </button>
    </form>
  );
}

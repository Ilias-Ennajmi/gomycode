"use client";

import { useEffect, useState } from "react";
import { RestoreForm } from "@/components/settings/RestoreForm";
import { extractCode } from "@/lib/recoveryCode";

/** Reads the code from the link's # part, then takes it out of the address bar and history. */
export function RestoreFromLink() {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const found = extractCode(window.location.hash.slice(1));
    // The address is only readable in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(found);
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  if (code === undefined) return null;
  return <RestoreForm key={code ?? "empty"} initialCode={code ?? undefined} autoFocus={!code} />;
}

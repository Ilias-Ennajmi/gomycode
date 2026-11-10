import { AiError, isAiEnabled, narrate } from "@/lib/ai";
import { readSetting, writeSetting } from "@/lib/push";
import { isTransient, reportProblem } from "@/lib/errlog";

// Does the natural voice (Gemini text-to-speech) actually answer? Google renames its
// preview models, and nothing else would notice until someone taps "AI" in Listen and
// hears the phone's voice instead. After the hourly refresh, one short sentence is read:
// once when nothing is known, weekly while it works, twice a day while it doesn't. The
// result shows in Settings → Under the hood, and a real failure is reported like any other.

const KEY = "voice-check";
const HOUR = 60 * 60 * 1000;

export interface VoiceCheck {
  ok: boolean | null;
  at: number;
  /** Bytes of audio that came back, or what went wrong. */
  detail: string;
}

export function voiceCheck() {
  return readSetting<VoiceCheck>(KEY, { ok: null, at: 0, detail: "" });
}

/** Whether it's time to try again. Exported for tests. */
export function voiceCheckDue(last: VoiceCheck, now = Date.now()) {
  if (last.ok === null) return true;
  return now - last.at > (last.ok ? 7 * 24 * HOUR : 12 * HOUR);
}

export async function runVoiceCheck() {
  if (!isAiEnabled()) return null;
  const last = await voiceCheck();
  if (!voiceCheckDue(last)) return null;
  try {
    const wav = await narrate("The natural voice is working.", "en", "background");
    // A real second of speech is tens of kilobytes; a header alone is 44 bytes.
    if (wav.length < 5000) throw new AiError("The voice model answered with no sound");
    const result: VoiceCheck = { ok: true, at: Date.now(), detail: `${wav.length} bytes` };
    await writeSetting(KEY, result);
    return result;
  } catch (error) {
    // Busy or out of quota says nothing about whether it works: ask again next time.
    if (isTransient(error)) return null;
    const result: VoiceCheck = {
      ok: false,
      at: Date.now(),
      detail: (error as Error).message.slice(0, 300),
    };
    await writeSetting(KEY, result);
    await reportProblem("Natural voice", error);
    return result;
  }
}

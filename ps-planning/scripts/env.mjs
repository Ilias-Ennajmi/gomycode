// Reads SETUP.env (KEY=value lines). Missing file or empty values come back as "".
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const env = {};
  const p = join(ROOT, "SETUP.env");
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  for (const k of Object.keys(process.env)) if (/^(FIREBASE_|OWNER_|APP_PASSWORD|GEMINI_)/.test(k) && !env[k]) env[k] = process.env[k];
  return env;
}

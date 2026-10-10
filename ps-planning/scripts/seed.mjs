// Imports seed/seed.json into Firestore. Idempotent: existing docs are skipped, never overwritten.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./env.mjs";
import { signIn, createDoc } from "./firestore-rest.mjs";

const data = JSON.parse(readFileSync(join(ROOT, "seed/seed.json"), "utf8"));
const paths = [];
for (const c of ["days", "campaigns", "ideas", "groups"])
  for (const [id, v] of Object.entries(data[c] || {})) paths.push([c, `${c}/${id}`, v]);
for (const k of ["settings", "storyRules"]) if (data.config && data.config[k]) paths.push(["config", `config/${k}`, data.config[k]]);

const { idToken } = await signIn();
const counts = {};
for (const [c, path, v] of paths) {
  const created = await createDoc(path, v, idToken);
  counts[c] = counts[c] || { created: 0, skipped: 0 };
  counts[c][created ? "created" : "skipped"]++;
}
for (const [c, n] of Object.entries(counts)) console.log(`${c}: ${n.created} created, ${n.skipped} skipped`);

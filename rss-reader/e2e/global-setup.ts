import { request, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import { seed } from "./seed";

// Fresh data, then one sign-in shared by every test.
export default async function globalSetup(config: FullConfig) {
  await seed();
  const baseURL = config.projects[0].use.baseURL!;
  const context = await request.newContext({ baseURL });
  const res = await context.post("/api/auth/login", {
    data: { password: process.env.E2E_PASSWORD },
  });
  if (!res.ok()) throw new Error(`Sign-in failed: ${res.status()} ${await res.text()}`);
  fs.mkdirSync("e2e/.auth", { recursive: true });
  await context.storageState({ path: "e2e/.auth/state.json" });
  await context.dispose();
}

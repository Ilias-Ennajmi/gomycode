import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

/** Every Server Action should start with this — throws/redirects if the caller isn't signed in. */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}

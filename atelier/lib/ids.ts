import { nanoid } from "nanoid";

/** Short, URL-safe, collision-resistant id (12 chars) used for objects and devices. */
export function newId(): string {
  return nanoid(12);
}

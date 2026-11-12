/**
 * The `next` query value tells the login page where to send the person afterwards. It comes from
 * the URL, so it is only honoured when it is a plain same-site path: never another origin, a
 * protocol-relative `//host`, a backslash trick, or a control character. Anything else becomes "/".
 * The login pages themselves are never a destination (that would loop).
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value === "") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  const path = value.split(/[?#]/, 1)[0];
  if (path === "/login" || path.startsWith("/login/")) return "/";
  return value;
}

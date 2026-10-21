// AI answers sometimes stop mid-JSON (the length limit hit inside a list). Rather than
// throw the whole answer away, keep everything up to the last complete value and close the
// brackets still open: a cut-off list of six bullets still gives five.

export function salvageJson(raw: string): unknown {
  const start = raw.search(/[{[]/);
  if (start < 0) throw new SyntaxError("No JSON in the answer");
  const text = raw.slice(start);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  // The longest prefix that ends right after a complete value, and the closers it needs.
  let cut = -1;
  let closers = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) return JSON.parse(text.slice(0, i + 1));
      // Just closed a value inside a list: a safe place to stop.
      if (stack[stack.length - 1] === "]") {
        cut = i + 1;
        closers = [...stack].reverse().join("");
      }
    }
  }
  if (cut < 0) throw new SyntaxError("The answer was cut before anything usable");
  return JSON.parse(text.slice(0, cut) + closers);
}

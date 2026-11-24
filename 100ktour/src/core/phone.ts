/** Ramène un numéro mobile marocain saisi librement à la forme +2126XXXXXXXX. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('+212')) d = d.slice(4);
  else if (d.startsWith('00212')) d = d.slice(5);
  else if (d.startsWith('212') && d.length >= 12) d = d.slice(3);
  else if (d.startsWith('+')) return null;
  d = d.replace(/^0/, '');
  return /^[67]\d{8}$/.test(d) ? `+212${d}` : null;
}

/** +212612345678 -> 06 12 34 56 78 */
export function displayPhone(e164: string): string {
  const d = e164.replace(/^\+212/, '0');
  return d.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

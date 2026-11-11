// Ported from the legacy app's slugify() — accent-folding via explicit
// character-pair tables, no dependency, no unicode regex.
const ACCENTS = "àâäáãåèêëéìîïíòôöóõùûüúñçÀÂÄÁÃÅÈÊËÉÌÎÏÍÒÔÖÓÕÙÛÜÚÑÇ";
const PLAIN = "aaaaaaeeeeiiiiooooouuuuncAAAAAAEEEEIIIIOOOOOUUUUNC";

export function slugify(name: string): string {
  let s = name.toLowerCase();
  for (let i = 0; i < ACCENTS.length; i++) {
    s = s.split(ACCENTS[i].toLowerCase()).join(PLAIN[i].toLowerCase());
  }
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return s || `marque-${Date.now()}`;
}

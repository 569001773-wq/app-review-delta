/**
 * Best-effort line lookup for an evidence string inside a file's text.
 * Returns 1-based line or undefined.
 */
export function findLine(text: string, needle: string): number | undefined {
  if (!text || !needle) return undefined;
  const idx = text.indexOf(needle);
  if (idx < 0) return undefined;
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

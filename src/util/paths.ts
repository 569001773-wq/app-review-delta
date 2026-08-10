/**
 * Path safety helpers. All repository paths are normalized to posix,
 * relative to the repository root, and must never escape the repository.
 */

export function normalizeRepoPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Returns the normalized path if it is safe (relative, inside the repo),
 * otherwise returns null.
 */
export function safeRepoPath(p: string): string | null {
  const norm = normalizeRepoPath(p).trim();
  if (norm.length === 0) return null;
  if (norm.startsWith('/')) return null;
  if (/^[a-zA-Z]:\//.test(norm)) return null;
  const parts = norm.split('/');
  for (const part of parts) {
    if (part === '..') return null;
  }
  if (parts.includes('..')) return null;
  return norm;
}

export function isLikelyBinary(content: Uint8Array): boolean {
  const probe = Math.min(content.length, 8192);
  for (let i = 0; i < probe; i++) {
    if (content[i] === 0) return true;
  }
  return false;
}

export function decodeUtf8(content: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(content);
}

export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

import { createHash } from 'node:crypto';

/** Deterministic semantic fingerprint: sha256 of canonical JSON. */
export function fingerprintOf(parts: unknown[]): string {
  const canonical = JSON.stringify(parts);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 24);
}

export function normalizedString(v: string): string {
  return v.trim().replace(/\s+/g, ' ').toLowerCase();
}

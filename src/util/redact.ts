/**
 * Aggressive redaction for evidence strings. Secret values must never be
 * printed, logged, or included in reports. These patterns are intentionally
 * conservative: only clearly private credential formats are matched.
 */

const REDACTED = '<redacted>';

const SECRET_PATTERNS: RegExp[] = [
  // PEM private key blocks (RSA/EC/DSA/OpenSSH/encrypted).
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
  // PKCS#8 / Apple .p8 (App Store Connect API key).
  /-----BEGIN PKCS8 PRIVATE KEY-----[\s\S]*?-----END PKCS8 PRIVATE KEY-----/g,
  // AWS access key IDs.
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bASIA[0-9A-Z]{16}\b/g,
  // AWS secret access keys (assigned form).
  /\b(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/g,
  // OpenAI (current project key and legacy key).
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{48}\b/g,
  // Anthropic.
  /\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{20,}\b/g,
  // Stripe secret keys (not publishable keys).
  /\bsk_live_[0-9a-zA-Z]{24,}\b/g,
  // GitHub personal access tokens and fine-grained tokens.
  /\bghp_[A-Za-z0-9]{36}\b/g,
  /\bgho_[A-Za-z0-9]{36}\b/g,
  /\bghs_[A-Za-z0-9]{36}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  // Slack tokens.
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  // Google service account private keys (JSON; PEM block above also covers).
  /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----"/g,
];

/**
 * Redacts every recognized secret pattern in the input. Returns the redacted
 * string and the number of redactions applied.
 */
export function redact(input: string): { text: string; count: number } {
  let text = input;
  let count = 0;
  for (const pattern of SECRET_PATTERNS) {
    const copy = text;
    text = text.replace(pattern, () => {
      count++;
      return REDACTED;
    });
    if (copy !== text) {
      // Patterns are global; one pass per pattern is enough.
    }
  }
  return { text, count };
}

export function redacted(input: string): string {
  return redact(input).text;
}

/** Redact the value portion of a key=value snippet, preserving the key name. */
export function redactAssignment(line: string): string {
  const match = /^(\s*[A-Za-z0-9_.-]+\s*[:=]\s*)(.*)$/.exec(line);
  if (!match) return redacted(line);
  return `${match[1]}${REDACTED}`;
}

export const REDACTED_LITERAL = REDACTED;

/**
 * Secret detection patterns for ARD006. Only clearly private credential
 * formats are included. Public client identifiers (Stripe publishable keys,
 * Google/Firebase API keys, Sentry DSNs, EXPO_PUBLIC_* of public shape) are
 * deliberately NOT flagged.
 */

export interface SecretPattern {
  id: string;
  label: string;
  regex: RegExp;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  {
    id: 'pem-private-key',
    label: 'PEM private key block',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PKCS8 )?PRIVATE KEY-----[\s\S]{0,8192}?-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PKCS8 )?PRIVATE KEY-----/,
  },
  {
    id: 'aws-access-key-id',
    label: 'AWS access key ID',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  {
    id: 'aws-secret-key',
    label: 'AWS secret access key',
    regex:
      /\b(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/,
  },
  {
    id: 'openai-key',
    label: 'OpenAI API key',
    regex: /\bsk-proj-[A-Za-z0-9_-]{20,}\b|\bsk-[A-Za-z0-9]{48}\b/,
  },
  {
    id: 'anthropic-key',
    label: 'Anthropic API key',
    regex: /\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    id: 'stripe-secret-key',
    label: 'Stripe secret key',
    regex: /\bsk_live_[0-9a-zA-Z]{24,}\b/,
  },
  {
    id: 'github-token',
    label: 'GitHub token',
    regex: /\b(?:ghp|gho|ghs)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  },
  {
    id: 'slack-token',
    label: 'Slack token',
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
  },
  {
    id: 'google-service-account',
    label: 'Google service-account private key',
    regex: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/,
  },
];

/** EXPO_PUBLIC_* variables whose name AND value match a private credential. */
export const EXPO_PUBLIC_SECRETS: { provider: string; namePart: RegExp; valuePart: RegExp }[] = [
  {
    provider: 'OpenAI',
    namePart: /OPENAI/i,
    valuePart: /^sk-(proj-)?[A-Za-z0-9_-]{20,}$/,
  },
  {
    provider: 'Anthropic',
    namePart: /ANTHROPIC|CLAUDE/i,
    valuePart: /^sk-ant-(api03-)?[A-Za-z0-9_-]{20,}$/,
  },
  {
    provider: 'Stripe',
    namePart: /STRIPE/i,
    valuePart: /^sk_live_[0-9a-zA-Z]{24,}$/,
  },
  {
    provider: 'AWS',
    namePart: /AWS/i,
    valuePart: /^AKIA[0-9A-Z]{16}$/,
  },
  {
    provider: 'Apple',
    namePart: /APPLE/i,
    valuePart: /-----BEGIN PRIVATE KEY-----/,
  },
];

/** Matches any EXPO_PUBLIC_* assignment line. */
export const EXPO_PUBLIC_ASSIGNMENT =
  /(EXPO_PUBLIC_[A-Z0-9_]{3,80})\s*[:=]\s*(?:["']?)([A-Za-z0-9_\-./+=]{8,})/g;

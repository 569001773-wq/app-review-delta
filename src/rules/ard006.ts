import { CandidateFindingInput, Rule, RuleContext, effectiveSeverity } from './shared';
import { EXPO_PUBLIC_ASSIGNMENT, EXPO_PUBLIC_SECRETS, SECRET_PATTERNS } from './secretPatterns';
import { findLine } from '../util/lineLookup';
import { redactAssignment, redacted } from '../util/redact';

const SOURCE = {
  title: 'Apple Developer Program: keep private keys private | Expo: environment variables',
  url: 'https://developer.apple.com/help/account/manage-api-keys-for-app-store-connect-api/',
};

function snippetAround(text: string, index: number, radius = 160): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const lineEnd = text.indexOf('\n', index);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  void start;
  void end;
  return line.trim();
}

export const ARD006: Rule = {
  id: 'ARD006',
  metadata: {
    id: 'ARD006',
    title: 'Strong Client Secret Exposure',
    category: 'secret',
    defaultSeverity: 'ERROR',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'Committed private credentials (PEM private keys, provider secret keys, EXPO_PUBLIC variables with unmistakably private values) are a release and security risk. Public client identifiers are not flagged.',
    detectionLogic:
      'Scans only the scoped configuration/secret-shaped files in the snapshot. Matches provider-specific secret formats only: PEM/PKCS8 private keys, AWS access keys, OpenAI/Anthropic/Stripe/GitHub/Slack tokens, Google service-account private keys, and EXPO_PUBLIC_* variables whose name and value together match a private credential format. Evidence is always redacted.',
    falsePositives:
      'Client API keys that are intentionally public (Stripe publishable keys, Google/Firebase API keys, Sentry DSNs, generic EXPO_PUBLIC_* values) are never flagged. A variable named API_KEY alone is not evidence.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    const out: CandidateFindingInput[] = [];
    for (const file of ctx.head.files.values()) {
      const text = file.text;
      if (text.length === 0) continue;

      // Pre-scan EXPO_PUBLIC assignments so raw secret patterns do not
      // double-report the same credential (the EXPO_PUBLIC finding is more
      // specific and includes the variable name).
      const expoValueRanges: Array<[number, number]> = [];
      EXPO_PUBLIC_ASSIGNMENT.lastIndex = 0;
      for (const m of text.matchAll(EXPO_PUBLIC_ASSIGNMENT)) {
        const name = m[1] ?? '';
        const value = m[2] ?? '';
        const hit = EXPO_PUBLIC_SECRETS.find(
          (s) => s.namePart.test(name) && s.valuePart.test(value.trim()),
        );
        if (!hit) continue;
        const valueIndex = m[0].indexOf(value);
        const start = m.index + Math.max(0, valueIndex);
        expoValueRanges.push([start, start + value.length]);
      }
      const insideExpoRange = (idx: number): boolean =>
        expoValueRanges.some(([s, e]) => idx >= s && idx <= e);

      for (const pattern of SECRET_PATTERNS) {
        const m = pattern.regex.exec(text);
        if (!m) continue;
        if (insideExpoRange(m.index)) continue;
        const idx = m.index;
        const line = snippetAround(text, idx);
        const redactedLine = redacted(line);
        out.push({
          title: `${pattern.label} committed`,
          severity: effectiveSeverity('ERROR', ctx.config, 'ARD006'),
          confidence: 'HIGH',
          category: 'secret',
          file: file.path,
          evidence:
            redactedLine === line
              ? `${pattern.label} found in ${file.path} (value redacted)`
              : redactedLine,
          whyItMatters:
            'A committed private credential can be used to impersonate the developer or access paid services; it is both a security and a release-risk problem.',
          suggestedAction:
            'Rotate the credential immediately, remove it from history, and load it from a secret store (or EXPO_PUBLIC only for values that are intentionally public).',
          officialSource: SOURCE,
          line: findLine(text, line.slice(0, 120)) ?? findLine(text, pattern.label),
          semanticKey: `secret:${pattern.id}`,
          valueClass: pattern.id,
        });
        pattern.regex.lastIndex = 0;
      }

      // EXPO_PUBLIC_* with strong private-credential evidence.
      EXPO_PUBLIC_ASSIGNMENT.lastIndex = 0;
      for (const m of text.matchAll(EXPO_PUBLIC_ASSIGNMENT)) {
        const name = m[1] ?? '';
        const value = m[2] ?? '';
        const hit = EXPO_PUBLIC_SECRETS.find(
          (s) => s.namePart.test(name) && s.valuePart.test(value.trim()),
        );
        if (!hit) continue;
        const idx = m.index;
        const line = snippetAround(text, idx);
        out.push({
          title: `EXPO_PUBLIC variable contains a private credential (${hit.provider})`,
          severity: effectiveSeverity('ERROR', ctx.config, 'ARD006'),
          confidence: 'HIGH',
          category: 'secret',
          file: file.path,
          evidence: redactAssignment(line),
          whyItMatters:
            'EXPO_PUBLIC_* values are embedded in the client bundle. A private provider credential must never be shipped this way.',
          suggestedAction: `Move the ${hit.provider} credential to a server-side secret and rotate the exposed value.`,
          officialSource: SOURCE,
          line: findLine(text, line.trim().slice(0, 120)),
          semanticKey: `secret:expo-public:${hit.provider.toLowerCase()}`,
          valueClass: `expo-public:${hit.provider.toLowerCase()}`,
        });
      }
    }
    return out;
  },
};

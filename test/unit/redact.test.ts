import { describe, expect, it } from 'vitest';
import { redact, redactAssignment } from '../../src/util/redact';

describe('secret redaction', () => {
  it('redacts PEM private key blocks', () => {
    const { text, count } = redact(
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n',
    );
    expect(text).not.toContain('MIIEvQIBADAN');
    expect(text).toContain('<redacted>');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts OpenAI and Stripe secret keys but not public keys', () => {
    const openai = redact('key=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890-ABCDEF');
    expect(openai.text).toContain('<redacted>');
    const stripe = redact('stripe sk_live_1234567890abcdefghijklmn');
    expect(stripe.text).toContain('<redacted>');
    const publishable = redact('pk_live_1234567890abcdefghijklmn');
    expect(publishable.text).toContain('pk_live_1234567890abcdefghijklmn');
    expect(publishable.count).toBe(0);
  });

  it('redacts AWS keys and GitHub tokens', () => {
    expect(redact('AKIAIOSFODNN7EXAMPLE').text).toContain('<redacted>');
    expect(redact('aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY').text).toContain(
      '<redacted>',
    );
    expect(redact('ghp_123456789012345678901234567890123456').text).toContain('<redacted>');
  });

  it('redactAssignment keeps the variable name and redacts the value', () => {
    const out = redactAssignment(
      'EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890-ABCDEF',
    );
    expect(out).toContain('EXPO_PUBLIC_OPENAI_API_KEY');
    expect(out).toContain('<redacted>');
    expect(out).not.toContain('sk-proj-');
  });

  it('does not redact ordinary strings', () => {
    const { text, count } = redact('const appName = "Example";');
    expect(count).toBe(0);
    expect(text).toBe('const appName = "Example";');
  });
});

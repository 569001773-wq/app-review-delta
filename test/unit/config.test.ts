import { describe, expect, it } from 'vitest';
import { configFromText, isIgnoreActive } from '../../src/config/load';
import { ConfigError } from '../../src/config/schema';

describe('config parsing', () => {
  it('parses a full configuration', () => {
    const cfg = configFromText(`
fail-on: warning
rules:
  ARD001:
    enabled: true
  ARD004:
    severity: INFO
exclude-paths:
  - '**/Pods/**'
ignore:
  - rule: ARD005
    path: 'ios/**'
    reason: 'Background audio is intentional.'
    expires: '2026-12-01'
privacy-manifest:
  reason-code-mode: lenient
max-file-size-bytes: 1048576
`);
    expect(cfg.failOn).toBe('warning');
    expect(cfg.rules.ARD004?.severity).toBe('INFO');
    expect(cfg.ignore[0]?.reason).toContain('intentional');
    expect(cfg.maxFileSizeBytes).toBe(1048576);
  });

  it('rejects unknown rule ids', () => {
    expect(() => configFromText('rules:\n  ARD999:\n    enabled: true\n')).toThrow(ConfigError);
  });

  it('requires a reason on ignore entries', () => {
    expect(() => configFromText('ignore:\n  - rule: ARD005\n')).toThrow(ConfigError);
  });

  it('rejects invalid expires dates', () => {
    expect(() =>
      configFromText("ignore:\n  - rule: ARD005\n    reason: ok\n    expires: 'not-a-date'\n"),
    ).toThrow(ConfigError);
  });

  it('rejects invalid fail-on values', () => {
    expect(() => configFromText('fail-on: sometimes\n')).toThrow(ConfigError);
  });

  it('rejects path traversal in ignore paths', () => {
    expect(() =>
      configFromText("ignore:\n  - rule: ARD005\n    reason: ok\n    path: '../etc/passwd'\n"),
    ).toThrow(ConfigError);
  });
});

describe('suppression expiry', () => {
  const entry = { rule: 'ARD005', path: 'ios/**', reason: 'intentional' };
  it('is active without expiry', () => {
    expect(isIgnoreActive({ ...entry })).toBe(true);
  });
  it('is active before expiry', () => {
    expect(isIgnoreActive({ ...entry, expires: '2099-01-01' }, new Date('2026-08-10'))).toBe(true);
  });
  it('expires on the expiry date', () => {
    expect(isIgnoreActive({ ...entry, expires: '2026-08-10' }, new Date('2026-08-10'))).toBe(false);
  });
  it('is inactive after expiry', () => {
    expect(isIgnoreActive({ ...entry, expires: '2026-01-01' }, new Date('2026-08-10'))).toBe(false);
  });
});

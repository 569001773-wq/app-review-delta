import { describe, expect, it } from 'vitest';
import { staticAppConfigJs, buildStaticExpoConfig } from '../../src/parsers/expoConfig';

describe('static Expo config extraction', () => {
  it('resolves a plain literal object', () => {
    const r = staticAppConfigJs(
      `export default { name: 'My App', slug: 'my-app', ios: { infoPlist: { NSMicrophoneUsageDescription: 'For recording' } } }`,
      'app.config.js',
    );
    expect(r.resolved).toBe(true);
    expect(r.unresolvedFields).toEqual([]);
    expect(r.object?.ios).toEqual({ infoPlist: { NSMicrophoneUsageDescription: 'For recording' } });
  });

  it('resolves export default defineConfig(...)', () => {
    const r = staticAppConfigJs(
      `import { defineConfig } from 'expo/config';
       export default defineConfig({ name: 'A', slug: 'a', ios: { bundleIdentifier: 'com.a' } });`,
      'app.config.ts',
    );
    expect(r.resolved).toBe(true);
    expect(r.object?.name).toBe('A');
  });

  it('does NOT unwrap arbitrary wrapper functions', () => {
    const r = staticAppConfigJs(
      `export default someWrapper({ name: 'A', ios: { bundleIdentifier: 'com.a' } });`,
      'app.config.ts',
    );
    expect(r.resolved).toBe(false);
  });

  it('does NOT unwrap defineConfig unless it is imported from expo', () => {
    const r = staticAppConfigJs(
      `import { defineConfig } from 'some-other-lib';
       export default defineConfig({ name: 'A', slug: 'a' });`,
      'app.config.ts',
    );
    expect(r.resolved).toBe(false);
  });

  it('resolves module.exports', () => {
    const r = staticAppConfigJs(`module.exports = { name: 'B', slug: 'b' };`, 'app.config.js');
    expect(r.resolved).toBe(true);
    expect(r.object?.slug).toBe('b');
  });

  it('marks dynamic values unresolved and does not execute them', () => {
    const r = staticAppConfigJs(
      `const fs = require('fs');
       export default { ios: { infoPlist: { NSMicrophoneUsageDescription: fs.readFileSync('/etc/hostname', 'utf8') } } };`,
      'app.config.js',
    );
    expect(r.resolved).toBe(true);
    expect(r.unresolvedFields).toContain('ios.infoPlist.NSMicrophoneUsageDescription');
    // Safe siblings survive; the dynamic leaf is dropped from the partial value.
    expect(r.object?.ios).toEqual({ infoPlist: {} });
  });

  it('keeps safe siblings when only one field is dynamic', () => {
    const r = staticAppConfigJs(
      `export default { name: 'C', ios: { bundleIdentifier: 'com.c', infoPlist: (() => ({ ATS: true }))() } };`,
      'app.config.js',
    );
    expect(r.resolved).toBe(true);
    expect(r.object?.name).toBe('C');
    expect(r.object?.ios).toEqual({ bundleIdentifier: 'com.c' });
    expect(r.unresolvedFields).toContain('ios.infoPlist');
  });

  it('handles TypeScript syntax', () => {
    const r = staticAppConfigJs(
      `import { ExpoConfig, ConfigContext } from 'expo/config';
       export default (ctx: ConfigContext): ExpoConfig => { return { name: 'D', slug: 'd' }; };`,
      'app.config.ts',
    );
    // Top-level arrow function: not statically resolvable.
    expect(r.resolved).toBe(false);
  });

  it('builds merged static config from app.json and app.config.js', () => {
    const cfg = buildStaticExpoConfig([
      {
        path: 'app.json',
        text: JSON.stringify({ expo: { name: 'Base', ios: { bundleIdentifier: 'com.base' } } }),
      },
      {
        path: 'app.config.js',
        text: `export default { expo: { ios: { infoPlist: { NSMicrophoneUsageDescription: 'Mic' } } } }`,
      },
    ]);
    expect(cfg.dynamic).toBe(false);
    expect(cfg.expo?.name).toBe('Base');
    expect(cfg.expo?.ios).toEqual({
      bundleIdentifier: 'com.base',
      infoPlist: { NSMicrophoneUsageDescription: 'Mic' },
    });
  });

  it('marks config dynamic when the top level is not a literal object', () => {
    const cfg = buildStaticExpoConfig([
      { path: 'app.config.js', text: `import x from './x'; export default x;` },
    ]);
    expect(cfg.dynamic).toBe(true);
    expect(cfg.unresolvedFields).toContain('*');
  });
});

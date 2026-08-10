import { describe, expect, it } from 'vitest';
import { analyzeFixture, cleanExpoApp } from '../helpers';
import { defaultConfig } from '../../src/config/load';

describe('baseline differential engine', () => {
  it('hides findings that already exist in base even when the line moves', () => {
    const base = cleanExpoApp();
    base['ios/Example/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict></plist>`;
    const head = { ...base };
    // Same value, moved to a different position in the file (line shift).
    head['ios/Example/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key>
  <string>Example</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict></plist>`;
    const result = analyzeFixture(base, head);
    expect(result.findings.filter((f) => f.ruleId === 'ARD003')).toHaveLength(0);
    expect(result.preExistingCount).toBeGreaterThan(0);
  });

  it('reports a newly introduced ATS exception as a new finding', () => {
    const base = cleanExpoApp();
    const head = { ...base };
    head['ios/Example/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict></plist>`;
    const result = analyzeFixture(base, head);
    const ats = result.findings.filter((f) => f.ruleId === 'ARD003');
    expect(ats).toHaveLength(1);
    expect(ats[0]?.severity).toBe('WARNING');
    expect(ats[0]?.introducedByPR).toBe(true);
  });

  it('does not report formatting-only changes as new findings', () => {
    const base = cleanExpoApp();
    const head = { ...base };
    // Reformat package.json (indentation change) and reorder app.json keys.
    head['package.json'] = JSON.stringify(JSON.parse(base['package.json']!), null, 4);
    head['app.json'] = JSON.stringify(
      {
        expo: {
          ios: { supportsTablet: true, bundleIdentifier: 'com.example.clean' },
          version: '1.0.0',
          slug: 'clean-expo-app',
          name: 'Clean Expo App',
        },
      },
      null,
      2,
    );
    const result = analyzeFixture(base, head);
    expect(result.findings).toHaveLength(0);
  });

  it('applies suppressions with a reason and expiry', () => {
    const base = cleanExpoApp();
    const head = { ...base };
    head['ios/Example/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>UIBackgroundModes</key>
  <array><string>audio</string></array>
</dict></plist>`;
    const active = analyzeFixture(base, head, {
      ...defaultConfig(),
      ignore: [{ rule: 'ARD005', path: 'ios/**', reason: 'Background audio is intentional.' }],
    });
    expect(active.findings.filter((f) => f.ruleId === 'ARD005')).toHaveLength(0);
    expect(active.hiddenBySuppressionCount).toBeGreaterThan(0);

    const expired = analyzeFixture(base, head, {
      ...defaultConfig(),
      ignore: [
        {
          rule: 'ARD005',
          path: 'ios/**',
          reason: 'Background audio is intentional.',
          expires: '2026-01-01',
        },
      ],
    });
    expect(expired.findings.filter((f) => f.ruleId === 'ARD005')).toHaveLength(1);
  });

  it('supports severity overrides per rule', () => {
    const base = cleanExpoApp();
    const head = { ...base };
    head['ios/Example/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict></plist>`;
    const cfg = defaultConfig();
    cfg.rules.ARD003 = { severity: 'INFO' };
    const result = analyzeFixture(base, head, cfg);
    expect(result.findings.find((f) => f.ruleId === 'ARD003')?.severity).toBe('INFO');
  });

  it('applies severity overrides to every rule (ARD002/ARD006/ARD007/ARD008)', () => {
    const cfg = defaultConfig();
    cfg.rules.ARD002 = { severity: 'INFO' };
    cfg.rules.ARD006 = { severity: 'INFO' };
    cfg.rules.ARD007 = { severity: 'WARNING' };
    cfg.rules.ARD008 = { severity: 'WARNING' };

    const base = cleanExpoApp();
    const head = {
      ...base,
      'package.json': JSON.stringify({
        name: 'x',
        scripts: {},
        dependencies: { expo: '~55.0.0', 'react-native-purchases': '^8.0.0' },
      }),
      'ios/Example/PrivacyInfo.xcprivacy': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyTracking</key><true/>
</dict></plist>`,
      'ios/keys/AuthKey_TEST.p8':
        '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n',
      'app.config.ts': `import fs from 'fs';
export default { expo: { ios: { infoPlist: { NSMicrophoneUsageDescription: fs.readFileSync('x', 'utf8') } } } };`,
    };
    const result = analyzeFixture(base, head, cfg);
    expect(result.findings.find((f) => f.ruleId === 'ARD002')).toBeUndefined();
    expect(result.findings.find((f) => f.ruleId === 'ARD006')?.severity).toBe('INFO');
    expect(result.findings.find((f) => f.ruleId === 'ARD007')?.severity).toBe('WARNING');
    expect(result.findings.find((f) => f.ruleId === 'ARD008')?.severity).toBe('WARNING');
  });

  it('reports scanner-policy changes as ARD009 INFO and still uses BASE policy', () => {
    const base = cleanExpoApp();
    base['.reviewdelta.yml'] = 'fail-on: warning\n';
    const head = { ...base };
    head['.reviewdelta.yml'] = 'fail-on: never\nrules:\n  ARD001:\n    enabled: false\n';
    // The engine receives the BASE policy (the Action resolves it that way);
    // the ARD009 finding is informational.
    const cfg = defaultConfig();
    const result = analyzeFixture(base, head, cfg);
    const ard009 = result.findings.filter((f) => f.ruleId === 'ARD009');
    expect(ard009).toHaveLength(1);
    expect(ard009[0]?.severity).toBe('INFO');
    expect(ard009[0]?.evidence).toContain('BASE policy');
  });

  it('does not report ARD009 when the policy is unchanged', () => {
    const base = cleanExpoApp();
    base['.reviewdelta.yml'] = 'fail-on: warning\n';
    const result = analyzeFixture(base, { ...base });
    expect(result.findings.filter((f) => f.ruleId === 'ARD009')).toHaveLength(0);
  });
});

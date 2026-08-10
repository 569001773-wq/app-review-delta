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
});

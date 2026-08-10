import { describe, expect, it } from 'vitest';
import {
  analyzeFixture,
  cleanExpoApp,
  findingsByRule,
  VALID_INFO_PLIST,
  VALID_PRIVACY_MANIFEST,
} from '../helpers';
import { defaultConfig } from '../../src/config/load';

describe('rule integration fixtures', () => {
  it('1. clean Expo app produces no findings', () => {
    const base = cleanExpoApp();
    const result = analyzeFixture(base, { ...base });
    expect(result.findings).toHaveLength(0);
  });

  it('2. invalid privacy manifest produces ARD001 ERROR', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyTracking</key><true/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array><dict>
    <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    <key>NSPrivacyAccessedAPITypeReasons</key><string>CA92.1</string>
  </dict></array>
</dict></plist>`,
    };
    const result = analyzeFixture(null, head);
    const ard001 = findingsByRule(result, 'ARD001');
    expect(ard001.some((f) => f.severity === 'ERROR' && f.title.includes('tracking-domain'))).toBe(
      true,
    );
    expect(ard001.some((f) => f.severity === 'ERROR' && f.title.includes('array of strings'))).toBe(
      true,
    );
  });

  it('3. valid privacy manifest produces no ARD001 ERROR', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': VALID_PRIVACY_MANIFEST,
    };
    const result = analyzeFixture(null, head);
    expect(findingsByRule(result, 'ARD001')).toHaveLength(0);
  });

  it('4. tracking=true with valid domains passes ARD001', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyTracking</key><true/>
  <key>NSPrivacyTrackingDomains</key>
  <array><string>example.com</string><string>ads.example.org</string></array>
</dict></plist>`,
    };
    const result = analyzeFixture(null, head);
    expect(findingsByRule(result, 'ARD001').filter((f) => f.severity === 'ERROR')).toHaveLength(0);
  });

  it('5. tracking=true without domains is ARD001 ERROR', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyTracking</key><true/>
</dict></plist>`,
    };
    const result = analyzeFixture(null, head);
    expect(
      findingsByRule(result, 'ARD001').some((f) =>
        f.title.includes('without a tracking-domain list'),
      ),
    ).toBe(true);
  });

  it('6. privacy declaration removed between base/head is ARD002 WARNING', () => {
    const base = {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array><dict>
    <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>
  </dict></array>
</dict></plist>`,
    };
    const head = {
      ...base,
      'ios/Example/PrivacyInfo.xcprivacy': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array></array>
</dict></plist>`,
    };
    const result = analyzeFixture(base, head);
    expect(findingsByRule(result, 'ARD002').some((f) => f.title.includes('category removed'))).toBe(
      true,
    );
  });

  it('7. ATS exception added is ARD003 WARNING', () => {
    const base = cleanExpoApp();
    const head = {
      ...base,
      'ios/Example/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict></plist>`,
    };
    const result = analyzeFixture(base, head);
    const ats = findingsByRule(result, 'ARD003');
    expect(ats).toHaveLength(1);
    expect(ats[0]?.severity).toBe('WARNING');
    expect(ats[0]?.baseState).toBe('(not present)');
    expect(ats[0]?.headState).toBe('true');
  });

  it('8. ATS exception already existing in base is not new', () => {
    const base = cleanExpoApp();
    base['ios/Example/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict></plist>`;
    const result = analyzeFixture(base, { ...base });
    expect(findingsByRule(result, 'ARD003')).toHaveLength(0);
    expect(result.preExistingCount).toBeGreaterThan(0);
  });

  it('9. microphone purpose string added with good wording is INFO surface only', () => {
    const base = cleanExpoApp();
    const head = {
      ...base,
      'ios/Example/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSMicrophoneUsageDescription</key>
  <string>Record voice notes so you can review them later.</string>
</dict></plist>`,
    };
    const result = analyzeFixture(base, head);
    const ard004 = findingsByRule(result, 'ARD004');
    expect(ard004.some((f) => f.title.includes('Permission surface introduced'))).toBe(true);
    expect(ard004.filter((f) => f.severity === 'WARNING')).toHaveLength(0);
  });

  it('10. empty microphone purpose string is ARD004 WARNING', () => {
    const base = cleanExpoApp();
    const head = {
      ...base,
      'ios/Example/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSMicrophoneUsageDescription</key><string></string>
</dict></plist>`,
    };
    const result = analyzeFixture(base, head);
    expect(
      findingsByRule(result, 'ARD004').some(
        (f) => f.severity === 'WARNING' && f.title.includes('is empty'),
      ),
    ).toBe(true);
  });

  it('11. good explicit purpose string is not flagged as placeholder/generic', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/Example/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSMicrophoneUsageDescription</key>
  <string>Record audio clips for your guided meditation sessions.</string>
</dict></plist>`,
    };
    const result = analyzeFixture(null, head);
    const ard004 = findingsByRule(result, 'ARD004');
    expect(ard004.filter((f) => f.severity === 'WARNING')).toHaveLength(0);
    expect(ard004.some((f) => f.title.includes('Permission surface introduced'))).toBe(true);
  });

  it('12. background audio mode added is reported', () => {
    const base = cleanExpoApp();
    const head = {
      ...base,
      'ios/Example/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>UIBackgroundModes</key>
  <array><string>audio</string></array>
</dict></plist>`,
    };
    const result = analyzeFixture(base, head);
    const ard005 = findingsByRule(result, 'ARD005');
    expect(ard005).toHaveLength(1);
    expect(ard005[0]?.title).toContain('audio');
    expect(ard005[0]?.severity).toBe('INFO');
  });

  it('13. background mode unchanged is not reported', () => {
    const base = cleanExpoApp();
    base['ios/Example/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>UIBackgroundModes</key>
  <array><string>audio</string></array>
</dict></plist>`;
    const result = analyzeFixture(base, { ...base });
    expect(findingsByRule(result, 'ARD005')).toHaveLength(0);
  });

  it('14. obvious private key committed is ARD006 ERROR with redacted evidence', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/keys/AuthKey_ABCDE12345.p8': `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7VJTUt9Us8cKj
MzEfYyjiWA4R4M2LBK9WDWT7FYBUIXvHZI4nT49KncYVH
-----END PRIVATE KEY-----
`,
    };
    const result = analyzeFixture(null, head);
    const ard006 = findingsByRule(result, 'ARD006');
    expect(ard006).toHaveLength(1);
    expect(ard006[0]?.severity).toBe('ERROR');
    expect(ard006[0]?.evidence).not.toContain('MIIEvQIBADAN');
    expect(ard006[0]?.evidence).toMatch(/<redacted>|value redacted/);
  });

  it('15. EXPO_PUBLIC public client identifier is NOT flagged', () => {
    const head = {
      ...cleanExpoApp(),
      'package.json': JSON.stringify({
        name: 'x',
        scripts: {},
        dependencies: { expo: '~55.0.0' },
      }),
      '.env':
        'EXPO_PUBLIC_GOOGLE_API_KEY=AIzaSyD-9tSrke72PzQk2K2J5V5wYqVtqOjSAMPLE\nEXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_1234567890\n',
    };
    const result = analyzeFixture(null, head);
    expect(findingsByRule(result, 'ARD006')).toHaveLength(0);
  });

  it('15b. RevenueCat public API key (appl_) is NOT flagged', () => {
    const head = {
      ...cleanExpoApp(),
      '.env': 'EXPO_PUBLIC_REVENUECAT_API_KEY=appl_ABC123def456GHI789jkl012mno345p\n',
    };
    const result = analyzeFixture(null, head);
    expect(findingsByRule(result, 'ARD006')).toHaveLength(0);
  });

  it('21. privacy manifest removed entirely is ARD002 WARNING', () => {
    const base = {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': VALID_PRIVACY_MANIFEST,
    };
    const head = cleanExpoApp();
    const result = analyzeFixture(base, head);
    expect(findingsByRule(result, 'ARD002').some((f) => f.title.includes('removed'))).toBe(true);
  });

  it('22. collected-data entries missing required fields are ARD001 ERROR', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeName</string>
    </dict>
  </array>
</dict></plist>`,
    };
    const result = analyzeFixture(null, head);
    const ard001 = findingsByRule(result, 'ARD001');
    expect(
      ard001.some((f) => f.title.includes('NSPrivacyCollectedDataTypeLinked is missing')),
    ).toBe(true);
    expect(
      ard001.some((f) => f.title.includes('NSPrivacyCollectedDataTypeTracking is missing')),
    ).toBe(true);
    expect(
      ard001.some((f) => f.title.includes('NSPrivacyCollectedDataTypePurposes is missing')),
    ).toBe(true);
  });

  it('23. undocumented collection purpose is WARNING (lenient) / ERROR (strict)', () => {
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeName</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><false/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>My Custom Purpose</string></array>
    </dict>
  </array>
</dict></plist>`;
    const head = { ...cleanExpoApp(), 'ios/Example/PrivacyInfo.xcprivacy': manifest };
    const lenient = analyzeFixture(null, head);
    expect(
      findingsByRule(lenient, 'ARD001').some(
        (f) => f.title.includes('not in the documented set') && f.severity === 'WARNING',
      ),
    ).toBe(true);
    const strictCfg = defaultConfig();
    strictCfg.reasonCodeMode = 'strict';
    const strict = analyzeFixture(null, head, strictCfg);
    expect(
      findingsByRule(strict, 'ARD001').some(
        (f) => f.title.includes('not in the documented set') && f.severity === 'ERROR',
      ),
    ).toBe(true);
  });

  it('24. non-string permission value is ARD004 ERROR', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/Example/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSMicrophoneUsageDescription</key><true/>
</dict></plist>`,
    };
    const result = analyzeFixture(null, head);
    expect(
      findingsByRule(result, 'ARD004').some(
        (f) => f.severity === 'ERROR' && f.title.includes('must be a string'),
      ),
    ).toBe(true);
  });

  it('25. service plists such as GoogleService-Info.plist are not treated as Info.plist', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/App/GoogleService-Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSMicrophoneUsageDescription</key>
  <string></string>
</dict></plist>`,
    };
    const result = analyzeFixture(null, head);
    expect(findingsByRule(result, 'ARD004')).toHaveLength(0);
  });

  it('26. new calendar/reminders permission keys are tracked', () => {
    const head = {
      ...cleanExpoApp(),
      'ios/Example/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSCalendarsFullAccessUsageDescription</key>
  <string>Let you add events to your calendar.</string>
  <key>NSRemindersFullAccessUsageDescription</key>
  <string>Let you manage your reminders.</string>
</dict></plist>`,
    };
    const result = analyzeFixture(null, head);
    const ard004 = findingsByRule(result, 'ARD004');
    expect(ard004.some((f) => f.title.includes('NSCalendarsFullAccessUsageDescription'))).toBe(
      true,
    );
    expect(ard004.some((f) => f.title.includes('NSRemindersFullAccessUsageDescription'))).toBe(
      true,
    );
  });

  it('16. EXPO_PUBLIC genuinely private provider credential IS flagged', () => {
    const head = {
      ...cleanExpoApp(),
      '.env': 'EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890-ABCDEFGH\n',
    };
    const result = analyzeFixture(null, head);
    const ard006 = findingsByRule(result, 'ARD006');
    const expoFinding = ard006.find((f) => f.semanticKey === 'secret:expo-public:openai');
    expect(expoFinding).toBeTruthy();
    expect(expoFinding?.severity).toBe('ERROR');
    expect(expoFinding?.evidence).toContain('EXPO_PUBLIC_OPENAI_API_KEY');
    expect(expoFinding?.evidence).not.toContain('sk-proj-');
    // The raw pattern must not double-report the same credential.
    expect(ard006.filter((f) => f.semanticKey === 'secret:openai-key')).toHaveLength(0);
  });

  it('17. purchase SDK added is INFO only', () => {
    const base = cleanExpoApp();
    const head = {
      ...base,
      'package.json': JSON.stringify({
        name: 'x',
        scripts: {},
        dependencies: {
          expo: '~55.0.0',
          'react-native-purchases': '^8.0.0',
        },
      }),
    };
    const result = analyzeFixture(base, head);
    const ard007 = findingsByRule(result, 'ARD007');
    expect(ard007).toHaveLength(1);
    expect(ard007[0]?.severity).toBe('INFO');
    expect(ard007[0]?.title).toContain('purchases');
  });

  it('18. dynamic app.config.ts produces an ARD008 coverage gap', () => {
    const base = cleanExpoApp();
    const head = {
      ...base,
      'app.config.ts': `import fs from 'fs';
export default { expo: { ios: { infoPlist: { NSMicrophoneUsageDescription: fs.readFileSync('x', 'utf8') } } } };`,
    };
    const result = analyzeFixture(base, head);
    const ard008 = findingsByRule(result, 'ARD008');
    expect(ard008.some((f) => f.evidence.includes('infoPlist'))).toBe(true);
  });

  it('19. finding moved to a different line must not become new', () => {
    const base = cleanExpoApp();
    base['ios/Example/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSMicrophoneUsageDescription</key><string></string>
</dict></plist>`;
    const head = {
      ...base,
      'ios/Example/Info.plist': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key>
  <string>Example</string>
  <key>NSMicrophoneUsageDescription</key><string></string>
</dict></plist>`,
    };
    const result = analyzeFixture(base, head);
    expect(result.findings).toHaveLength(0);
    expect(result.preExistingCount).toBeGreaterThan(0);
  });

  it('20. file formatting change only must not become new', () => {
    const base = cleanExpoApp();
    const head = { ...base };
    head['ios/Example/Info.plist'] = VALID_INFO_PLIST.replace(
      '<key>CFBundleDisplayName</key>\n  <string>Example</string>',
      '<string>Example</string>\n  <key>CFBundleDisplayName</key>',
    );
    const result = analyzeFixture(base, head);
    expect(result.findings).toHaveLength(0);
  });

  it('strict reason-code mode escalates unknown reason codes to ERROR', () => {
    const cfg = defaultConfig();
    cfg.reasonCodeMode = 'strict';
    const head = {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array><dict>
    <key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string>
    <key>NSPrivacyAccessedAPITypeReasons</key><array><string>ZZ99.9</string></array>
  </dict></array>
</dict></plist>`,
    };
    const strictResult = analyzeFixture(null, head, cfg);
    expect(
      findingsByRule(strictResult, 'ARD001').some(
        (f) => f.title.includes('not in the documented set') && f.severity === 'ERROR',
      ),
    ).toBe(true);
    const lenientResult = analyzeFixture(null, head);
    expect(
      findingsByRule(lenientResult, 'ARD001').some(
        (f) => f.title.includes('not in the documented set') && f.severity === 'WARNING',
      ),
    ).toBe(true);
  });
});

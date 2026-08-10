import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { staticAppConfigJs } from '../../src/parsers/expoConfig';
import { analyzeFixture, cleanExpoApp } from '../helpers';
import { parsePlist } from '../../src/parsers/plist';
import { configFromText } from '../../src/config/load';

const sentinelName = 'app-review-delta-SENTINEL.txt';
const sentinelPath = path.join(os.tmpdir(), sentinelName);

const MALICIOUS_APP_CONFIG_TS = `import * as fs from 'fs';
export default {
  expo: {
    name: 'Evil',
    ios: {
      infoPlist: (() => {
        fs.writeFileSync(${JSON.stringify(sentinelPath)}, 'pwned');
        return { NSMicrophoneUsageDescription: 'pwned' };
      })(),
    },
  },
};`;

const MALICIOUS_PACKAGE_JSON = JSON.stringify({
  name: 'evil',
  scripts: {
    postinstall: `node -e "require('fs').writeFileSync(${JSON.stringify(sentinelPath)}, 'pwned')"`,
  },
  dependencies: {
    expo: '~55.0.0',
    'react-native-purchases': '^8.0.0',
  },
});

const MALICIOUS_CONFIG_PLUGIN = `const evil = require('./evil-plugin');
export default {
  expo: {
    plugins: [evil, ['expo-camera', { cameraPermission: 'x' }]],
    ios: { bundleIdentifier: 'com.evil' },
  },
};`;

describe('security fixtures: target code is never executed', () => {
  beforeAll(() => {
    if (fs.existsSync(sentinelPath)) fs.unlinkSync(sentinelPath);
  });
  afterAll(() => {
    if (fs.existsSync(sentinelPath)) fs.unlinkSync(sentinelPath);
  });

  it('malicious app.config.ts is parsed as data, not executed', () => {
    const r = staticAppConfigJs(MALICIOUS_APP_CONFIG_TS, 'app.config.ts');
    // The infoPlist field is dynamic -> unresolved, and NO sentinel file appears.
    expect(r.resolved).toBe(true);
    expect(r.unresolvedFields).toContain('expo.ios.infoPlist');
    expect(fs.existsSync(sentinelPath)).toBe(false);
  });

  it('malicious package.json postinstall/scripts are never run', () => {
    const result = analyzeFixture(null, {
      'package.json': MALICIOUS_PACKAGE_JSON,
      'app.json': '{}',
    });
    // ARD007 still works on dependency data.
    expect(result.findings.some((f) => f.ruleId === 'ARD007')).toBe(true);
    expect(fs.existsSync(sentinelPath)).toBe(false);
  });

  it('malicious config plugin is treated as unresolved data', () => {
    const result = analyzeFixture(null, {
      'app.config.js': MALICIOUS_CONFIG_PLUGIN,
      'package.json': '{}',
    });
    expect(result.findings.some((f) => f.ruleId === 'ARD008')).toBe(true);
    expect(fs.existsSync(sentinelPath)).toBe(false);
  });

  it('malformed huge plist does not hang or crash the analyzer', () => {
    const depth = 4000;
    const xml =
      '<plist version="1.0">' + '<dict>'.repeat(depth) + '</dict>'.repeat(depth) + '</plist>';
    const result = analyzeFixture(null, {
      ...cleanExpoApp(),
      'ios/Example/PrivacyInfo.xcprivacy': xml,
    });
    // Either a parse error (ARD001) or a resolved structure; the point is no
    // hang, no crash, no sentinel.
    expect(result.findings.length).toBeGreaterThanOrEqual(0);
    expect(fs.existsSync(sentinelPath)).toBe(false);
  });

  it('attacker-controlled __proto__ keys do not pollute objects or inject values', () => {
    const plist = parsePlist(
      '<plist version="1.0"><dict><key>__proto__</key><dict><key>NSPrivacyTracking</key><true/></dict></dict></plist>',
    );
    expect(plist.ok).toBe(true);
    const root = plist.value as Record<string, unknown>;
    // The injected key must be an own property, not a prototype mutation, and
    // must not be reachable through normal lookup.
    expect(root['NSPrivacyTracking']).toBeUndefined();
    expect(Object.getPrototypeOf(root)).toBeNull();

    const expo = staticAppConfigJs(
      `export default { expo: { __proto__: { ios: { infoPlist: { NSMicrophoneUsageDescription: 'x' } } } } }`,
      'app.config.js',
    );
    expect((expo.object as Record<string, unknown> | undefined)?.['ios']).toBeUndefined();
    if (expo.object) expect(Object.getPrototypeOf(expo.object)).toBeNull();

    const cfg = configFromText('sdk-categories:\n  __proto__:\n    - evil\n');
    expect((cfg.sdkCategories as Record<string, unknown>)['evil']).toBeUndefined();
  });
});

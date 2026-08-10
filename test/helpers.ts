import { AppReviewConfig, defaultConfig } from '../src/config/load';
import { analyze } from '../src/engine';
import { Snapshot, SnapshotFile } from '../src/types';
import { decodeUtf8 } from '../src/util/paths';

export function snapshotFromFiles(ref: string, files: Record<string, string>): Snapshot {
  const map = new Map<string, SnapshotFile>();
  for (const [path, text] of Object.entries(files)) {
    const content = new TextEncoder().encode(text);
    map.set(path, {
      path,
      size: content.byteLength,
      content,
      text,
      source: 'git',
    });
  }
  return { ref, files: map, coverage: { gaps: [], notes: [] } };
}

export function analyzeFixture(
  baseFiles: Record<string, string> | null,
  headFiles: Record<string, string>,
  config: AppReviewConfig = defaultConfig(),
) {
  const base = baseFiles ? snapshotFromFiles('base', baseFiles) : null;
  const head = snapshotFromFiles('head', headFiles);
  return analyze(base, head, config, { version: 'test' });
}

export function findingsByRule(result: ReturnType<typeof analyze>, ruleId: string) {
  return result.findings.filter((f) => f.ruleId === ruleId);
}

export function redactedText(evidence: string): string {
  return decodeUtf8(new TextEncoder().encode(evidence));
}

export const VALID_PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>`;

export const VALID_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Example</string>
</dict>
</plist>`;

export const CLEAN_PACKAGE_JSON = JSON.stringify(
  {
    name: 'clean-expo-app',
    version: '1.0.0',
    scripts: { start: 'expo start' },
    dependencies: {
      expo: '~55.0.0',
      react: '19.1.0',
      'react-native': '0.81.0',
    },
  },
  null,
  2,
);

export const CLEAN_APP_JSON = JSON.stringify(
  {
    expo: {
      name: 'Clean Expo App',
      slug: 'clean-expo-app',
      version: '1.0.0',
      ios: {
        bundleIdentifier: 'com.example.clean',
        supportsTablet: true,
      },
    },
  },
  null,
  2,
);

export function cleanExpoApp(): Record<string, string> {
  return {
    'package.json': CLEAN_PACKAGE_JSON,
    'app.json': CLEAN_APP_JSON,
    'ios/Example/Info.plist': VALID_INFO_PLIST,
  };
}

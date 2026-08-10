import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildGitSnapshots } from '../../src/git/gitSnapshot';
import { analyze } from '../../src/engine';
import { defaultConfig } from '../../src/config/load';
import {
  VALID_INFO_PLIST,
  CLEAN_PACKAGE_JSON,
  CLEAN_APP_JSON,
  VALID_PRIVACY_MANIFEST,
} from '../helpers';

function git(repo: string, ...args: string[]): void {
  execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe', encoding: 'utf8' });
}

function write(repo: string, rel: string, content: string): void {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

function commit(repo: string, message: string): void {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', message, '--no-verify');
}

function headOf(repo: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

async function runDelta(repo: string, base: string, head: string) {
  const config = defaultConfig();
  const { base: baseSnap, head: headSnap } = await buildGitSnapshots(repo, base, head, config);
  return analyze(baseSnap, headSnap, config, { version: 'canary' });
}

describe('local differential-engine canary (synthetic git repository)', () => {
  // NOTE: this canary exercises the local engine (git snapshots + analyze).
  // External validation of the published Action — GitHubClient, real Compare/
  // PR-files APIs, events, permissions, job summary, annotations, fail
  // behavior — is performed separately against a synthetic consumer
  // repository using the published @v1 tag (documented in the release notes).
  it('reproduces the expected finding lifecycle across PRs A-E and their fixes', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ard-canary-'));
    try {
      git(repo, 'init', '-b', 'main');
      git(repo, 'config', 'user.email', 'canary@example.invalid');
      git(repo, 'config', 'user.name', 'Canary');
      git(repo, 'config', 'commit.gpgsign', 'false');

      // Base commit: clean Expo app.
      write(repo, 'package.json', CLEAN_PACKAGE_JSON);
      write(repo, 'app.json', CLEAN_APP_JSON);
      write(repo, 'ios/Example/Info.plist', VALID_INFO_PLIST);
      commit(repo, 'base: clean expo app');
      const baseSha = headOf(repo);

      // PR A: microphone permission with a clear purpose.
      write(
        repo,
        'ios/Example/Info.plist',
        VALID_INFO_PLIST.replace(
          '</dict>\n</plist>',
          '<key>NSMicrophoneUsageDescription</key>\n  <string>Record voice notes for your sessions.</string>\n</dict>\n</plist>',
        ),
      );
      commit(repo, 'pr-a: add microphone permission');
      const prA = headOf(repo);
      let result = await runDelta(repo, baseSha, prA);
      const aFindings = result.findings.filter((f) => f.ruleId === 'ARD004');
      expect(aFindings.some((f) => f.title.includes('Permission surface introduced'))).toBe(true);
      expect(aFindings.some((f) => f.severity === 'ERROR')).toBe(false);

      // PR B: enable NSAllowsArbitraryLoads.
      write(
        repo,
        'ios/Example/Info.plist',
        VALID_INFO_PLIST.replace(
          '</dict>\n</plist>',
          '<key>NSMicrophoneUsageDescription</key>\n  <string>Record voice notes for your sessions.</string>\n  <key>NSAppTransportSecurity</key>\n  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>\n</dict>\n</plist>',
        ),
      );
      commit(repo, 'pr-b: enable ATS arbitrary loads');
      const prB = headOf(repo);
      result = await runDelta(repo, prA, prB);
      expect(result.findings.filter((f) => f.ruleId === 'ARD003')).toHaveLength(1);

      // PR C: move unrelated code (reorder plist keys) -> zero new findings.
      write(
        repo,
        'ios/Example/Info.plist',
        `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSMicrophoneUsageDescription</key>
  <string>Record voice notes for your sessions.</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsArbitraryLoads</key><true/></dict>
  <key>CFBundleDisplayName</key>
  <string>Example</string>
</dict></plist>`,
      );
      commit(repo, 'pr-c: reorder plist keys');
      const prC = headOf(repo);
      result = await runDelta(repo, prB, prC);
      expect(result.findings).toHaveLength(0);

      // PR D: introduce an invalid privacy manifest.
      write(
        repo,
        'ios/Example/PrivacyInfo.xcprivacy',
        `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>NSPrivacyTracking</key><true/>
</dict></plist>`,
      );
      commit(repo, 'pr-d: add invalid privacy manifest');
      const prD = headOf(repo);
      result = await runDelta(repo, prC, prD);
      expect(result.findings.some((f) => f.ruleId === 'ARD001' && f.severity === 'ERROR')).toBe(
        true,
      );

      // PR E: commit an obvious private key fixture.
      write(
        repo,
        'ios/keys/AuthKey_DEMO123456.p8',
        `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7VJTUt9Us8cKj
MzEfYyjiWA4R4M2LBK9WDWT7FYBUIXvHZI4nT49KncYVH
-----END PRIVATE KEY-----
`,
      );
      commit(repo, 'pr-e: commit private key');
      const prE = headOf(repo);
      result = await runDelta(repo, prD, prE);
      const secretFindings = result.findings.filter((f) => f.ruleId === 'ARD006');
      expect(secretFindings).toHaveLength(1);
      expect(secretFindings[0]?.severity).toBe('ERROR');
      expect(secretFindings[0]?.evidence).toMatch(/redacted/i);

      // Fixes: each PR is reverted and the finding disappears.
      // Fix E: remove the private key.
      fs.rmSync(path.join(repo, 'ios', 'keys', 'AuthKey_DEMO123456.p8'));
      commit(repo, 'fix-e: remove private key');
      const fixE = headOf(repo);
      result = await runDelta(repo, prD, fixE);
      expect(result.findings.filter((f) => f.ruleId === 'ARD006')).toHaveLength(0);

      // Fix D: replace the invalid manifest with a valid one.
      write(repo, 'ios/Example/PrivacyInfo.xcprivacy', VALID_PRIVACY_MANIFEST);
      commit(repo, 'fix-d: valid privacy manifest');
      const fixD = headOf(repo);
      result = await runDelta(repo, prC, fixD);
      expect(result.findings.some((f) => f.ruleId === 'ARD001' && f.severity === 'ERROR')).toBe(
        false,
      );

      // Fix B: disable NSAllowsArbitraryLoads.
      write(repo, 'ios/Example/Info.plist', VALID_INFO_PLIST);
      commit(repo, 'fix-b: disable ATS exception');
      const fixB = headOf(repo);
      result = await runDelta(repo, prA, fixB);
      expect(result.findings.filter((f) => f.ruleId === 'ARD003')).toHaveLength(0);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  }, 120000);
});

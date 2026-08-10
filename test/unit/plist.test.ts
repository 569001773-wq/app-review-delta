import { describe, expect, it } from 'vitest';
import { parsePlist } from '../../src/parsers/plist';

describe('plist parser', () => {
  it('parses dictionaries, arrays, booleans and integers', () => {
    const xml = `<plist version="1.0"><dict>
      <key>NSPrivacyTracking</key><true/>
      <key>Names</key><array><string>a</string><string>b</string></array>
      <key>Count</key><integer>3</integer>
    </dict></plist>`;
    const r = parsePlist(xml);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({
      NSPrivacyTracking: true,
      Names: ['a', 'b'],
      Count: 3,
    });
  });

  it('returns an error for malformed XML', () => {
    const r = parsePlist('<plist><dict><key>oops</dict>');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('returns an error when the plist root is missing', () => {
    const r = parsePlist('<foo/>');
    expect(r.ok).toBe(false);
  });

  it('handles a valid privacy manifest', () => {
    const r = parsePlist(`<?xml version="1.0" encoding="UTF-8"?>
      <plist version="1.0"><dict>
        <key>NSPrivacyTracking</key><false/>
        <key>NSPrivacyAccessedAPITypes</key><array>
          <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array><string>CA92.1</string></array>
          </dict>
        </array>
      </dict></plist>`);
    expect(r.ok).toBe(true);
  });

  it('does not execute entities or external content', () => {
    const r = parsePlist(
      '<!DOCTYPE plist [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><plist version="1.0"><string>&xxe;</string></plist>',
    );
    // The entity is not resolved to file contents; no crash, no data
    // exfiltration. Depending on the parser, this either fails to parse or
    // yields a value that must not contain /etc/passwd content.
    expect(r.ok === false || !String(r.value ?? '').includes('root:')).toBe(true);
  });
});

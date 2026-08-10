import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../../src/snapshots/buildSnapshot';
import { defaultConfig } from '../../src/config/load';
import { FileProvider, ChangedPathsProvider } from '../../src/snapshots/buildSnapshot';

function fakeProvider(files: Record<string, Uint8Array>): FileProvider & ChangedPathsProvider {
  return {
    async getChangedPaths() {
      return { paths: Object.keys(files), truncated: false, notes: [] };
    },
    async get(path, _ref, _maxFileSize) {
      void _ref;
      void _maxFileSize;
      const content = files[path];
      if (!content)
        return {
          content: new Uint8Array(),
          size: 0,
          missing: true,
          truncated: false,
          symlink: false,
        };
      return {
        content,
        size: content.byteLength,
        missing: false,
        truncated: false,
        symlink: false,
      };
    },
  };
}

describe('snapshot builder', () => {
  it('skips oversized files and reports a coverage gap', async () => {
    const big = new TextEncoder().encode('x'.repeat(100));
    const config = { ...defaultConfig(), maxFileSizeBytes: 50 };
    const snap = await buildSnapshot({
      ref: 'head',
      config,
      provider: fakeProvider({ 'ios/App/Info.plist': big }),
      source: 'git',
    });
    expect(snap.files.has('ios/App/Info.plist')).toBe(false);
    expect(snap.coverage.gaps.some((g) => g.kind === 'oversized-file')).toBe(true);
  });

  it('skips binary files and reports a coverage gap', async () => {
    const binary = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
    const snap = await buildSnapshot({
      ref: 'head',
      config: defaultConfig(),
      provider: fakeProvider({ 'ios/App/Info.plist': binary }),
      source: 'git',
    });
    expect(snap.files.size).toBe(0);
    expect(snap.coverage.gaps.some((g) => g.kind === 'binary-file')).toBe(true);
  });

  it('rejects path traversal and records a gap', async () => {
    const snap = await buildSnapshot({
      ref: 'head',
      config: defaultConfig(),
      provider: fakeProvider({
        '../evil.txt': new TextEncoder().encode('x'),
        '..\\win.txt': new TextEncoder().encode('y'),
      }),
      source: 'git',
    });
    expect(snap.files.has('../evil.txt')).toBe(false);
    expect(snap.coverage.gaps.some((g) => g.kind === 'unsupported-layout')).toBe(true);
  });

  it('records missing files without failing', async () => {
    const snap = await buildSnapshot({
      ref: 'head',
      config: defaultConfig(),
      provider: fakeProvider({ 'app.json': new TextEncoder().encode('{}') }),
      source: 'git',
    });
    expect(snap.files.has('app.json')).toBe(true);
  });

  it('applies exclude paths', async () => {
    const config = { ...defaultConfig(), excludePaths: ['**/Pods/**'] };
    const snap = await buildSnapshot({
      ref: 'head',
      config,
      provider: fakeProvider({
        'ios/Pods/Target/Info.plist': new TextEncoder().encode('x'),
        'ios/App/Info.plist': new TextEncoder().encode('y'),
      }),
      source: 'git',
    });
    expect(snap.files.has('ios/Pods/Target/Info.plist')).toBe(false);
    expect(snap.files.has('ios/App/Info.plist')).toBe(true);
  });
});

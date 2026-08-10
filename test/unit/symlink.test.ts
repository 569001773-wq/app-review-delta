import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fetchWorkingFile } from '../../src/git/gitSnapshot';

let repoDir: string;
let outsideDir: string;
let linkSupported = true;

beforeAll(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ard-symlink-repo-'));
  outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ard-symlink-outside-'));
  fs.writeFileSync(path.join(repoDir, 'real.txt'), 'inside', 'utf8');
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'outside-secret', 'utf8');
  try {
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(outsideDir, path.join(repoDir, 'link'), type);
  } catch {
    linkSupported = false;
  }
  if (linkSupported) {
    // Keep git from interfering; fetchWorkingFile only needs the filesystem.
    try {
      execFileSync('git', ['-C', repoDir, 'init', '-q'], { stdio: 'ignore' });
    } catch {
      // git is not required for this unit test
    }
  }
});

afterAll(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
});

describe('working-tree symlink protection', () => {
  it('reads a regular file inside the repository', async () => {
    const r = await fetchWorkingFile(repoDir, 'real.txt', 1024 * 1024);
    expect(r.missing).toBe(false);
    expect(r.symlink).toBe(false);
    expect(new TextDecoder().decode(r.content)).toBe('inside');
  });

  it('rejects a symlink/junction that escapes the repository', async () => {
    if (!linkSupported) return;
    const r = await fetchWorkingFile(repoDir, 'link/secret.txt', 1024 * 1024);
    expect(r.symlink).toBe(true);
    expect(r.content.byteLength).toBe(0);
  });

  it('rejects the symlink itself', async () => {
    if (!linkSupported) return;
    const r = await fetchWorkingFile(repoDir, 'link', 1024 * 1024);
    expect(r.symlink).toBe(true);
  });

  it('rejects path traversal', async () => {
    const r = await fetchWorkingFile(repoDir, '../outside/secret.txt', 1024 * 1024);
    expect(r.symlink).toBe(true);
  });
});

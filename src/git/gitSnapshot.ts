import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppReviewConfig } from '../config/load';
import { buildSnapshot, FileProvider, ChangedPathsProvider } from '../snapshots/buildSnapshot';
import { Snapshot } from '../types';

const execFileAsync = promisify(execFile);

export interface GitCommandOptions {
  repoDir: string;
}

async function git(
  args: string[],
  repoDir: string,
  opts: { encoding?: BufferEncoding | 'buffer' } = {},
): Promise<Buffer | string> {
  const { stdout } = await execFileAsync('git', ['-C', repoDir, ...args], {
    encoding: opts.encoding ?? 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  return stdout;
}

export async function resolveGitRef(repoDir: string, ref: string): Promise<string> {
  const out = (await git(['rev-parse', '--verify', `${ref}^{commit}`], repoDir)) as string;
  return out.trim();
}

export interface ChangedPathsResult {
  paths: string[];
  truncated: boolean;
  notes: string[];
}

export async function changedPathsBetween(
  repoDir: string,
  baseRef: string,
  headRef: string,
  maxLines = 5000,
): Promise<ChangedPathsResult> {
  const out = (await git(
    ['diff', '--name-status', '--no-renames', baseRef, headRef],
    repoDir,
  )) as string;
  const lines = out.split('\n').filter((l) => l.length > 0);
  const paths: string[] = [];
  for (const line of lines) {
    // Format: <status>\t<path>
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    paths.push(line.slice(tab + 1));
  }
  const truncated = lines.length > maxLines;
  return {
    paths: paths.slice(0, maxLines),
    truncated,
    notes: truncated ? ['git diff output truncated; changed-file coverage may be partial'] : [],
  };
}

async function fetchBlob(
  repoDir: string,
  ref: string,
  path: string,
  maxFileSize: number,
): Promise<{
  missing: boolean;
  symlink: boolean;
  content: Uint8Array;
  size: number;
  truncated: boolean;
}> {
  // Exact-path lookup using the literal pathspec magic so glob characters in
  // the path are never interpreted as patterns.
  const lsOut = (await git(['ls-tree', ref, '--', `:(literal)${path}`], repoDir)) as string;
  const match = /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40,64})\t/.exec(lsOut.trim());
  if (!match)
    return { missing: true, symlink: false, content: new Uint8Array(), size: 0, truncated: false };
  if (match[2] !== 'blob') {
    return { missing: false, symlink: false, content: new Uint8Array(), size: 0, truncated: true };
  }
  if (match[1] === '120000') {
    return { missing: false, symlink: true, content: new Uint8Array(), size: 0, truncated: false };
  }
  const sha = match[3]!;
  const sizeOut = (await git(['cat-file', '-s', sha], repoDir)) as string;
  const size = Number.parseInt(sizeOut.trim(), 10) || 0;
  if (size > maxFileSize) {
    return { missing: false, symlink: false, content: new Uint8Array(), size, truncated: true };
  }
  const content = (await git(['cat-file', 'blob', sha], repoDir, { encoding: 'buffer' })) as Buffer;
  return {
    missing: false,
    symlink: false,
    content: new Uint8Array(content),
    size,
    truncated: false,
  };
}

export async function buildGitSnapshots(
  repoDir: string,
  baseRef: string,
  headRef: string,
  config: AppReviewConfig,
): Promise<{ base: Snapshot; head: Snapshot }> {
  const baseSha = await resolveGitRef(repoDir, baseRef);
  const headSha = await resolveGitRef(repoDir, headRef);
  const changed = await changedPathsBetween(repoDir, baseSha, headSha);

  const makeProvider = (): FileProvider & ChangedPathsProvider => ({
    async getChangedPaths() {
      return { paths: changed.paths, truncated: changed.truncated, notes: changed.notes };
    },
    async get(path, ref, maxFileSize) {
      return fetchBlob(repoDir, ref, path, maxFileSize);
    },
  });

  const base = await buildSnapshot({
    ref: baseSha,
    config,
    provider: makeProvider(),
    source: 'git',
  });
  const head = await buildSnapshot({
    ref: headSha,
    config,
    provider: makeProvider(),
    source: 'git',
  });
  return { base, head };
}

export async function buildGitWorkingSnapshot(
  repoDir: string,
  baseRef: string,
  config: AppReviewConfig,
): Promise<{ base: Snapshot; head: Snapshot }> {
  const baseSha = await resolveGitRef(repoDir, baseRef);
  // Diff the working tree against the base: git diff <base> (unstaged) plus
  // staged changes.
  const out = (await git(['diff', '--name-status', '--no-renames', baseSha], repoDir)) as string;
  const staged = (await git(
    ['diff', '--cached', '--name-status', '--no-renames', baseSha],
    repoDir,
  )) as string;
  const paths = [...out.split('\n'), ...staged.split('\n')]
    .filter((l) => l.length > 0)
    .map((l) => {
      const tab = l.indexOf('\t');
      return tab >= 0 ? l.slice(tab + 1) : l;
    });

  const makeProvider = (ref: string, changed: string[]): FileProvider & ChangedPathsProvider => ({
    async getChangedPaths() {
      return { paths: changed, truncated: false, notes: [] };
    },
    async get(path, unusedRef, maxFileSize) {
      void unusedRef;
      if (ref === 'working') {
        return fetchWorkingFile(repoDir, path, maxFileSize);
      }
      return fetchBlob(repoDir, ref, path, maxFileSize);
    },
  });

  const unique = [...new Set(paths)];
  const base = await buildSnapshot({
    ref: baseSha,
    config,
    provider: makeProvider(baseSha, unique),
    source: 'git',
  });
  const head = await buildSnapshot({
    ref: 'working-tree',
    config,
    provider: makeProvider('working', unique),
    source: 'git',
    changedPaths: unique,
  });
  return { base, head };
}

async function fetchWorkingFile(
  repoDir: string,
  path: string,
  maxFileSize: number,
): Promise<{
  missing: boolean;
  symlink: boolean;
  content: Uint8Array;
  size: number;
  truncated: boolean;
}> {
  const { resolve, relative, sep } = await import('node:path');
  const { stat, readFile } = await import('node:fs/promises');
  const abs = resolve(repoDir, ...path.split('/'));
  const rel = relative(repoDir, abs);
  if (rel.startsWith('..') || rel.split(sep).includes('..')) {
    return { missing: true, symlink: true, content: new Uint8Array(), size: 0, truncated: false };
  }
  try {
    const st = await stat(abs);
    if (st.isSymbolicLink()) {
      return {
        missing: false,
        symlink: true,
        content: new Uint8Array(),
        size: 0,
        truncated: false,
      };
    }
    if (!st.isFile()) {
      return {
        missing: false,
        symlink: false,
        content: new Uint8Array(),
        size: 0,
        truncated: true,
      };
    }
    if (st.size > maxFileSize) {
      return {
        missing: false,
        symlink: false,
        content: new Uint8Array(),
        size: st.size,
        truncated: true,
      };
    }
    const data = await readFile(abs);
    return {
      missing: false,
      symlink: false,
      content: new Uint8Array(data),
      size: st.size,
      truncated: false,
    };
  } catch {
    return { missing: true, symlink: false, content: new Uint8Array(), size: 0, truncated: false };
  }
}

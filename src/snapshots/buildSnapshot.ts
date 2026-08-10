import { AppReviewConfig } from '../config/load';
import { CoverageGap, Snapshot, SnapshotFile } from '../types';
import { isRelevantPath } from './relevantPaths';
import { isLikelyBinary, safeRepoPath } from '../util/paths';
import { decodeUtf8 } from '../util/paths';
import picomatch from 'picomatch';

export interface FileProvider {
  /** Returns the file for `path` at `ref`, or a FetchedFile-like result. */
  get(
    path: string,
    ref: string,
    maxFileSize: number,
  ): Promise<{
    content: Uint8Array;
    size: number;
    missing: boolean;
    truncated: boolean;
    symlink: boolean;
  }>;
}

export interface ChangedPathsProvider {
  getChangedPaths(): Promise<{ paths: string[]; truncated: boolean; notes: string[] }>;
}

export interface BuildSnapshotInput {
  ref: string;
  config: AppReviewConfig;
  provider: FileProvider & ChangedPathsProvider;
  /** Precomputed changed paths (local CLI). When absent, uses provider. */
  changedPaths?: string[];
  source: 'github' | 'git';
}

function matcherFor(excludes: string[]): (p: string) => boolean {
  if (excludes.length === 0) return () => false;
  const matchers = excludes.map((g) => picomatch(g, { dot: true }));
  return (p) => matchers.some((m) => m(p));
}

/**
 * Builds a scoped static snapshot. Only relevant files are requested; only
 * files within size limits and non-symlink, non-binary text files are kept.
 * Everything skipped or unavailable is recorded as a coverage gap.
 */
export async function buildSnapshot(input: BuildSnapshotInput): Promise<Snapshot> {
  const { ref, config, provider, source } = input;
  const files = new Map<string, SnapshotFile>();
  const gaps: CoverageGap[] = [];
  const notes: string[] = [];
  const excluded = matcherFor(config.excludePaths);

  const changedInfo = input.changedPaths
    ? { paths: input.changedPaths, truncated: false, notes: [] as string[] }
    : await provider.getChangedPaths();

  if (changedInfo.truncated) {
    gaps.push({ kind: 'truncated-api', scope: '*', detail: 'changed-file list may be partial' });
  }
  notes.push(...changedInfo.notes);

  const candidates = new Set<string>();
  for (const p of changedInfo.paths) {
    const safe = safeRepoPath(p);
    if (!safe) {
      gaps.push({ kind: 'unsupported-layout', scope: p, detail: 'unsafe path skipped' });
      continue;
    }
    if (excluded(safe)) continue;
    if (isRelevantPath(safe)) candidates.add(safe);
  }
  // Always try the root-level config files so analysis is not dependent on
  // the PR touching them (they are needed for context such as SDK lists).
  for (const p of [
    'package.json',
    'app.json',
    'app.config.json',
    'app.config.js',
    'app.config.ts',
  ]) {
    if (!excluded(p)) candidates.add(p);
  }

  let fetchCount = 0;
  for (const path of [...candidates].sort()) {
    if (fetchCount >= config.maxFiles) {
      gaps.push({
        kind: 'truncated-api',
        scope: '*',
        detail: `file count exceeded max-files (${config.maxFiles}); remaining files skipped`,
      });
      break;
    }
    const fetched = await provider.get(path, ref, config.maxFileSizeBytes);
    fetchCount++;
    if (fetched.missing) {
      // Missing at this ref is normal (file added/removed by the PR).
      continue;
    }
    if (fetched.symlink) {
      gaps.push({ kind: 'symlink', scope: path, detail: 'symlink skipped (not followed)' });
      continue;
    }
    if (
      fetched.size > config.maxFileSizeBytes ||
      fetched.content.length > config.maxFileSizeBytes
    ) {
      gaps.push({
        kind: 'oversized-file',
        scope: path,
        detail: `size ${fetched.size} exceeds max-file-size-bytes`,
      });
      continue;
    }
    if (fetched.truncated) {
      gaps.push({
        kind: 'truncated-api',
        scope: path,
        detail: 'file content could not be fully retrieved',
      });
      continue;
    }
    if (isLikelyBinary(fetched.content)) {
      gaps.push({ kind: 'binary-file', scope: path, detail: 'binary file skipped' });
      continue;
    }
    files.set(path, {
      path,
      size: fetched.size,
      content: fetched.content,
      text: decodeUtf8(fetched.content),
      source,
      truncated: false,
    });
  }

  return { ref, files, coverage: { gaps, notes } };
}

import { AppReviewConfig } from '../config/load';
import { buildSnapshot, FileProvider, ChangedPathsProvider } from '../snapshots/buildSnapshot';
import { Snapshot } from '../types';
import { CompareResult, GitHubClient } from './client';

export interface GitHubSnapshotInput {
  baseClient: GitHubClient;
  headClient: GitHubClient;
  baseSha: string;
  headSha: string;
  config: AppReviewConfig;
  /** Present on pull_request events; enables the cross-repository fallback. */
  prNumber?: number;
}

/**
 * Builds base and head snapshots sharing a single compare call.
 */
export async function buildGitHubSnapshots(
  input: GitHubSnapshotInput,
): Promise<{ base: Snapshot; head: Snapshot }> {
  const { baseClient, headClient, baseSha, headSha, config, prNumber } = input;

  let compare: CompareResult;
  try {
    compare = await baseClient.compareCommits(baseSha, headSha, config.maxComparePages);
  } catch (err) {
    if (prNumber === undefined) throw err;
    // Cross-repository (fork) pull requests cannot always be compared on the
    // base repository; the PR-scoped files API is the reliable fallback.
    const prFiles = await baseClient.listPullRequestFiles(prNumber, config.maxComparePages);
    compare = {
      files: prFiles.files,
      truncated: prFiles.truncated,
      notes: [
        'used pull-request files API (cross-repository compare unavailable)',
        ...prFiles.notes,
      ],
    };
  }
  const changedPaths = compare.files.map((f) => f.path);

  const provider: FileProvider & ChangedPathsProvider = {
    async getChangedPaths() {
      return { paths: changedPaths, truncated: compare.truncated, notes: compare.notes };
    },
    async get(path, ref, maxFileSize) {
      const client = ref === headSha ? headClient : baseClient;
      try {
        const f = await client.getFile(path, ref, maxFileSize);
        return {
          content: f.content,
          size: f.size,
          missing: f.missing,
          truncated: f.truncated,
          symlink: f.symlink,
        };
      } catch (err) {
        const status = (err as { status?: number }).status ?? 0;
        throw new Error(
          `AppReviewDelta could not read "${path}" at ${ref.slice(0, 12)} from ${client.getRepoId()} ` +
            `(HTTP ${status || 'error'}). For fork pull requests, the workflow token needs read access to the fork ` +
            'repository; public forks work with the default GITHUB_TOKEN.',
          { cause: err },
        );
      }
    },
  };

  const base = await buildSnapshot({ ref: baseSha, config, provider, source: 'github' });
  const head = await buildSnapshot({ ref: headSha, config, provider, source: 'github' });
  return { base, head };
}

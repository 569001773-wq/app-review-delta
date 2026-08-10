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
  /** Present on pull_request events; selects the PR files API. */
  prNumber?: number;
}

/**
 * Builds base and head snapshots sharing a single changed-file fetch.
 */
export async function buildGitHubSnapshots(
  input: GitHubSnapshotInput,
): Promise<{ base: Snapshot; head: Snapshot }> {
  const { baseClient, headClient, baseSha, headSha, config, prNumber } = input;

  // The PR files API is the authoritative changed-file source: it is
  // paginated (up to 3000 files) and works for cross-repository (fork) PRs.
  // GitHub's compare endpoint caps at 300 files and is used only when no PR
  // number is available.
  const compare: CompareResult = await (async () => {
    if (prNumber === undefined) {
      return baseClient.compareCommits(baseSha, headSha);
    }
    try {
      const prFiles = await baseClient.listPullRequestFiles(prNumber, config.maxPrFilesPages);
      return { files: prFiles.files, truncated: prFiles.truncated, notes: prFiles.notes };
    } catch (prErr) {
      const status = (prErr as { status?: number }).status ?? 0;
      throw new Error(
        `AppReviewDelta could not list files for pull request #${prNumber} on ${baseClient.getRepoId()} ` +
          `(HTTP ${status || 'error'}). For fork pull requests, the workflow token needs read access to the fork ` +
          'repository; public forks work with the default GITHUB_TOKEN.',
        { cause: prErr },
      );
    }
  })();
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

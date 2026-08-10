import { AppReviewConfig } from '../config/load';
import { buildSnapshot, FileProvider, ChangedPathsProvider } from '../snapshots/buildSnapshot';
import { Snapshot } from '../types';
import { GitHubClient } from './client';

/**
 * Builds base and head snapshots sharing a single compare call.
 */
export async function buildGitHubSnapshots(
  client: GitHubClient,
  baseSha: string,
  headSha: string,
  config: AppReviewConfig,
): Promise<{ base: Snapshot; head: Snapshot }> {
  const compare = await client.compareCommits(baseSha, headSha, config.maxComparePages);
  const changedPaths = compare.files.map((f) => f.path);

  const provider: FileProvider & ChangedPathsProvider = {
    async getChangedPaths() {
      return { paths: changedPaths, truncated: compare.truncated, notes: compare.notes };
    },
    async get(path, ref, maxFileSize) {
      const f = await client.getFile(path, ref, maxFileSize);
      return {
        content: f.content,
        size: f.size,
        missing: f.missing,
        truncated: f.truncated,
        symlink: f.symlink,
      };
    },
  };

  const base = await buildSnapshot({ ref: baseSha, config, provider, source: 'github' });
  const head = await buildSnapshot({ ref: headSha, config, provider, source: 'github' });
  return { base, head };
}

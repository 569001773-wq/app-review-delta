import * as fs from 'node:fs';
import { RepoRef } from './repoResolver';

/**
 * Minimal GitHub Actions context reader. Replaces @actions/github's context
 * (which is ESM-only in current versions and cannot be bundled into the CJS
 * Action bundle). Reads the same environment surface: GITHUB_EVENT_PATH and
 * GITHUB_REPOSITORY.
 */

export interface GitHubContext {
  payload: { pull_request?: unknown };
  repo: RepoRef;
}

export function parseGitHubRepository(value: string | undefined): RepoRef {
  if (!value) return { owner: '', repo: '' };
  const parts = value.split('/');
  return { owner: parts[0] ?? '', repo: parts[1] ?? '' };
}

export function getGitHubContext(): GitHubContext {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let payload: { pull_request?: unknown } = {};
  if (eventPath) {
    try {
      const text = fs.readFileSync(eventPath, 'utf8').replace(/^\uFEFF/, '');
      payload = JSON.parse(text) as { pull_request?: unknown };
    } catch {
      payload = {};
    }
  }
  return {
    payload,
    repo: parseGitHubRepository(process.env.GITHUB_REPOSITORY),
  };
}

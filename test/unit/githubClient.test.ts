import { describe, expect, it } from 'vitest';
import { GitHubClient } from '../../src/github/client';

function file(filename: string) {
  return { filename, status: 'modified', additions: 1, deletions: 0, changes: 1 };
}

describe('GitHubClient changed-file fetching', () => {
  it('compareCommits marks a 300-file first page as truncated', async () => {
    const rest = {
      repos: {
        compareCommits: async () => ({
          data: { files: Array.from({ length: 300 }, (_, i) => file(`f${i}.plist`)) },
        }),
      },
    };
    const client = new GitHubClient('acme', 'app', undefined, rest as never);
    const result = await client.compareCommits('a', 'b');
    expect(result.files).toHaveLength(300);
    expect(result.truncated).toBe(true);
    expect(result.notes.join(' ')).toContain('300-file limit');
  });

  it('compareCommits reports complete for fewer than 300 files', async () => {
    const rest = {
      repos: {
        compareCommits: async () => ({
          data: { files: Array.from({ length: 299 }, (_, i) => file(`f${i}.plist`)) },
        }),
      },
    };
    const client = new GitHubClient('acme', 'app', undefined, rest as never);
    const result = await client.compareCommits('a', 'b');
    expect(result.truncated).toBe(false);
  });

  it('listPullRequestFiles paginates and reports completeness', async () => {
    const pages = [
      Array.from({ length: 100 }, (_, i) => file(`a${i}.plist`)),
      Array.from({ length: 100 }, (_, i) => file(`b${i}.plist`)),
      Array.from({ length: 50 }, (_, i) => file(`c${i}.plist`)),
    ];
    let page = 0;
    const rest = {
      pulls: {
        listFiles: async () => ({
          data: pages[page++] ?? [],
        }),
      },
    };
    const client = new GitHubClient('acme', 'app', undefined, rest as never);
    const result = await client.listPullRequestFiles(7, 30);
    expect(result.files).toHaveLength(250);
    expect(result.truncated).toBe(false);
  });

  it('listPullRequestFiles reports truncation when the page cap is hit', async () => {
    const rest = {
      pulls: {
        listFiles: async () => ({
          data: Array.from({ length: 100 }, (_, i) => file(`f${i}.plist`)),
        }),
      },
    };
    const client = new GitHubClient('acme', 'app', undefined, rest as never);
    const result = await client.listPullRequestFiles(7, 2);
    expect(result.files).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(result.notes.join(' ')).toContain('pagination cap');
  });
});

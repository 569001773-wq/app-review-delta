import { describe, expect, it } from 'vitest';
import { resolvePullRequestRepos } from '../../src/github/repoResolver';

const FALLBACK = { owner: 'acme', repo: 'app' };

describe('pull-request repository resolution', () => {
  it('falls back to context.repo for same-repository PRs', () => {
    const r = resolvePullRequestRepos(
      {
        pull_request: {
          number: 42,
          base: { sha: 'b', repo: { owner: { login: 'acme' }, name: 'app' } },
          head: { sha: 'h' },
        },
      },
      FALLBACK,
    );
    expect(r.baseRepo).toEqual(FALLBACK);
    expect(r.headRepo).toEqual(FALLBACK);
    expect(r.prNumber).toBe(42);
  });

  it('routes fork PR head reads to the fork repository', () => {
    const r = resolvePullRequestRepos(
      {
        pull_request: {
          number: 7,
          base: { sha: 'b', repo: { owner: { login: 'acme' }, name: 'app' } },
          head: { sha: 'h', repo: { owner: { login: 'mallory' }, name: 'app' } },
        },
      },
      FALLBACK,
    );
    expect(r.baseRepo).toEqual({ owner: 'acme', repo: 'app' });
    expect(r.headRepo).toEqual({ owner: 'mallory', repo: 'app' });
  });

  it('handles full_name-shaped repo payloads', () => {
    const r = resolvePullRequestRepos(
      {
        pull_request: {
          base: { repo: { full_name: 'acme/app' } },
          head: { repo: { full_name: 'mallory/app' } },
        },
      },
      FALLBACK,
    );
    expect(r.baseRepo.repo).toBe('app');
    expect(r.headRepo.owner).toBe('mallory');
  });

  it('handles missing payloads safely', () => {
    const r = resolvePullRequestRepos(undefined, FALLBACK);
    expect(r.baseRepo).toEqual(FALLBACK);
    expect(r.headRepo).toEqual(FALLBACK);
    expect(r.prNumber).toBeUndefined();
  });
});

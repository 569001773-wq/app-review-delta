/**
 * Resolves the base/head repositories for a pull_request event payload.
 * Same-repository PRs fall back to `context.repo`; fork PRs route head-side
 * reads to the fork repository so content can be fetched without a target
 * checkout.
 */

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface PullRequestRepos {
  baseRepo: RepoRef;
  headRepo: RepoRef;
  prNumber?: number;
}

function repoFromUnknown(v: unknown, fallback: RepoRef): RepoRef {
  if (typeof v === 'object' && v !== null) {
    const r = v as { owner?: { login?: unknown }; name?: unknown; full_name?: unknown };
    const owner = typeof r.owner?.login === 'string' ? r.owner.login : undefined;
    const name = typeof r.name === 'string' ? r.name : undefined;
    if (owner && name) return { owner, repo: name };
    if (typeof r.full_name === 'string' && r.full_name.includes('/')) {
      const [o, n] = r.full_name.split('/');
      if (o && n) return { owner: o, repo: n };
    }
  }
  return fallback;
}

export function resolvePullRequestRepos(
  payload: { pull_request?: unknown } | undefined,
  fallback: RepoRef,
): PullRequestRepos {
  const pr = payload?.pull_request as
    { base?: { repo?: unknown }; head?: { repo?: unknown }; number?: unknown } | undefined;
  const baseRepo = repoFromUnknown(pr?.base?.repo, fallback);
  const headRepo = repoFromUnknown(pr?.head?.repo, fallback);
  const prNumber = typeof pr?.number === 'number' ? pr.number : undefined;
  return { baseRepo, headRepo, prNumber };
}

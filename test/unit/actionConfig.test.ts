import { describe, expect, it } from 'vitest';
import { resolveActionConfig } from '../../src/action/config';
import { GitHubClient } from '../../src/github/client';

const BASE_CONFIG = 'fail-on: warning\n';
const HEAD_CONFIG = 'fail-on: never\nrules:\n  ARD001:\n    enabled: false\n';

function fakeClient(files: Record<string, { content: string; missing?: boolean }>): GitHubClient {
  const rest = {
    repos: {
      getContent: async (params: { path: string; ref: string }) => {
        const hit = files[`${params.ref}:${params.path}`];
        if (!hit || hit.missing) {
          throw Object.assign(new Error('Not Found'), { status: 404 });
        }
        return {
          data: {
            type: 'file',
            encoding: 'base64',
            content: Buffer.from(hit.content).toString('base64'),
            size: Buffer.byteLength(hit.content),
          },
        };
      },
    },
  };
  return new GitHubClient('acme', 'app', undefined, rest as never);
}

describe('Action policy resolution (base-first)', () => {
  const baseClient = fakeClient({
    'base:.reviewdelta.yml': { content: BASE_CONFIG },
  });
  const headClient = fakeClient({
    'head:.reviewdelta.yml': { content: HEAD_CONFIG },
  });

  it('uses the BASE policy and reports the PR-side change', async () => {
    const r = await resolveActionConfig({
      baseClient,
      headClient,
      baseSha: 'base',
      headSha: 'head',
      configPath: '.reviewdelta.yml',
      configRef: 'base',
    });
    expect(r.config.failOn).toBe('warning');
    expect(r.policyChanged).toBe(true);
    expect(r.sourceRef).toBe('base');
  });

  it('does NOT let a PR disable rules or set fail-on: never', async () => {
    const r = await resolveActionConfig({
      baseClient,
      headClient,
      baseSha: 'base',
      headSha: 'head',
      configPath: '.reviewdelta.yml',
      configRef: 'base',
    });
    expect(r.config.rules.ARD001?.enabled).toBeUndefined();
    expect(r.config.failOn).not.toBe('never');
  });

  it('falls back to defaults when the BASE has no config (ignores HEAD config)', async () => {
    const r = await resolveActionConfig({
      baseClient: fakeClient({}),
      headClient,
      baseSha: 'base',
      headSha: 'head',
      configPath: '.reviewdelta.yml',
      configRef: 'base',
    });
    expect(r.config.failOn).toBe('error');
    expect(r.policyChanged).toBe(true);
  });

  it('honors an explicit config-ref: head', async () => {
    const r = await resolveActionConfig({
      baseClient,
      headClient,
      baseSha: 'base',
      headSha: 'head',
      configPath: '.reviewdelta.yml',
      configRef: 'head',
    });
    expect(r.config.failOn).toBe('never');
    expect(r.sourceRef).toBe('head');
  });

  it('applies input-level overrides on top of the resolved policy', async () => {
    const r = await resolveActionConfig({
      baseClient,
      headClient,
      baseSha: 'base',
      headSha: 'head',
      configPath: '.reviewdelta.yml',
      configRef: 'base',
      inputFailOn: 'error',
    });
    expect(r.config.failOn).toBe('error');
  });
});

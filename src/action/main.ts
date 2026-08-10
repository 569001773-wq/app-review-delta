import { VERSION } from '../version';
import { AppReviewConfig, configFromText, defaultConfig } from '../config/load';
import { analyze } from '../engine';
import { GitHubClient } from '../github/client';
import { buildGitHubSnapshots } from '../github/githubSnapshot';
import { resolvePullRequestRepos } from '../github/repoResolver';
import { getGitHubContext } from '../github/context';
import * as core from './runner';
import { formatJson } from '../reporting/json';
import { formatMarkdown } from '../reporting/markdown';
import { formatTerminal, failsOn, findingCounts } from '../reporting/terminal';
import * as fs from 'node:fs';

function getPullRequestShas(payload: { pull_request?: unknown }): {
  baseSha: string;
  headSha: string;
} {
  const pr = payload.pull_request as
    { base?: { sha?: string }; head?: { sha?: string } } | undefined;
  const baseSha = pr?.base?.sha;
  const headSha = pr?.head?.sha;
  if (!baseSha || !headSha) {
    throw new Error(
      'AppReviewDelta requires a pull_request event with base.sha and head.sha. ' +
        'Run this action on: pull_request.',
    );
  }
  return { baseSha, headSha };
}

async function loadConfigFromRepo(
  client: GitHubClient,
  headSha: string,
  configPath: string,
  inputFailOn: string | undefined,
  inputMaxFileSize: number | undefined,
): Promise<AppReviewConfig> {
  const cfg = defaultConfig();
  const f = await client.getFile(configPath, headSha);
  if (
    !f.missing &&
    !f.truncated &&
    f.content.length > 0 &&
    f.content.length <= cfg.maxFileSizeBytes
  ) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(f.content);
    const parsed = configFromText(text, configPath);
    return {
      ...parsed,
      failOn: inputFailOn ? (inputFailOn as AppReviewConfig['failOn']) : parsed.failOn,
      maxFileSizeBytes: inputMaxFileSize ?? parsed.maxFileSizeBytes,
    };
  }
  return {
    ...cfg,
    failOn: inputFailOn ? (inputFailOn as AppReviewConfig['failOn']) : cfg.failOn,
    maxFileSizeBytes: inputMaxFileSize ?? cfg.maxFileSizeBytes,
  };
}

async function main(): Promise<void> {
  const token = core.getInput('token');
  const failOnInput = core.getInput('fail-on') || undefined;
  const configPath = core.getInput('config-path') || '.reviewdelta.yml';
  const maxFileSizeInput = Number(core.getInput('max-file-size-bytes') || '0');
  const jsonOutputPath = core.getInput('output-json');

  if (failOnInput && !['error', 'warning', 'never'].includes(failOnInput)) {
    throw new Error('fail-on must be one of: error, warning, never');
  }

  const context = getGitHubContext();
  const { baseSha, headSha } = getPullRequestShas(context.payload);
  const { baseRepo, headRepo, prNumber } = resolvePullRequestRepos(context.payload, {
    owner: context.repo.owner,
    repo: context.repo.repo,
  });
  const baseClient = new GitHubClient(baseRepo.owner, baseRepo.repo, token || undefined);
  const headClient = new GitHubClient(headRepo.owner, headRepo.repo, token || undefined);

  const config = await loadConfigFromRepo(
    headClient,
    headSha,
    configPath,
    failOnInput,
    Number.isFinite(maxFileSizeInput) && maxFileSizeInput > 0 ? maxFileSizeInput : undefined,
  );

  const { base, head } = await buildGitHubSnapshots({
    baseClient,
    headClient,
    baseSha,
    headSha,
    config,
    prNumber,
  });
  const result = analyze(base, head, config, { version: VERSION });

  const counts = findingCounts(result);
  core.setOutput('introduced-count', String(result.findings.length));
  core.setOutput('error-count', String(counts.error));
  core.setOutput('warning-count', String(counts.warning));
  core.setOutput('info-count', String(counts.info));

  if (jsonOutputPath) {
    fs.writeFileSync(jsonOutputPath, formatJson(result), 'utf8');
  }

  process.stdout.write(formatTerminal(result, false) + '\n');

  for (const f of result.findings) {
    const message = `${f.ruleId}: ${f.title} (${f.evidence})`;
    if (f.severity === 'ERROR') core.error(message, { file: f.file, startLine: f.line });
    else if (f.severity === 'WARNING') core.warning(message, { file: f.file, startLine: f.line });
    else core.notice(message, { file: f.file, startLine: f.line });
  }

  await core.summary.addRaw(formatMarkdown(result)).write();

  if (failsOn(result)) {
    core.setFailed(
      `AppReviewDelta: ${counts.error} ERROR, ${counts.warning} WARNING introduced (fail-on: ${result.config.failOn})`,
    );
  }
}

main().catch((err) => {
  core.setFailed(`AppReviewDelta failed: ${(err as Error).message}`);
});

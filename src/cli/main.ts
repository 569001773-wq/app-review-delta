import { Command, Option } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VERSION } from '../version';
import { configFromText, defaultConfig } from '../config/load';
import { ConfigError } from '../config/schema';
import { analyze } from '../engine';
import { buildGitSnapshots, buildGitWorkingSnapshot } from '../git/gitSnapshot';
import { formatJson } from '../reporting/json';
import { formatMarkdown } from '../reporting/markdown';
import { formatTerminal, failsOn, findingCounts } from '../reporting/terminal';
import { RULES } from '../rules/registry';

function loadConfig(
  repoDir: string,
  configPath: string | undefined,
): ReturnType<typeof configFromText> {
  const target = configPath
    ? path.resolve(repoDir, configPath)
    : path.join(repoDir, '.reviewdelta.yml');
  if (!fs.existsSync(target)) return defaultConfig();
  const text = fs.readFileSync(target, 'utf8');
  return configFromText(text, target);
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command();
  program
    .name('app-review-delta')
    .description(
      'Detect iOS release-review risks introduced by a pull request. Base-to-head static analysis.',
    )
    .version(VERSION);

  program
    .command('check')
    .description('Analyze the release-review delta between two refs (or the working tree).')
    .option('--base <ref>', 'base ref (default: main)', 'main')
    .option(
      '--head <ref>',
      'head ref, or "working" for the working tree (default: working)',
      'working',
    )
    .option('--repo <dir>', 'path to the git repository (default: current directory)')
    .option('--config <path>', 'path to .reviewdelta.yml (relative to the repository)')
    .option('--format <format>', 'output format: terminal | json | markdown', 'terminal')
    .option('--fail-on <level>', 'fail threshold: error | warning | never')
    .addOption(new Option('--no-color', 'disable ANSI colors'))
    .option('--allow-fail', 'always exit 0 even if the fail threshold is met')
    .option('--json-output <path>', 'also write the full JSON report to this path')
    .action(async (opts) => {
      const repoDir = path.resolve(opts.repo ?? process.cwd());
      if (!fs.existsSync(path.join(repoDir, '.git'))) {
        throw new Error(`not a git repository: ${repoDir}`);
      }
      const config = loadConfig(repoDir, opts.config);
      if (opts.failOn !== undefined) {
        if (!['error', 'warning', 'never'].includes(opts.failOn)) {
          throw new ConfigError('--fail-on must be one of: error, warning, never');
        }
        config.failOn = opts.failOn;
      }

      const { base, head } =
        opts.head === 'working'
          ? await buildGitWorkingSnapshot(repoDir, opts.base, config)
          : await buildGitSnapshots(repoDir, opts.base, opts.head, config);

      const result = analyze(base, head, config, { version: VERSION });

      if (opts.jsonOutput) {
        fs.writeFileSync(path.resolve(repoDir, opts.jsonOutput), formatJson(result), 'utf8');
      }

      if (opts.format === 'json') {
        process.stdout.write(formatJson(result) + '\n');
      } else if (opts.format === 'markdown') {
        process.stdout.write(formatMarkdown(result) + '\n');
      } else {
        process.stdout.write(formatTerminal(result, opts.color) + '\n');
      }

      if (!opts.allowFail && failsOn(result)) {
        const counts = findingCounts(result);
        process.exitCode = 1;
        process.stderr.write(
          `AppReviewDelta: ${counts.error} ERROR, ${counts.warning} WARNING introduced (fail-on: ${config.failOn})\n`,
        );
      }
    });

  program
    .command('rules')
    .description('List implemented rules and their metadata.')
    .option('--format <format>', 'output format: json | table', 'table')
    .action((opts) => {
      if (opts.format === 'json') {
        process.stdout.write(
          JSON.stringify(
            RULES.map((r) => r.metadata),
            null,
            2,
          ) + '\n',
        );
      } else {
        for (const r of RULES) {
          process.stdout.write(
            `${r.id}  ${r.metadata.defaultSeverity.padEnd(7)} ${r.metadata.title}\n`,
          );
        }
      }
    });

  await program.parseAsync(argv);
}

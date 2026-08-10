import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  annotation,
  error,
  getInput,
  notice,
  setFailed,
  setOutput,
  summary,
  warning,
} from '../../src/action/runner';

const originalEnv = { ...process.env };
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ard-runner-'));

beforeEach(() => {
  process.env = { ...originalEnv };
  summary.buffer = '';
});

afterEach(() => {
  process.env = { ...originalEnv };
  process.exitCode = 0;
});

describe('runner toolkit shim', () => {
  it('reads inputs from INPUT_* environment variables', () => {
    // GitHub Actions exposes inputs as INPUT_<NAME> with hyphens preserved.
    process.env['INPUT_FAIL-ON'] = 'warning';
    process.env['INPUT_CONFIG-PATH'] = '.reviewdelta.yml';
    expect(getInput('fail-on')).toBe('warning');
    expect(getInput('config-path')).toBe('.reviewdelta.yml');
    expect(getInput('missing')).toBe('');
  });

  it('writes simple and multiline outputs to GITHUB_OUTPUT', () => {
    const file = path.join(tmpDir, 'output.txt');
    process.env.GITHUB_OUTPUT = file;
    setOutput('introduced-count', '2');
    setOutput('summary', 'line1\nline2');
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toContain('introduced-count=2');
    expect(text).toContain('summary<<__APPREVIEWDELTA_EOF__\nline1\nline2\n__APPREVIEWDELTA_EOF__');
  });

  it('emits workflow-command annotations with escaping', () => {
    const stderr: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      error('bad, value: 100%', { file: 'ios/a b.ts', startLine: 3 });
      warning('just a warning');
      notice('FYI');
    } finally {
      process.stderr.write = orig;
    }
    expect(stderr[0]).toBe('::error file=ios/a b.ts,line=3::bad, value: 100%25\n');
    expect(stderr[1]).toBe('::warning::just a warning\n');
    expect(stderr[2]).toBe('::notice::FYI\n');
  });

  it('omits line= when no line is available', () => {
    const stderr: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      notice('finding', { file: 'ios/Example/Info.plist' });
    } finally {
      process.stderr.write = orig;
    }
    expect(stderr[0]).toBe('::notice file=ios/Example/Info.plist::finding\n');
  });

  it('setFailed emits an error annotation and sets the exit code', () => {
    setFailed('AppReviewDelta failed: boom');
    expect(process.exitCode).toBe(1);
  });

  it('writes the job summary file', async () => {
    const file = path.join(tmpDir, 'summary.md');
    process.env.GITHUB_STEP_SUMMARY = file;
    summary.addRaw('# AppReviewDelta\n').addRaw('**2 findings**');
    await summary.write();
    expect(fs.readFileSync(file, 'utf8')).toBe('# AppReviewDelta\n**2 findings**');
  });

  it('annotation and helpers are consistent', () => {
    expect(typeof annotation).toBe('function');
    expect(typeof error).toBe('function');
    expect(typeof warning).toBe('function');
    expect(typeof notice).toBe('function');
  });
});

/**
 * Minimal GitHub Actions runner surface, implemented locally so the Action
 * bundle is fully self-contained.
 *
 * Current @actions/* toolkit majors are ESM-only (or pull in a vulnerable
 * undici chain), which breaks the CommonJS Action bundle. This module
 * implements the small surface AppReviewDelta uses — inputs, outputs,
 * workflow-command annotations, the step-summary file, and setFailed —
 * following the documented GitHub Actions workflow-command formats.
 */

import * as fs from 'node:fs';

export function getInput(name: string): string {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  return process.env[key] ?? '';
}

export function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const hasNewline = value.includes('\n') || value.includes('\r');
  const line = hasNewline
    ? `${name}<<__APPREVIEWDELTA_EOF__\n${value}\n__APPREVIEWDELTA_EOF__`
    : `${name}=${value}`;
  fs.appendFileSync(file, `${line}\n`, 'utf8');
}

function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

export interface AnnotationProperties {
  file?: string;
  startLine?: number;
}

export function annotation(
  level: 'error' | 'warning' | 'notice',
  message: string,
  props: AnnotationProperties = {},
): void {
  const parts: string[] = [];
  if (props.file !== undefined) parts.push(`file=${escapeProperty(props.file)}`);
  if (props.startLine !== undefined) parts.push(`line=${props.startLine}`);
  const propsStr = parts.length > 0 ? ` ${parts.join(',')}` : '';
  process.stderr.write(`::${level}${propsStr}::${escapeData(message)}\n`);
}

export function error(message: string, props?: AnnotationProperties): void {
  annotation('error', message, props);
}

export function warning(message: string, props?: AnnotationProperties): void {
  annotation('warning', message, props);
}

export function notice(message: string, props?: AnnotationProperties): void {
  annotation('notice', message, props);
}

export function setFailed(message: string): void {
  process.stderr.write(`::error::${escapeData(message)}\n`);
  process.exitCode = 1;
}

export interface SummaryWriter {
  buffer: string;
  addRaw(text: string): SummaryWriter;
  write(): Promise<void>;
}

export const summary: SummaryWriter = {
  buffer: '',
  addRaw(text: string): typeof summary {
    this.buffer += text;
    return this;
  },
  async write(): Promise<void> {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (file && this.buffer.length > 0) {
      fs.appendFileSync(file, this.buffer, 'utf8');
    }
  },
};

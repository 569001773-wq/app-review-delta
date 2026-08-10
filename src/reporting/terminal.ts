import { AnalysisResult, Finding } from '../types';

function severityColor(severity: string): string {
  switch (severity) {
    case 'ERROR':
      return '\u001b[31m';
    case 'WARNING':
      return '\u001b[33m';
    default:
      return '\u001b[36m';
  }
}

const RESET = '\u001b[0m';

export function formatTerminal(result: AnalysisResult, useColor = process.stdout.isTTY): string {
  const lines: string[] = [];
  const bar = '\u2500'.repeat(30);
  lines.push('AppReviewDelta');
  lines.push(bar);
  const introduced = result.findings;
  lines.push(
    `${introduced.length} review-sensitive change${introduced.length === 1 ? '' : 's'} introduced by this PR`,
  );
  lines.push('');

  for (const f of introduced) {
    const color = useColor ? severityColor(f.severity) : '';
    lines.push(`${color}${f.severity} \u00b7 ${f.ruleId}${useColor ? RESET : ''}`);
    lines.push(f.title);
    lines.push('');
    lines.push(f.file);
    if (f.line) lines.push(`line ${f.line}`);
    if (f.baseState !== undefined || f.headState !== undefined) {
      lines.push('');
      const bs = f.baseState === '' ? '(empty string)' : (f.baseState ?? '(not present)');
      const hs = f.headState === '' ? '(empty string)' : (f.headState ?? '(removed)');
      lines.push(`${bs} \u2192 ${hs}`);
    }
    lines.push('');
    lines.push(`Confidence: ${f.confidence}`);
    if (f.heuristic) lines.push('This finding is a heuristic, not a proven fact.');
    lines.push('');
    lines.push(`Why this matters:`);
    lines.push(f.whyItMatters);
    lines.push('');
    lines.push(`Suggested action:`);
    lines.push(f.suggestedAction);
    lines.push('');
    lines.push(bar);
    lines.push('');
  }

  if (result.preExistingCount > 0) {
    lines.push(`Existing unchanged findings: ${result.preExistingCount}`);
    lines.push('Hidden because this PR did not introduce them.');
    lines.push('');
  }
  if (result.hiddenBySuppressionCount > 0) {
    lines.push(`Findings hidden by configured suppressions: ${result.hiddenBySuppressionCount}`);
    lines.push('');
  }
  const coverageGaps = result.coverage.head.gaps.length;
  if (coverageGaps > 0) {
    lines.push(
      `Coverage: ${coverageGaps} gap${coverageGaps === 1 ? '' : 's'} reported (INFO \u00b7 ARD008)`,
    );
    for (const gap of result.coverage.head.gaps) {
      lines.push(`  - [${gap.kind}] ${gap.scope}: ${gap.detail}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function findingCounts(result: AnalysisResult): {
  error: number;
  warning: number;
  info: number;
} {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of result.findings) {
    if (f.severity === 'ERROR') counts.error++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.info++;
  }
  return counts;
}

export function failsOn(result: AnalysisResult): boolean {
  const counts = findingCounts(result);
  if (result.config.failOn === 'never') return false;
  if (result.config.failOn === 'warning') return counts.error > 0 || counts.warning > 0;
  return counts.error > 0;
}

export function findingSummaryLine(f: Finding): string {
  return `${f.severity} \u00b7 ${f.ruleId} \u00b7 ${f.title} \u00b7 ${f.file}`;
}

import { AnalysisResult } from '../types';

export function formatMarkdown(result: AnalysisResult): string {
  const lines: string[] = [];
  lines.push('## AppReviewDelta');
  lines.push('');
  lines.push(
    `**${result.findings.length} review-sensitive change${result.findings.length === 1 ? '' : 's'} introduced by this PR**`,
  );
  lines.push('');
  if (result.findings.length > 0) {
    lines.push('| Severity | Rule | Finding | File |');
    lines.push('|---|---|---|---|');
    for (const f of result.findings) {
      lines.push(`| ${f.severity} | ${f.ruleId} | ${f.title} | \`${f.file}\` |`);
    }
    lines.push('');
  }
  for (const f of result.findings) {
    lines.push(`### ${f.severity} \u00b7 ${f.ruleId} \u00b7 ${f.title}`);
    lines.push('');
    lines.push(`**File:** \`${f.file}\``);
    if (f.line) lines.push(`**Line:** ${f.line}`);
    lines.push('');
    lines.push(`**Confidence:** ${f.confidence}`);
    if (f.heuristic) lines.push('_Heuristic finding, not a proven fact._');
    if (f.baseState !== undefined || f.headState !== undefined) {
      lines.push('');
      lines.push(`**Before:** ${f.baseState ?? '(not present)'}`);
      lines.push('');
      lines.push(`**After:** ${f.headState ?? '(removed)'}`);
    }
    lines.push('');
    lines.push(f.evidence);
    lines.push('');
    lines.push(`**Why this matters:** ${f.whyItMatters}`);
    lines.push('');
    lines.push(`**Suggested action:** ${f.suggestedAction}`);
    lines.push('');
    lines.push(`_Source: [${f.officialSource.title}](${f.officialSource.url})_`);
    lines.push('');
  }
  if (result.preExistingCount > 0) {
    lines.push(
      `> Existing unchanged findings: ${result.preExistingCount}. Hidden because this PR did not introduce them.`,
    );
    lines.push('');
  }
  if (result.hiddenBySuppressionCount > 0) {
    lines.push(`> Findings hidden by configured suppressions: ${result.hiddenBySuppressionCount}.`);
    lines.push('');
  }
  const gaps = result.coverage.head.gaps;
  if (gaps.length > 0) {
    lines.push('### Analysis coverage');
    lines.push('');
    for (const gap of gaps) {
      lines.push(`- \`[${gap.kind}]\` ${gap.scope}: ${gap.detail}`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push(
    '_AppReviewDelta does not guarantee App Store approval and is not affiliated with Apple. Target code is inspected as data and never executed._',
  );
  return lines.join('\n');
}

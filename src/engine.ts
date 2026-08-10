import {
  AnalysisResult,
  CandidateFinding,
  CoverageGap,
  Finding,
  RuleSummary,
  Severity,
  Snapshot,
} from './types';
import { AppReviewConfig, isIgnoreActive } from './config/load';
import { RULES, ruleById } from './rules/registry';
import { effectiveSeverity, getExpoConfig } from './rules/shared';
import { fingerprintOf } from './util/hash';
import { redacted } from './util/redact';
import picomatch from 'picomatch';

const SEVERITY_RANK: Record<Severity, number> = { INFO: 1, WARNING: 2, ERROR: 3 };

export interface AnalyzeOptions {
  version?: string;
}

export const TOOL_NAME = 'AppReviewDelta';

function candidateToFinding(
  c: CandidateFinding,
  introducedByPR: boolean,
  preExisting: boolean,
): Finding {
  const fingerprint = fingerprintOf([c.ruleId, c.semanticKey, c.file, c.valueClass]);
  return {
    ruleId: c.ruleId,
    title: c.title,
    severity: c.severity,
    confidence: c.confidence,
    category: c.category,
    file: c.file,
    evidence: redacted(c.evidence),
    baseState: c.baseState === undefined ? undefined : redacted(c.baseState),
    headState: c.headState === undefined ? undefined : redacted(c.headState),
    whyItMatters: c.whyItMatters,
    suggestedAction: c.suggestedAction,
    officialSource: c.officialSource,
    introducedByPR,
    analysisLimitations: c.analysisLimitations,
    fingerprint,
    semanticKey: c.semanticKey,
    line: c.line,
    preExisting,
    heuristic: c.heuristic,
  };
}

function isSuppressed(candidate: CandidateFinding, config: AppReviewConfig): boolean {
  for (const entry of config.ignore) {
    if (entry.rule !== candidate.ruleId) continue;
    if (entry.path && !picomatch(entry.path, { dot: true })(candidate.file)) continue;
    if (isIgnoreActive(entry)) return true;
  }
  return false;
}

function expoCoverageGaps(snapshot: Snapshot | null): CoverageGap[] {
  if (!snapshot) return [];
  const expo = getExpoConfig(snapshot);
  const gaps: CoverageGap[] = [];
  if (!expo.dynamic && expo.unresolvedFields.length === 0) return gaps;
  const fields = expo.unresolvedFields;
  if (expo.dynamic || fields.includes('*')) {
    gaps.push({
      kind: 'dynamic-config',
      scope: 'expo:*',
      detail: 'dynamic app config prevented static resolution of relevant fields',
    });
    return gaps;
  }
  for (const field of fields) {
    if (
      field === 'expo' ||
      field.startsWith('expo.ios') ||
      field.startsWith('ios') ||
      field === 'plugins' ||
      field.startsWith('expo')
    ) {
      gaps.push({
        kind: 'dynamic-config',
        scope: `expo:${field}`,
        detail: `field ${field} could not be resolved statically`,
      });
    }
  }
  return gaps;
}

function coverageKey(g: CoverageGap): string {
  return `${g.kind}:${g.scope}`;
}

function buildCoverageFindings(
  base: Snapshot | null,
  head: Snapshot,
  config: AppReviewConfig,
): CandidateFinding[] {
  const headGaps = [...head.coverage.gaps, ...expoCoverageGaps(head)];
  const baseGaps = base ? [...base.coverage.gaps, ...expoCoverageGaps(base)] : [];
  const baseKeys = new Set(baseGaps.map(coverageKey));
  const out: CandidateFinding[] = [];
  for (const gap of headGaps) {
    if (baseKeys.has(coverageKey(gap))) continue;
    const scopeLabel = gap.scope === '*' ? '(repository)' : gap.scope;
    out.push({
      ruleId: 'ARD008',
      title: 'Static analysis coverage gap',
      severity: effectiveSeverity('INFO', config, 'ARD008'),
      confidence: 'HIGH',
      category: 'coverage',
      file: scopeLabel,
      evidence: gap.detail,
      whyItMatters:
        'This area of configuration could not be fully analyzed, so the result may understate release-review risk.',
      suggestedAction: 'Resolve the configuration statically or manually review the affected area.',
      officialSource: {
        title: 'AppReviewDelta analysis coverage policy',
        url: 'https://github.com/569001773-wq/app-review-delta/blob/main/docs/LIMITATIONS.md',
      },
      analysisLimitations: [gap.detail],
      semanticKey: `coverage:${gap.kind}:${gap.scope}`,
      valueClass: gap.kind,
    });
  }
  return out;
}

export function analyze(
  base: Snapshot | null,
  head: Snapshot,
  config: AppReviewConfig,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const started = Date.now();
  const version = options.version ?? '0.0.0';
  const excludeMatcher = picomatch(config.excludePaths, { dot: true });
  const enabledRules = RULES.filter((r) => config.rules[r.id]?.enabled ?? true);

  const runCandidates = (snapshot: Snapshot, withBase: Snapshot | null): CandidateFinding[] => {
    const out: CandidateFinding[] = [];
    for (const rule of enabledRules) {
      try {
        out.push(
          ...rule.run({ base: withBase, head: snapshot, config }).map((c) => ({
            ...c,
            ruleId: rule.id,
          })),
        );
      } catch (err) {
        out.push({
          ruleId: rule.id,
          title: 'Rule execution failed (internal)',
          severity: 'WARNING',
          confidence: 'LOW',
          category: 'coverage',
          file: '(internal)',
          evidence: `Rule ${rule.id} failed: ${(err as Error).message}`,
          whyItMatters: 'An internal failure reduced analysis coverage for this rule.',
          suggestedAction: 'Report this issue to the AppReviewDelta maintainers.',
          officialSource: {
            title: 'AppReviewDelta internal error',
            url: 'https://github.com/569001773-wq/app-review-delta/issues',
          },
          semanticKey: `internal-error:${rule.id}`,
          valueClass: 'internal-error',
        });
      }
    }
    return out;
  };

  const headRaw = runCandidates(head, base);
  const baseRaw = base ? runCandidates(base, null) : [];
  const coverageFindings = buildCoverageFindings(base, head, config);
  const allHeadCandidates = [...headRaw, ...coverageFindings];

  let hiddenBySuppressionCount = 0;
  const visibleHead: CandidateFinding[] = [];
  for (const c of allHeadCandidates) {
    if (excludeMatcher(c.file)) continue;
    if (isSuppressed(c, config)) {
      hiddenBySuppressionCount++;
      continue;
    }
    visibleHead.push(c);
  }

  const baseByFingerprint = new Map<string, CandidateFinding>();
  for (const c of baseRaw) {
    if (excludeMatcher(c.file)) continue;
    if (isSuppressed(c, config)) continue;
    baseByFingerprint.set(fingerprintOf([c.ruleId, c.semanticKey, c.file, c.valueClass]), c);
  }

  const findings: Finding[] = [];
  let preExistingCount = 0;
  for (const c of visibleHead) {
    const fp = fingerprintOf([c.ruleId, c.semanticKey, c.file, c.valueClass]);
    const baseMatch = baseByFingerprint.get(fp);
    if (baseMatch) {
      const headRank = SEVERITY_RANK[c.severity];
      const baseRank = SEVERITY_RANK[baseMatch.severity];
      if (headRank > baseRank) {
        findings.push(candidateToFinding(c, true, false));
      } else {
        preExistingCount++;
      }
      continue;
    }
    findings.push(candidateToFinding(c, true, false));
  }

  findings.sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.file.localeCompare(b.file) ||
      a.title.localeCompare(b.title),
  );

  const ruleSummary: RuleSummary[] = RULES.map((rule) => {
    const introduced = findings.filter((f) => f.ruleId === rule.id).length;
    const preExisting = 0; // per-rule pre-existing not tracked in v1
    return {
      ruleId: rule.id,
      enabled: config.rules[rule.id]?.enabled ?? true,
      introduced,
      preExisting,
    };
  });
  void ruleById;

  return {
    tool: TOOL_NAME,
    version,
    baseRef: base?.ref ?? '(none)',
    headRef: head.ref,
    findings,
    preExistingCount,
    hiddenBySuppressionCount,
    ruleSummary,
    coverage: {
      base: base?.coverage ?? { gaps: [], notes: [] },
      head: head.coverage,
    },
    durationMs: Date.now() - started,
    config: {
      failOn: config.failOn,
      ruleOverrides: config.rules,
    },
  };
}

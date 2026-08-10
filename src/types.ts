export type Severity = 'ERROR' | 'WARNING' | 'INFO';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type FindingCategory =
  'privacy' | 'permissions' | 'network' | 'background' | 'secret' | 'sdk' | 'coverage' | 'config';

export interface OfficialSource {
  title: string;
  url: string;
}

/**
 * A finding after the base -> head subtraction and suppression pass.
 * `introducedByPR` is true only for findings the PR newly introduced or
 * materially worsened. `preExisting` findings are counted but not listed
 * as new.
 */
export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  category: FindingCategory;
  file: string;
  /** Human-readable, always redacted evidence. */
  evidence: string;
  baseState?: string;
  headState?: string;
  whyItMatters: string;
  suggestedAction: string;
  officialSource: OfficialSource;
  introducedByPR: boolean;
  analysisLimitations?: string[];
  /** Semantic fingerprint; stable across line moves and formatting changes. */
  fingerprint: string;
  /** Stable semantic key (rule-specific) used to build the fingerprint. */
  semanticKey: string;
  /** Best-effort line number in the head version of `file`. */
  line?: number;
  preExisting: boolean;
  /** True when the finding is a heuristic rather than an objective fact. */
  heuristic?: boolean;
}

/**
 * A candidate produced by a rule before base/head subtraction.
 * `semanticKey` + `valueClass` + `file` + `ruleId` form the fingerprint.
 */
export interface CandidateFinding {
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: Confidence;
  category: FindingCategory;
  file: string;
  evidence: string;
  baseState?: string;
  headState?: string;
  whyItMatters: string;
  suggestedAction: string;
  officialSource: OfficialSource;
  analysisLimitations?: string[];
  line?: number;
  semanticKey: string;
  valueClass: string;
  heuristic?: boolean;
}

export interface SnapshotFile {
  /** Normalized posix path relative to the repository root. */
  path: string;
  size: number;
  /** Raw bytes. Never interpreted as code. */
  content: Uint8Array;
  /** UTF-8 lossy text view for text files (empty for binary files). */
  text: string;
  source: 'github' | 'git';
  truncated?: boolean;
}

export type CoverageGapKind =
  | 'dynamic-config'
  | 'truncated-api'
  | 'missing-file'
  | 'oversized-file'
  | 'binary-file'
  | 'unparsable'
  | 'symlink'
  | 'unsupported-layout';

export interface CoverageGap {
  kind: CoverageGapKind;
  scope: string;
  detail: string;
}

export interface CoverageInfo {
  gaps: CoverageGap[];
  notes: string[];
}

export interface Snapshot {
  /** SHA (or local ref) this snapshot represents. */
  ref: string;
  files: Map<string, SnapshotFile>;
  coverage: CoverageInfo;
}

export interface RuleSummary {
  ruleId: string;
  enabled: boolean;
  introduced: number;
  preExisting: number;
}

export interface AnalysisResult {
  tool: string;
  version: string;
  baseRef: string;
  headRef: string;
  findings: Finding[];
  preExistingCount: number;
  hiddenBySuppressionCount: number;
  ruleSummary: RuleSummary[];
  coverage: {
    base: CoverageInfo;
    head: CoverageInfo;
  };
  durationMs: number;
  config: {
    failOn: 'error' | 'warning' | 'never';
    ruleOverrides: Record<string, { enabled?: boolean; severity?: Severity }>;
  };
}

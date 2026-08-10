export { analyze, TOOL_NAME } from './engine';
export type { AnalyzeOptions } from './engine';
export { AppReviewConfig, IgnoreEntry, RuleOverride, FailOn, ReasonCodeMode } from './config/types';
export { configFromText, configFromYaml, defaultConfig, isIgnoreActive } from './config/load';
export { parseConfig, ConfigError } from './config/schema';
export type {
  AnalysisResult,
  CandidateFinding,
  CoverageGap,
  CoverageInfo,
  Finding,
  FindingCategory,
  OfficialSource,
  RuleSummary,
  Severity,
  Snapshot,
  SnapshotFile,
  Confidence,
} from './types';
export { RULES, ruleById } from './rules/registry';
export type { Rule, RuleContext, RuleMetadata } from './rules/shared';
export { formatTerminal, formatMarkdown, formatJson, failsOn, findingCounts } from './reporting';
export { buildGitHubSnapshots, GitHubClient } from './github';
export { buildGitSnapshots, buildGitWorkingSnapshot } from './git/gitSnapshot';
export { VERSION } from './version';

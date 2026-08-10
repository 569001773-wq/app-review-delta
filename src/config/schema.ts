import type { AppReviewConfig, FailOn, IgnoreEntry, ReasonCodeMode, RuleOverride } from './types';
import type { Severity } from '../types';
import { KNOWN_RULES, SEVERITIES } from './types';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new ConfigError(`${what} must be a string`);
  return v;
}

function asBool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new ConfigError(`${what} must be a boolean`);
  return v;
}

function asNumber(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ConfigError(`${what} must be a number`);
  }
  return v;
}

function parseFailOn(v: unknown): FailOn {
  if (v === undefined) return 'error';
  if (v === 'error' || v === 'warning' || v === 'never') return v;
  throw new ConfigError('fail-on must be one of: error, warning, never');
}

function parseReasonCodeMode(v: unknown): ReasonCodeMode {
  if (v === undefined) return 'lenient';
  if (v === 'lenient' || v === 'strict') return v;
  throw new ConfigError('privacy-manifest.reason-code-mode must be one of: lenient, strict');
}

function parseRuleOverrides(v: unknown): Record<string, RuleOverride> {
  if (v === undefined) return {};
  if (!isRecord(v)) throw new ConfigError('rules must be an object');
  const out: Record<string, RuleOverride> = Object.create(null) as Record<string, RuleOverride>;
  for (const [ruleId, raw] of Object.entries(v)) {
    if (!(KNOWN_RULES as readonly string[]).includes(ruleId)) {
      throw new ConfigError(
        `Unknown rule id "${ruleId}" in rules. Known rules: ${KNOWN_RULES.join(', ')}`,
      );
    }
    if (!isRecord(raw)) throw new ConfigError(`rules.${ruleId} must be an object`);
    const override: RuleOverride = {};
    if (raw.enabled !== undefined)
      override.enabled = asBool(raw.enabled, `rules.${ruleId}.enabled`);
    if (raw.severity !== undefined) {
      if (!SEVERITIES.includes(raw.severity as never)) {
        throw new ConfigError(`rules.${ruleId}.severity must be one of: ${SEVERITIES.join(', ')}`);
      }
      override.severity = raw.severity as Severity;
    }
    out[ruleId] = override;
  }
  return out;
}

function parseIgnore(v: unknown): IgnoreEntry[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new ConfigError('ignore must be an array');
  const out: IgnoreEntry[] = [];
  for (const item of v) {
    if (!isRecord(item)) throw new ConfigError('each ignore entry must be an object');
    const rule = asString(item.rule, 'ignore[].rule');
    if (!(KNOWN_RULES as readonly string[]).includes(rule)) {
      throw new ConfigError(
        `Unknown rule id "${rule}" in ignore. Known rules: ${KNOWN_RULES.join(', ')}`,
      );
    }
    const reason = asString(item.reason, 'ignore[].reason');
    if (reason.trim().length === 0)
      throw new ConfigError('ignore[].reason is required and must not be empty');
    const entry: IgnoreEntry = { rule, reason };
    if (item.path !== undefined) {
      const path = asString(item.path, 'ignore[].path');
      if (path.startsWith('/') || path.split('/').includes('..')) {
        throw new ConfigError('ignore[].path must be relative to the repository root');
      }
      entry.path = path;
    }
    if (item.expires !== undefined) {
      const expires = asString(item.expires, 'ignore[].expires');
      const t = Date.parse(expires);
      if (Number.isNaN(t))
        throw new ConfigError('ignore[].expires must be an ISO date string (e.g. 2026-12-01)');
      entry.expires = new Date(t).toISOString().slice(0, 10);
    }
    out.push(entry);
  }
  return out;
}

function parseExcludePaths(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new ConfigError('exclude-paths must be an array of glob strings');
  return v.map((p, i) => asString(p, `exclude-paths[${i}]`));
}

function parseSdkCategories(v: unknown): Record<string, string[]> | undefined {
  if (v === undefined) return undefined;
  if (!isRecord(v))
    throw new ConfigError('sdk-categories must be an object of category -> package list');
  const out: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [cat, pkgs] of Object.entries(v)) {
    if (!Array.isArray(pkgs) || pkgs.some((p) => typeof p !== 'string')) {
      throw new ConfigError(`sdk-categories.${cat} must be an array of package names`);
    }
    out[cat] = pkgs as string[];
  }
  return out;
}

export function defaultConfig(): AppReviewConfig {
  return {
    failOn: 'error',
    rules: {},
    excludePaths: ['**/Pods/**', '**/node_modules/**', '**/build/**', '**/DerivedData/**'],
    ignore: [],
    reasonCodeMode: 'lenient',
    maxFileSizeBytes: 2 * 1024 * 1024,
    maxFiles: 300,
    maxComparePages: 2,
    maxPrFilesPages: 30,
  };
}

export function parseConfig(raw: unknown): AppReviewConfig {
  if (raw === undefined || raw === null) return defaultConfig();
  if (!isRecord(raw)) throw new ConfigError('configuration root must be an object');
  const base = defaultConfig();
  const cfg: AppReviewConfig = {
    ...base,
    failOn: parseFailOn(raw['fail-on'] ?? raw.failOn),
    rules: parseRuleOverrides(raw.rules),
    excludePaths: parseExcludePaths(raw['exclude-paths'] ?? raw.excludePaths),
    ignore: parseIgnore(raw.ignore),
    sdkCategories: parseSdkCategories(raw['sdk-categories'] ?? raw.sdkCategories),
  };
  const rawMax = raw['max-file-size-bytes'] ?? raw.maxFileSizeBytes;
  cfg.maxFileSizeBytes =
    rawMax === undefined ? base.maxFileSizeBytes : asNumber(rawMax, 'max-file-size-bytes');
  if (cfg.maxFileSizeBytes <= 0) throw new ConfigError('max-file-size-bytes must be positive');

  const rawPrPages = raw['max-pr-files-pages'] ?? raw.maxPrFilesPages;
  cfg.maxPrFilesPages =
    rawPrPages === undefined ? base.maxPrFilesPages : asNumber(rawPrPages, 'max-pr-files-pages');
  if (
    !Number.isInteger(cfg.maxPrFilesPages) ||
    cfg.maxPrFilesPages < 1 ||
    cfg.maxPrFilesPages > 30
  ) {
    throw new ConfigError('max-pr-files-pages must be an integer between 1 and 30');
  }

  const pm = raw['privacy-manifest'] ?? raw.privacyManifest;
  if (pm !== undefined) {
    if (!isRecord(pm)) throw new ConfigError('privacy-manifest must be an object');
    cfg.reasonCodeMode = parseReasonCodeMode(pm['reason-code-mode'] ?? pm.reasonCodeMode);
  }
  return cfg;
}

import { parse } from 'yaml';
import { AppReviewConfig, IgnoreEntry } from './types';
import { ConfigError, defaultConfig, parseConfig } from './schema';

export { AppReviewConfig, IgnoreEntry, ConfigError, defaultConfig };

export function configFromText(text: string, sourceLabel = 'config'): AppReviewConfig {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (err) {
    throw new ConfigError(`${sourceLabel}: invalid YAML: ${(err as Error).message}`);
  }
  return parseConfig(doc);
}

export function configFromYaml(text: string): AppReviewConfig {
  return configFromText(text, 'config');
}

/**
 * Returns true when the ignore entry currently applies (not expired).
 */
export function isIgnoreActive(entry: IgnoreEntry, today: Date = new Date()): boolean {
  if (!entry.expires) return true;
  const expiry = Date.parse(entry.expires);
  if (Number.isNaN(expiry)) return true;
  // Expired on or before today -> no longer active.
  return today.getTime() < expiry;
}

export function mergedRuleSeverity(
  defaultSeverity: 'ERROR' | 'WARNING' | 'INFO',
  config: AppReviewConfig,
  ruleId: string,
): 'ERROR' | 'WARNING' | 'INFO' {
  return config.rules[ruleId]?.severity ?? defaultSeverity;
}

export function ruleEnabled(config: AppReviewConfig, ruleId: string): boolean {
  return config.rules[ruleId]?.enabled ?? true;
}

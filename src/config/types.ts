import type { Severity } from '../types';

export type FailOn = 'error' | 'warning' | 'never';
export type ReasonCodeMode = 'lenient' | 'strict';

export interface RuleOverride {
  enabled?: boolean;
  severity?: Severity;
}

export interface IgnoreEntry {
  rule: string;
  path?: string;
  reason: string;
  expires?: string;
}

export interface SdkCategoryConfig {
  [category: string]: string[];
}

export interface AppReviewConfig {
  failOn: FailOn;
  rules: Record<string, RuleOverride>;
  excludePaths: string[];
  ignore: IgnoreEntry[];
  reasonCodeMode: ReasonCodeMode;
  maxFileSizeBytes: number;
  maxFiles: number;
  maxComparePages: number;
  /** PR files API pagination cap (per_page=100, max 3000 files). */
  maxPrFilesPages: number;
  sdkCategories?: SdkCategoryConfig;
}

export const KNOWN_RULES = [
  'ARD001',
  'ARD002',
  'ARD003',
  'ARD004',
  'ARD005',
  'ARD006',
  'ARD007',
  'ARD008',
  'ARD009',
] as const;

export const SEVERITIES: Severity[] = ['ERROR', 'WARNING', 'INFO'];

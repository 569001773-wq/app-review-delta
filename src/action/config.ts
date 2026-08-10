import { AppReviewConfig, configFromText, defaultConfig } from '../config/load';
import { FetchedFile, GitHubClient } from '../github/client';

/**
 * Resolves the scanner policy for a pull-request check.
 *
 * Security: the policy is read from the BASE (trusted) revision by default so
 * a PR cannot change the rules, suppressions, severities, or fail threshold
 * that gate its own check. PR-side policy changes are still detected and
 * reported (ARD009) and take effect only after merge. Consumers can opt into
 * head policy with `config-ref: head`, which is documented as untrusted.
 */

export type ConfigRef = 'base' | 'head';

export interface ResolvedActionConfig {
  config: AppReviewConfig;
  sourceRef: string;
  policyChanged: boolean;
}

export interface ResolveActionConfigInput {
  baseClient: GitHubClient;
  headClient: GitHubClient;
  baseSha: string;
  headSha: string;
  configPath: string;
  configRef: ConfigRef;
  inputFailOn?: string;
  inputMaxFileSize?: number;
}

function decodeFile(f: FetchedFile): string | null {
  if (f.missing || f.truncated || f.content.length === 0) return null;
  return new TextDecoder('utf-8', { fatal: false }).decode(f.content).replace(/^\uFEFF/, '');
}

export function isConfigRef(value: string): value is ConfigRef {
  return value === 'base' || value === 'head';
}

export async function resolveActionConfig(
  input: ResolveActionConfigInput,
): Promise<ResolvedActionConfig> {
  const cfg = defaultConfig();
  const [baseFile, headFile] = await Promise.all([
    input.baseClient.getFile(input.configPath, input.baseSha, cfg.maxFileSizeBytes),
    input.headClient.getFile(input.configPath, input.headSha, cfg.maxFileSizeBytes),
  ]);
  const baseText = decodeFile(baseFile);
  const headText = decodeFile(headFile);

  const sourceText = input.configRef === 'head' ? headText : baseText;
  const config =
    sourceText !== null ? configFromText(sourceText, input.configPath) : defaultConfig();

  if (input.inputFailOn) {
    config.failOn = input.inputFailOn as AppReviewConfig['failOn'];
  }
  if (input.inputMaxFileSize !== undefined) {
    config.maxFileSizeBytes = input.inputMaxFileSize;
  }

  return {
    config,
    sourceRef: input.configRef === 'head' ? input.headSha : input.baseSha,
    policyChanged: baseText !== headText,
  };
}

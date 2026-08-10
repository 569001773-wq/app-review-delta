/**
 * The scoped set of files AppReviewDelta reads. Everything else in the
 * repository is ignored: target code is inspected as data, never executed.
 */

const RELEVANT_PATH_PATTERNS: RegExp[] = [
  // Expo / React Native config.
  /^package\.json$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^bun\.lock$/,
  /^bun\.lockb$/,
  /^app\.json$/,
  /^app\.config\.json$/,
  /^app\.config\.js$/,
  /^app\.config\.ts$/,
  /^eas\.json$/,
  // iOS native configuration.
  /\.xcprivacy$/,
  /(^|\/)Info\.plist$/,
  /\.entitlements$/,
  /^ios\/[^/]*\.plist$/,
  /^ios\/[^/]+\/Info\.plist$/,
  /^ios\/[^/]+\/[^/]*\.plist$/,
  // Committed environment files (only where secrets may leak into CI).
  /^\.env(\.[a-zA-Z0-9._-]+)?$/,
  // Secret-shaped files (for ARD006).
  /\.(pem|p8|key|p12|pfx|p7b|jks|keystore)$/i,
  /(^|\/)(credentials|secrets?|private[_-]?keys?|authkey[_-]?[0-9a-zA-Z]*)\.[^.]+$/i,
];

/**
 * True when a changed path is part of the analysis scope.
 * Note: `excludePaths` filtering happens at fetch time.
 */
export function isRelevantPath(path: string): boolean {
  return RELEVANT_PATH_PATTERNS.some((re) => re.test(path));
}

/** Root-level config files that are relevant even when unchanged in a PR. */
export const ALWAYS_RELEVANT = [
  'package.json',
  'app.json',
  'app.config.json',
  'app.config.js',
  'app.config.ts',
] as const;

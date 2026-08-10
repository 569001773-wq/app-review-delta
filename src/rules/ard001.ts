import { PlistValue, isArray, isDict } from '../parsers/plist';
import {
  CandidateFindingInput,
  Rule,
  RuleContext,
  effectiveSeverity,
  isDictValue,
  listPrivacyManifestSources,
} from './shared';
import {
  PRIVACY_ACCESSED_CATEGORIES,
  PRIVACY_ACCESSED_LAST_VERIFIED,
  COLLECTED_DATA_PURPOSES,
  COLLECTED_DATA_PURPOSES_LAST_VERIFIED,
  PRIVACY_MANIFEST_TOP_LEVEL_KEYS,
  REASON_CODE_FORMAT,
} from './privacyManifestData';

const SOURCE = {
  title:
    'Describing use of required reason API | Privacy manifest files | App Privacy Configuration',
  url: 'https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api',
};

function finding(
  ctx: RuleContext,
  file: string,
  severity: 'ERROR' | 'WARNING' | 'INFO',
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  semanticKey: string,
  valueClass: string,
  title: string,
  evidence: string,
  whyItMatters: string,
  suggestedAction: string,
  analysisLimitations?: string[],
): CandidateFindingInput {
  return {
    title,
    severity: effectiveSeverity(severity, ctx.config, ARD001.id),
    confidence,
    category: 'privacy',
    file,
    evidence,
    whyItMatters,
    suggestedAction,
    officialSource: SOURCE,
    analysisLimitations,
    semanticKey,
    valueClass,
  };
}

function reasonCodeSet(v: PlistValue | undefined): string[] | null {
  if (!isArray(v)) return null;
  const out: string[] = [];
  for (const r of v) {
    if (typeof r !== 'string') return null;
    out.push(r.trim());
  }
  return out;
}

function validateManifest(
  ctx: RuleContext,
  file: string,
  root: PlistValue | undefined,
  parseError: string | undefined,
): CandidateFindingInput[] {
  const out: CandidateFindingInput[] = [];
  if (parseError) {
    out.push(
      finding(
        ctx,
        file,
        'ERROR',
        'HIGH',
        'manifest:unparsable',
        'unparsable',
        'Privacy manifest cannot be parsed',
        `PrivacyInfo.xcprivacy is not valid XML/plist: ${parseError}`,
        'A privacy manifest that cannot be parsed is not a valid manifest, and App Store Connect may reject the build.',
        'Fix the plist syntax so the manifest parses as valid XML.',
      ),
    );
    return out;
  }
  if (!isDictValue(root)) {
    out.push(
      finding(
        ctx,
        file,
        'ERROR',
        'HIGH',
        'manifest:root-not-dict',
        'root-not-dict',
        'Privacy manifest root is not a dictionary',
        'The top-level value of the privacy manifest must be a dictionary.',
        'Apple documents the manifest root as a dictionary of specific keys.',
        'Restructure the manifest so the top level is a dictionary.',
      ),
    );
    return out;
  }

  // Unknown top-level keys.
  for (const key of Object.keys(root)) {
    if (!(PRIVACY_MANIFEST_TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      out.push(
        finding(
          ctx,
          file,
          'INFO',
          'LOW',
          'manifest:unknown-top-level-key',
          `key:${key}`,
          'Unrecognized privacy-manifest key',
          `Top-level key "${key}" is not among the keys documented by Apple (checked ${PRIVACY_ACCESSED_LAST_VERIFIED}).`,
          'Apple documents four top-level keys; unrecognized keys may be typos or unsupported additions.',
          'Verify the key against current Apple documentation and remove it if unused.',
          ['Apple may add keys over time; treat this as informational.'],
        ),
      );
    }
  }

  // NSPrivacyTracking + NSPrivacyTrackingDomains.
  const tracking = root['NSPrivacyTracking'];
  if (tracking !== undefined && typeof tracking !== 'boolean') {
    out.push(
      finding(
        ctx,
        file,
        'ERROR',
        'HIGH',
        'manifest:tracking-not-bool',
        'tracking-not-bool',
        'NSPrivacyTracking is not a boolean',
        `NSPrivacyTracking has type ${typeof tracking}; Apple documents it as a Boolean.`,
        'A non-boolean tracking declaration is structurally invalid.',
        'Set NSPrivacyTracking to true or false.',
      ),
    );
  }
  const domains = root['NSPrivacyTrackingDomains'];
  if (tracking === true) {
    if (!isArray(domains) || domains.length === 0) {
      out.push(
        finding(
          ctx,
          file,
          'ERROR',
          'HIGH',
          'manifest:tracking-without-domains',
          'tracking-without-domains',
          'Tracking enabled without a tracking-domain list',
          'NSPrivacyTracking is true but NSPrivacyTrackingDomains is missing or empty.',
          'Apple requires a list of internet domains when tracking is enabled.',
          'Provide the tracking domains used, or set NSPrivacyTracking to false.',
        ),
      );
    } else {
      domains.forEach((d, i) => {
        if (typeof d !== 'string') {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:domain-not-string',
              `entry:${i}`,
              'Tracking-domain entry is not a string',
              `NSPrivacyTrackingDomains[${i}] is ${typeof d}; entries must be strings.`,
              'Apple documents tracking domains as a list of internet domains (strings).',
              'Replace the entry with a string domain.',
            ),
          );
          return;
        }
        if (/\s/.test(d)) {
          out.push(
            finding(
              ctx,
              file,
              'WARNING',
              'MEDIUM',
              'manifest:domain-whitespace',
              `entry:${d}`,
              'Tracking-domain entry contains whitespace',
              `NSPrivacyTrackingDomains entry "${d}" contains whitespace and does not look like a domain.`,
              'Domains with whitespace are unlikely to match real tracking traffic and may be misconfigured.',
              'Use a plain internet domain such as example.com.',
            ),
          );
        } else if (/:\/\//.test(d)) {
          out.push(
            finding(
              ctx,
              file,
              'WARNING',
              'LOW',
              'manifest:domain-scheme',
              `entry:${d}`,
              'Tracking-domain entry includes a URL scheme',
              `NSPrivacyTrackingDomains entry "${d}" includes a scheme; Apple documents domain names.`,
              'A scheme prefix may not match the format Apple expects.',
              'Verify the entry format against current Apple documentation.',
              [
                'Apple does not publish a formal grammar for this field; format is verified heuristically.',
              ],
            ),
          );
        }
      });
    }
  } else if (domains !== undefined) {
    out.push(
      finding(
        ctx,
        file,
        'WARNING',
        'MEDIUM',
        'manifest:domains-without-tracking',
        'domains-without-tracking',
        'Tracking domains declared while tracking is not enabled',
        'NSPrivacyTrackingDomains is present but NSPrivacyTracking is not true.',
        'Declared tracking domains with tracking disabled may be inconsistent or misleading in App Privacy reporting.',
        'Align the declaration: enable tracking with a domain list, or remove the domains.',
      ),
    );
  }

  // NSPrivacyAccessedAPITypes.
  const accessed = root['NSPrivacyAccessedAPITypes'];
  if (accessed !== undefined) {
    if (!isArray(accessed)) {
      out.push(
        finding(
          ctx,
          file,
          'ERROR',
          'HIGH',
          'manifest:accessed-not-array',
          'accessed-not-array',
          'NSPrivacyAccessedAPITypes is not an array',
          'Apple documents NSPrivacyAccessedAPITypes as an array of dictionaries.',
          'A non-array value is structurally invalid.',
          'Provide an array of dictionaries with the required keys.',
        ),
      );
    } else {
      accessed.forEach((entry, i) => {
        if (!isDict(entry)) {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:accessed-entry-not-dict',
              `entry:${i}`,
              'Privacy-accessed-API entry is not a dictionary',
              `NSPrivacyAccessedAPITypes[${i}] is not a dictionary.`,
              'Each accessed-API entry must be a dictionary with NSPrivacyAccessedAPIType and NSPrivacyAccessedAPITypeReasons.',
              'Replace the entry with a dictionary.',
            ),
          );
          return;
        }
        const type = entry['NSPrivacyAccessedAPIType'];
        const reasons = reasonCodeSet(entry['NSPrivacyAccessedAPITypeReasons']);
        if (typeof type !== 'string' || type.trim().length === 0) {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:type-not-string',
              `entry:${i}`,
              'NSPrivacyAccessedAPIType is missing or not a string',
              'Each accessed-API entry requires an NSPrivacyAccessedAPIType string.',
              'Apple requires the type value to be one of the documented categories.',
              'Provide the documented category identifier.',
            ),
          );
        } else if (!(type in PRIVACY_ACCESSED_CATEGORIES)) {
          out.push(
            finding(
              ctx,
              file,
              'WARNING',
              'MEDIUM',
              'manifest:unknown-category',
              `category:${type}`,
              'Privacy-accessed-API category is not in the documented set',
              `"${type}" is not among the categories documented by Apple on ${PRIVACY_ACCESSED_LAST_VERIFIED}.`,
              'Apple requires category values from its documented list, which it updates over time.',
              'Verify the category against current Apple documentation.',
              [
                'Apple states the list is continually reviewed; an unknown value may be newly added.',
              ],
            ),
          );
        }
        if (reasons === null) {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:reasons-not-array',
              `entry:${i}`,
              'NSPrivacyAccessedAPITypeReasons is not an array of strings',
              'Apple documents NSPrivacyAccessedAPITypeReasons as an array of strings.',
              'A non-string-array value is structurally invalid.',
              'Provide the approved reason codes as strings.',
            ),
          );
        } else if (reasons.length === 0) {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:reasons-empty',
              `category:${type}`,
              'Privacy-accessed-API reasons list is empty',
              'Apple requires one or more approved reasons for each declared API category.',
              'An empty reasons list is structurally invalid.',
              'Add the approved reason code(s) for this API category.',
            ),
          );
        } else if (typeof type === 'string') {
          const allowed = PRIVACY_ACCESSED_CATEGORIES[type];
          reasons.forEach((reason) => {
            if (!REASON_CODE_FORMAT.test(reason)) {
              out.push(
                finding(
                  ctx,
                  file,
                  'ERROR',
                  'HIGH',
                  'manifest:reason-format',
                  `category:${type}:reason:${reason}`,
                  'Privacy reason code is malformed',
                  `Reason "${reason}" for ${type} does not match Apple's code format (e.g. CA92.1).`,
                  'Malformed reason codes are structurally invalid.',
                  'Use an Apple-approved reason code in the documented format.',
                ),
              );
            } else if (allowed && !allowed.includes(reason)) {
              const strict = ctx.config.reasonCodeMode === 'strict';
              out.push(
                finding(
                  ctx,
                  file,
                  strict ? 'ERROR' : 'WARNING',
                  'HIGH',
                  'manifest:reason-not-documented',
                  `category:${type}:reason:${reason}`,
                  'Privacy reason code is not in the documented set for this category',
                  `"${reason}" is not among the reasons documented for ${type} on ${PRIVACY_ACCESSED_LAST_VERIFIED}.`,
                  'Apple requires reasons to be among the values associated with the accessed API type.',
                  'Verify the reason code against current Apple documentation.',
                  [
                    'Apple updates reason codes over time; this check reflects the documentation version above.',
                  ],
                ),
              );
            }
          });
        }
      });
    }
  }

  // NSPrivacyCollectedDataTypes (structural validation only).
  const collected = root['NSPrivacyCollectedDataTypes'];
  if (collected !== undefined) {
    if (!isArray(collected)) {
      out.push(
        finding(
          ctx,
          file,
          'ERROR',
          'HIGH',
          'manifest:collected-not-array',
          'collected-not-array',
          'NSPrivacyCollectedDataTypes is not an array',
          'Apple documents NSPrivacyCollectedDataTypes as an array of dictionaries.',
          'A non-array value is structurally invalid.',
          'Provide an array of data-type dictionaries.',
        ),
      );
    } else {
      collected.forEach((entry, i) => {
        if (!isDict(entry)) {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:collected-entry-not-dict',
              `entry:${i}`,
              'Collected-data entry is not a dictionary',
              `NSPrivacyCollectedDataTypes[${i}] is not a dictionary.`,
              'Each collected-data entry must be a dictionary.',
              'Replace the entry with a dictionary.',
            ),
          );
          return;
        }
        const dtype = entry['NSPrivacyCollectedDataType'];
        if (typeof dtype !== 'string' || dtype.trim().length === 0) {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:collected-missing-type',
              `entry:${i}`,
              'Collected-data entry is missing NSPrivacyCollectedDataType',
              'Apple requires NSPrivacyCollectedDataType in each collected-data entry.',
              'A missing data type is structurally invalid.',
              'Provide the data-type identifier.',
            ),
          );
        }
        for (const boolKey of [
          'NSPrivacyCollectedDataTypeLinked',
          'NSPrivacyCollectedDataTypeTracking',
        ]) {
          const bv = entry[boolKey];
          if (bv === undefined) {
            out.push(
              finding(
                ctx,
                file,
                'ERROR',
                'HIGH',
                'manifest:collected-missing-bool',
                `entry:${i}:${boolKey}`,
                `${boolKey} is missing`,
                `Apple documents ${boolKey} as a required Boolean in each collected-data entry.`,
                'A collected-data entry without the linked/tracking Booleans is structurally incomplete.',
                `Add ${boolKey} (true or false).`,
              ),
            );
          } else if (typeof bv !== 'boolean') {
            out.push(
              finding(
                ctx,
                file,
                'ERROR',
                'HIGH',
                'manifest:collected-bool-not-boolean',
                `entry:${i}:${boolKey}`,
                `${boolKey} is not a boolean`,
                `Apple documents ${boolKey} as a Boolean.`,
                'A non-boolean value is structurally invalid.',
                'Set the value to true or false.',
              ),
            );
          }
        }
        const purposes = entry['NSPrivacyCollectedDataTypePurposes'];
        if (purposes === undefined) {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:collected-missing-purposes',
              `entry:${i}`,
              'NSPrivacyCollectedDataTypePurposes is missing',
              'Apple documents collection purposes as a required array of strings in each collected-data entry.',
              'A collected-data entry without purposes is structurally incomplete.',
              'Add the purposes array with documented purpose values.',
            ),
          );
        } else if (!isArray(purposes)) {
          out.push(
            finding(
              ctx,
              file,
              'ERROR',
              'HIGH',
              'manifest:purposes-not-array',
              `entry:${i}`,
              'NSPrivacyCollectedDataTypePurposes is not an array',
              'Apple documents purposes as an array of strings.',
              'A non-array value is structurally invalid.',
              'Provide the purposes as an array of strings.',
            ),
          );
        } else {
          purposes.forEach((p, pi) => {
            if (typeof p !== 'string') {
              out.push(
                finding(
                  ctx,
                  file,
                  'ERROR',
                  'HIGH',
                  'manifest:collected-purpose-not-string',
                  `entry:${i}:purpose:${pi}`,
                  'Collection-purpose entry is not a string',
                  `NSPrivacyCollectedDataTypePurposes[${pi}] is ${typeof p}; entries must be strings.`,
                  'Apple documents purposes as an array of strings.',
                  'Use documented purpose values.',
                ),
              );
              return;
            }
            if (!(COLLECTED_DATA_PURPOSES as readonly string[]).includes(p)) {
              const strict = ctx.config.reasonCodeMode === 'strict';
              out.push(
                finding(
                  ctx,
                  file,
                  strict ? 'ERROR' : 'WARNING',
                  'HIGH',
                  'manifest:collected-purpose-not-documented',
                  `entry:${i}:purpose:${p}`,
                  'Collection purpose is not in the documented set',
                  `"${p}" is not among the purposes documented by Apple on ${COLLECTED_DATA_PURPOSES_LAST_VERIFIED}.`,
                  'Apple states that custom purposes break privacy-report generation.',
                  'Use one of the documented purpose values.',
                  [
                    'Apple may add purposes over time; this check reflects the documentation version above.',
                  ],
                ),
              );
            }
          });
        }
      });
    }
  }
  return out;
}

export const ARD001: Rule = {
  id: 'ARD001',
  metadata: {
    id: 'ARD001',
    title: 'Invalid Privacy Manifest',
    category: 'privacy',
    defaultSeverity: 'ERROR',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'PrivacyInfo.xcprivacy (or expo.ios.privacyManifests) must follow the structure Apple documents; App Store Connect does not accept apps that fail to describe required-reason API use.',
    detectionLogic:
      'Parses PrivacyInfo.xcprivacy and statically resolvable expo.ios.privacyManifests and validates documented structural rules: root dictionary, boolean tracking flag, domain list when tracking is enabled, accessed-API type/reasons arrays, reason-code format and (with lastVerified caveats) membership, collected-data structure. Unknown categories/reasons are WARNING (lenient mode) because Apple updates the list.',
    falsePositives:
      'Reason-code membership reflects the Apple documentation version checked on 2026-08-10; a valid newly added code can trigger a lenient-mode WARNING. Unknown top-level keys are INFO only. Domain formatting is heuristic.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    const out: CandidateFindingInput[] = [];
    for (const src of listPrivacyManifestSources(ctx.head)) {
      out.push(...validateManifest(ctx, src.file, src.value, src.error));
    }
    return out;
  },
};

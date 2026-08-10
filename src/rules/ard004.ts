import { PlistValue } from '../parsers/plist';
import {
  CandidateFindingInput,
  Rule,
  RuleContext,
  effectiveSeverity,
  isDictValue,
  listInfoPlistSources,
} from './shared';
import { fingerprintOf } from '../util/hash';

const SOURCE = {
  title: 'Information Property List: protected-resource usage descriptions (Apple Developer)',
  url: 'https://developer.apple.com/documentation/bundleresources/information-property-list',
};

const TRACKED_KEYS = [
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
  'NSLocationWhenInUseUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
  'NSContactsUsageDescription',
  'NSUserTrackingUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSCalendarsUsageDescription',
  'NSCalendarsFullAccessUsageDescription',
  'NSCalendarsWriteOnlyAccessUsageDescription',
  'NSRemindersUsageDescription',
  'NSRemindersFullAccessUsageDescription',
  'NSMotionUsageDescription',
  'NSSpeechRecognitionUsageDescription',
  'NSFaceIDUsageDescription',
  'NSHealthShareUsageDescription',
  'NSHealthUpdateUsageDescription',
  'NSLocalNetworkUsageDescription',
  'NSAppleMusicUsageDescription',
  'NSSiriUsageDescription',
  'NSVideoSubscriberAccountUsageDescription',
];

const PLACEHOLDER =
  /(your text here|add your (own )?text|describe why|replace (this|me)|lorem ipsum|todo|fix ?me|placeholder|insert (a )?reason|permission (reason|description)|xxx|foo ?bar)/i;
const GENERIC =
  /^(this |the |our |your )?app (needs|uses|requires|wants (to )?use) (access to )?(the )?(camera|microphone|photos?|location|contacts)/i;

type ValueClass = 'empty' | 'placeholder' | 'generic' | 'explicit';

function classify(v: string): { cls: ValueClass; heuristic: boolean } {
  const trimmed = v.trim();
  if (trimmed.length === 0) return { cls: 'empty', heuristic: false };
  if (PLACEHOLDER.test(trimmed)) return { cls: 'placeholder', heuristic: true };
  if (GENERIC.test(trimmed) && trimmed.length < 80) return { cls: 'generic', heuristic: true };
  return { cls: 'explicit', heuristic: false };
}

function permissionValue(plist: PlistValue | undefined, key: string): PlistValue | undefined {
  if (!isDictValue(plist)) return undefined;
  return plist[key];
}

export const ARD004: Rule = {
  id: 'ARD004',
  metadata: {
    id: 'ARD004',
    title: 'Sensitive Permission Configuration Changed',
    category: 'permissions',
    defaultSeverity: 'WARNING',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'New or materially changed iOS permission surfaces (camera, microphone, photos, location, contacts, tracking, etc.) are review-sensitive; purpose strings must actually tell people why access is requested.',
    detectionLogic:
      'Tracks the documented NS*UsageDescription keys across Info.plist files and statically resolvable expo.ios.infoPlist. Emits: INFO when a permission surface is introduced; WARNING for empty or placeholder purpose strings; INFO for heuristically generic wording; INFO when an existing purpose string is materially rewordinged. Facts and heuristics are labelled separately.',
    falsePositives:
      'Merely adding a permission key does not imply rejection (INFO only). Generic-wording detection is a heuristic and never ERROR. Presence of expo-camera without usage description is not reported because API use cannot be proven statically.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    const out: CandidateFindingInput[] = [];
    for (const src of listInfoPlistSources(ctx.head)) {
      if (src.error) continue;
      const plist = src.value;
      const baseSrc = ctx.base
        ? listInfoPlistSources(ctx.base).find((s) => s.file === src.file)
        : undefined;
      const basePlist = baseSrc && !baseSrc.error ? baseSrc.value : undefined;

      for (const key of TRACKED_KEYS) {
        const headValue = permissionValue(plist, key);
        const baseValue = permissionValue(basePlist, key);
        if (headValue === undefined) continue;

        // Apple defines every tracked NS*UsageDescription as a string; a
        // non-string value is an objectively invalid configuration.
        if (typeof headValue !== 'string') {
          out.push({
            title: `${key} must be a string`,
            severity: effectiveSeverity('ERROR', ctx.config, 'ARD004'),
            confidence: 'HIGH',
            category: 'permissions',
            file: src.file,
            evidence: `fact: ${key} in ${src.label} has type ${typeof headValue}; Apple defines it as a string.`,
            headState: String(headValue),
            whyItMatters:
              'A non-string usage description is structurally invalid and cannot display as the permission prompt.',
            suggestedAction: 'Set the key to a string that tells people why access is requested.',
            officialSource: SOURCE,
            semanticKey: `permission-type:${key}`,
            valueClass: 'non-string',
          });
          continue;
        }

        const headCls = classify(headValue);
        const baseCls =
          baseValue === undefined || typeof baseValue !== 'string'
            ? undefined
            : classify(baseValue);

        if (baseValue === undefined) {
          // New permission surface.
          out.push({
            title: `Permission surface introduced: ${key}`,
            severity: effectiveSeverity('INFO', ctx.config, 'ARD004'),
            confidence: 'HIGH',
            category: 'permissions',
            file: src.file,
            evidence: `fact: this PR adds ${key} (${src.label}).`,
            headState: headValue,
            whyItMatters:
              'A new protected-resource permission changes the App Store review surface and the user-facing permission prompt.',
            suggestedAction:
              'Confirm the permission is actually used and the purpose string is clear and specific.',
            officialSource: SOURCE,
            semanticKey: `permission-added:${key}`,
            valueClass: 'added',
          });
        }

        // Quality candidates: emitted whenever the head value is problematic so
        // the subtraction engine can hide problems that already existed in base.
        if (headCls.cls === 'empty' || headCls.cls === 'placeholder') {
          out.push({
            title:
              headCls.cls === 'empty'
                ? `Permission purpose string is empty: ${key}`
                : `Permission purpose string looks like a placeholder: ${key}`,
            severity: effectiveSeverity('WARNING', ctx.config, 'ARD004'),
            confidence: 'HIGH',
            category: 'permissions',
            file: src.file,
            evidence: `fact: ${key} changed in ${src.label}.`,
            baseState: typeof baseValue === 'string' ? baseValue : undefined,
            headState: headValue === '' ? '(empty string)' : headValue,
            whyItMatters:
              'Apple requires a message that tells people why the app requests access; an empty or placeholder string fails that purpose.',
            suggestedAction: 'Provide a clear, specific purpose string for the permission.',
            officialSource: SOURCE,
            semanticKey: `permission-quality:${key}`,
            valueClass: headCls.cls,
            heuristic: headCls.heuristic,
          });
        } else if (headCls.cls === 'generic' && baseCls?.cls !== 'generic') {
          out.push({
            title: `Permission purpose string may be generic: ${key}`,
            severity: effectiveSeverity('INFO', ctx.config, 'ARD004'),
            confidence: 'LOW',
            category: 'permissions',
            file: src.file,
            evidence: `heuristic: the purpose string for ${key} in ${src.label} uses generic default wording.`,
            headState: headValue,
            whyItMatters:
              'A generic purpose string may not accurately tell people why access is requested; review it before submission.',
            suggestedAction: 'Tailor the string to the specific permission use.',
            officialSource: SOURCE,
            semanticKey: `permission-quality:${key}`,
            valueClass: 'generic',
            heuristic: true,
          });
        }

        // Wording change between two explicit strings.
        if (baseValue !== undefined && baseCls?.cls === 'explicit' && headCls.cls === 'explicit') {
          // Wording changed but quality class unchanged.
          const baseStr = typeof baseValue === 'string' ? baseValue : '';
          const normBase = baseStr.trim().replace(/\s+/g, ' ');
          const normHead = headValue.trim().replace(/\s+/g, ' ');
          if (normBase !== normHead) {
            out.push({
              title: `Permission purpose string changed: ${key}`,
              severity: effectiveSeverity('INFO', ctx.config, 'ARD004'),
              confidence: 'LOW',
              category: 'permissions',
              file: src.file,
              evidence: `fact: the purpose string for ${key} changed in ${src.label}.`,
              baseState: typeof baseValue === 'string' ? baseValue : undefined,
              headState: headValue,
              whyItMatters:
                'A changed purpose string is review-sensitive; it should accurately describe the permission use.',
              suggestedAction: 'Verify the new wording is accurate and specific.',
              officialSource: SOURCE,
              semanticKey: `permission-changed:${key}`,
              valueClass: fingerprintOf(['wording', key, normHead]),
            });
          }
        }

        // Quality problems on a newly introduced or newly degraded value are
        // reported above; also report when the value itself is problematic
        // and was not present in base (empty/placeholder quality findings).
        if (
          baseValue !== undefined &&
          baseCls &&
          headCls.cls === 'empty' &&
          baseCls.cls !== 'empty'
        ) {
          // already covered by the quality-change branch above
        }
      }
    }
    return out;
  },
};

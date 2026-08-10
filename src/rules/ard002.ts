import { PlistValue } from '../parsers/plist';
import {
  CandidateFindingInput,
  Rule,
  RuleContext,
  isDictValue,
  listPrivacyManifestSources,
  normalizeList,
} from './shared';
import { PRIVACY_ACCESSED_LAST_VERIFIED } from './privacyManifestData';

const SOURCE = {
  title: 'Describing use of required reason API | Privacy manifest files',
  url: 'https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api',
};

interface ManifestModel {
  file: string;
  tracking: boolean | undefined;
  domains: string[];
  accessed: Map<string, string[]>;
}

function modelOf(
  file: string,
  root: PlistValue | undefined,
  parseError: string | undefined,
): ManifestModel | null {
  if (parseError || !isDictValue(root)) return null;
  const accessed = new Map<string, string[]>();
  const rawAccessed = root['NSPrivacyAccessedAPITypes'];
  if (Array.isArray(rawAccessed)) {
    for (const entry of rawAccessed) {
      if (!isDictValue(entry)) continue;
      const type = entry['NSPrivacyAccessedAPIType'];
      const reasons = entry['NSPrivacyAccessedAPITypeReasons'];
      if (typeof type === 'string' && Array.isArray(reasons)) {
        accessed.set(
          type,
          reasons
            .filter((r): r is string => typeof r === 'string')
            .map((r) => r.trim())
            .sort(),
        );
      }
    }
  }
  const tracking = root['NSPrivacyTracking'];
  return {
    file,
    tracking: typeof tracking === 'boolean' ? tracking : undefined,
    domains: normalizeList(root['NSPrivacyTrackingDomains']),
    accessed,
  };
}

function finding(
  file: string,
  severity: 'ERROR' | 'WARNING' | 'INFO',
  confidence: 'HIGH' | 'MEDIUM' | 'LOW',
  semanticKey: string,
  valueClass: string,
  title: string,
  evidence: string,
  whyItMatters: string,
  suggestedAction: string,
): CandidateFindingInput {
  return {
    title,
    severity,
    confidence,
    category: 'privacy',
    file,
    evidence,
    whyItMatters,
    suggestedAction,
    officialSource: SOURCE,
    semanticKey,
    valueClass,
  };
}

export const ARD002: Rule = {
  id: 'ARD002',
  metadata: {
    id: 'ARD002',
    title: 'Privacy Manifest Regression',
    category: 'privacy',
    defaultSeverity: 'WARNING',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'A PR that removes or weakens previously declared privacy-manifest content (declared API categories, reasons, or tracking declarations) changes the App Privacy surface and is review-sensitive.',
    detectionLogic:
      'Compares parsed privacy manifests between BASE and HEAD. Reports removal of a previously declared accessed-API category, removal of a previously declared reason code, tracking flag changes, and removal of tracking domains while tracking remains enabled. Does not claim the new state is invalid (that is ARD001).',
    falsePositives:
      'A removal may be intentional and correct (e.g., SDK removed). The finding is WARNING with exact change description, not an accusation.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    if (!ctx.base) return [];
    const out: CandidateFindingInput[] = [];
    const headSources = listPrivacyManifestSources(ctx.head);
    const baseSources = listPrivacyManifestSources(ctx.base);
    const baseByFile = new Map(baseSources.map((s) => [s.file, s]));
    for (const headSrc of headSources) {
      const baseSrc = baseByFile.get(headSrc.file);
      if (!baseSrc) continue; // manifest added by the PR -> ARD001 domain.
      const baseModel = modelOf(baseSrc.file, baseSrc.value, baseSrc.error);
      const headModel = modelOf(headSrc.file, headSrc.value, headSrc.error);
      if (!baseModel || !headModel) continue;

      // Accessed-API category removed.
      for (const [type, reasons] of baseModel.accessed) {
        const headReasons = headModel.accessed.get(type);
        if (headReasons === undefined) {
          out.push(
            finding(
              headSrc.file,
              'WARNING',
              'HIGH',
              'regression:type-removed',
              `type:${type}`,
              'Previously declared privacy-accessed-API category removed',
              `BASE declared ${type} (reasons: ${reasons.join(', ') || 'none'}). HEAD no longer declares it.`,
              'Removing a declared API category changes the App Privacy surface; if the API is still used, the declaration should remain.',
              'Confirm the API is no longer used, or keep the declaration.',
            ),
          );
        } else {
          const removed = reasons.filter((r) => !headReasons.includes(r));
          for (const reason of removed) {
            out.push(
              finding(
                headSrc.file,
                'WARNING',
                'HIGH',
                'regression:reason-removed',
                `type:${type}:reason:${reason}`,
                'Previously declared privacy reason removed',
                `BASE declared reason ${reason} for ${type}. HEAD no longer declares it.`,
                'A removed reason may understate the API use; Apple requires accurate declarations.',
                'Confirm the reason no longer applies, or restore it.',
              ),
            );
          }
        }
      }

      // Tracking declaration changed.
      if (baseModel.tracking !== headModel.tracking && typeof headModel.tracking === 'boolean') {
        out.push(
          finding(
            headSrc.file,
            'WARNING',
            'MEDIUM',
            'regression:tracking-flag',
            `flag:${String(headModel.tracking)}`,
            'Tracking declaration changed',
            `BASE NSPrivacyTracking=${String(baseModel.tracking)} -> HEAD NSPrivacyTracking=${String(headModel.tracking)}.`,
            'A tracking-declaration change is review-sensitive and should match the actual ATT flow.',
            'Verify the declaration matches the app behavior and ATT prompt.',
          ),
        );
      }
      if (headModel.tracking === true) {
        const removedDomains = baseModel.domains.filter((d) => !headModel.domains.includes(d));
        for (const domain of removedDomains) {
          out.push(
            finding(
              headSrc.file,
              'WARNING',
              'MEDIUM',
              'regression:tracking-domain-removed',
              `domain:${domain}`,
              'Tracking domain removed while tracking remains enabled',
              `BASE declared tracking domain ${domain}; HEAD removed it while NSPrivacyTracking is still true.`,
              'Removing a domain while tracking stays enabled may make the declaration incomplete.',
              'Update the domain list to match actual tracking destinations.',
            ),
          );
        }
      }
    }
    void PRIVACY_ACCESSED_LAST_VERIFIED;
    return out;
  },
};

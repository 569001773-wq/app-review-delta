import { PlistValue } from '../parsers/plist';
import {
  CandidateFindingInput,
  Rule,
  RuleContext,
  effectiveSeverity,
  isDictValue,
  listInfoPlistSources,
} from './shared';

const SOURCE = {
  title: 'UIBackgroundModes | Configuring background execution modes',
  url: 'https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes',
};

const HIGH_SCRUTINY_MODES = new Set(['voip', 'location', 'processing']);

function backgroundModes(plist: PlistValue | undefined): string[] {
  if (!isDictValue(plist)) return [];
  const v = plist['UIBackgroundModes'];
  if (!Array.isArray(v)) return [];
  return v
    .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    .map((m) => m.trim());
}

export const ARD005: Rule = {
  id: 'ARD005',
  metadata: {
    id: 'ARD005',
    title: 'Background Mode Introduced',
    category: 'background',
    defaultSeverity: 'INFO',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'Newly declared UIBackgroundModes expand the background capabilities App Review scrutinizes; Apple restricts background execution to documented purposes.',
    detectionLogic:
      'Compares UIBackgroundModes between BASE and HEAD across Info.plist sources and statically resolvable expo.ios.infoPlist. Reports each newly added mode. voip/location/processing default to WARNING MEDIUM; other modes default to INFO HIGH. Never infers the app business purpose.',
    falsePositives:
      'Declaring a background mode is not a violation; the finding only flags the introduced capability for verification.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    const out: CandidateFindingInput[] = [];
    for (const src of listInfoPlistSources(ctx.head)) {
      if (src.error) continue;
      const headModes = backgroundModes(src.value);
      const baseSrc = ctx.base
        ? listInfoPlistSources(ctx.base).find((s) => s.file === src.file)
        : undefined;
      const baseModes = baseSrc && !baseSrc.error ? backgroundModes(baseSrc.value) : [];
      const baseSet = new Set(baseModes);
      for (const mode of headModes) {
        if (baseSet.has(mode)) continue;
        const highScrutiny = HIGH_SCRUTINY_MODES.has(mode);
        out.push({
          title: `Background mode introduced: ${mode}`,
          severity: effectiveSeverity(highScrutiny ? 'WARNING' : 'INFO', ctx.config, 'ARD005'),
          confidence: 'HIGH',
          category: 'background',
          file: src.file,
          evidence: `UIBackgroundModes adds "${mode}" in ${src.label}.`,
          headState: mode,
          whyItMatters:
            'Apple limits background execution to intended purposes. A new background mode is a review-sensitive capability that should match actual app behavior.',
          suggestedAction:
            'Confirm the background mode is required and matches the app functionality described to reviewers.',
          officialSource: SOURCE,
          semanticKey: `background-mode:${mode}`,
          valueClass: mode,
        });
      }
    }
    return out;
  },
};

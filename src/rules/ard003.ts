import { PlistValue } from '../parsers/plist';
import {
  CandidateFindingInput,
  Rule,
  RuleContext,
  asStringValue,
  effectiveSeverity,
  isDictValue,
  listInfoPlistSources,
} from './shared';

const SOURCE = {
  title: 'NSAllowsArbitraryLoads | NSAppTransportSecurity',
  url: 'https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloads',
};

interface AtsException {
  keyPath: string;
  label: string;
  baseValue?: string;
  headValue?: string;
  severity: 'WARNING' | 'INFO';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

function collectExceptions(
  plist: PlistValue | undefined,
  ats: PlistValue | undefined,
): { keyPath: string; label: string; value: string }[] {
  const out: { keyPath: string; label: string; value: string }[] = [];
  if (!isDictValue(ats)) return out;
  const globalKeys: { key: string; label: string }[] = [
    { key: 'NSAllowsArbitraryLoads', label: 'NSAllowsArbitraryLoads' },
    { key: 'NSAllowsArbitraryLoadsForMedia', label: 'NSAllowsArbitraryLoadsForMedia' },
    { key: 'NSAllowsArbitraryLoadsInWebContent', label: 'NSAllowsArbitraryLoadsInWebContent' },
    { key: 'NSAllowsLocalNetworking', label: 'NSAllowsLocalNetworking' },
  ];
  for (const g of globalKeys) {
    const v = ats[g.key];
    if (v === true)
      out.push({ keyPath: `NSAppTransportSecurity.${g.key}`, label: g.label, value: 'true' });
  }
  const domains = ats['NSExceptionDomains'];
  if (isDictValue(domains)) {
    for (const [domain, cfg] of Object.entries(domains)) {
      if (!isDictValue(cfg)) continue;
      const insecure = cfg['NSExceptionAllowsInsecureHTTPLoads'];
      if (insecure === true) {
        out.push({
          keyPath: `NSAppTransportSecurity.NSExceptionDomains.${domain}.NSExceptionAllowsInsecureHTTPLoads`,
          label: `NSExceptionDomains.${domain}.NSExceptionAllowsInsecureHTTPLoads`,
          value: 'true',
        });
      }
    }
  }
  void plist;
  return out;
}

function exceptionFinding(
  ctx: RuleContext,
  file: string,
  exc: AtsException,
  analysisLimitations?: string[],
): CandidateFindingInput {
  const isArbitraryLoads = exc.keyPath.endsWith('NSAllowsArbitraryLoads');
  const why = isArbitraryLoads
    ? 'Apple documents that a justification must be supplied during App Store review when NSAllowsArbitraryLoads is YES.'
    : 'This ATS exception loosens network security for a subset of connections; Apple documents exceptions as a last resort and review may require justification.';
  const suggested = isArbitraryLoads
    ? 'Use a narrower exception (NSExceptionDomains) if possible, or prepare a clear review justification.'
    : 'Prefer a secure server configuration; if the exception is required, document why for review.';
  return {
    title: `${exc.label} ATS exception enabled`,
    severity: effectiveSeverity(exc.severity, ctx.config, 'ARD003'),
    confidence: exc.confidence,
    category: 'network',
    file,
    evidence: `${exc.label}:\n${exc.baseValue === undefined ? '(not present)' : exc.baseValue} -> ${exc.headValue}`,
    baseState: exc.baseValue === undefined ? '(not present)' : exc.baseValue,
    headState: exc.headValue,
    whyItMatters: why,
    suggestedAction: suggested,
    officialSource: SOURCE,
    analysisLimitations,
    semanticKey: `ats:${exc.keyPath}`,
    valueClass: exc.headValue ?? 'true',
  };
}

export const ARD003: Rule = {
  id: 'ARD003',
  metadata: {
    id: 'ARD003',
    title: 'ATS Exception Introduced',
    category: 'network',
    defaultSeverity: 'WARNING',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'Newly enabled App Transport Security exceptions are review-sensitive; Apple explicitly requires justification during App Store review for NSAllowsArbitraryLoads.',
    detectionLogic:
      'Reads NSAppTransportSecurity from Info.plist files and statically resolvable expo.ios.infoPlist. Emits a finding per exception key/value enabled in HEAD. Base/HEAD subtraction suppresses exceptions that already existed in BASE. Never claims rejection.',
    falsePositives:
      'NSAllowsLocalNetworking is a common, narrower exception and is INFO LOW by default. Exception presence alone is not a policy violation.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    const out: CandidateFindingInput[] = [];
    for (const src of listInfoPlistSources(ctx.head)) {
      if (src.error) continue;
      const plist = src.value;
      if (!isDictValue(plist)) continue;
      const ats = plist['NSAppTransportSecurity'];
      const headExceptions = collectExceptions(plist, ats);

      // Base values for old -> new display.
      const baseAts = (() => {
        if (!ctx.base) return undefined;
        const baseSrc = listInfoPlistSources(ctx.base).find((s) => s.file === src.file);
        if (!baseSrc || baseSrc.error || !isDictValue(baseSrc.value)) return undefined;
        return baseSrc.value['NSAppTransportSecurity'];
      })();
      const baseExceptions = collectExceptions(src.value, baseAts);
      const baseByKey = new Map(baseExceptions.map((e) => [e.keyPath, e.value]));

      for (const exc of headExceptions) {
        const isLocal = exc.keyPath.endsWith('NSAllowsLocalNetworking');
        const isArbitrary = exc.keyPath.endsWith('NSAllowsArbitraryLoads');
        const isDomainInsecure = exc.keyPath.includes('NSExceptionAllowsInsecureHTTPLoads');
        const severity: 'WARNING' | 'INFO' = isLocal
          ? 'INFO'
          : isArbitrary
            ? 'WARNING'
            : isDomainInsecure
              ? 'WARNING'
              : 'WARNING';
        const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = isLocal
          ? 'LOW'
          : isArbitrary
            ? 'HIGH'
            : 'MEDIUM';
        out.push(
          exceptionFinding(
            ctx,
            src.file,
            {
              keyPath: exc.keyPath,
              label: exc.label,
              baseValue: baseByKey.get(exc.keyPath),
              headValue: exc.value,
              severity,
              confidence,
            },
            isDomainInsecure
              ? [
                  'Per-domain ATS exception formatting is verified structurally; review impact depends on Apple policy.',
                ]
              : undefined,
          ),
        );
      }
    }
    void asStringValue;
    return out;
  },
};

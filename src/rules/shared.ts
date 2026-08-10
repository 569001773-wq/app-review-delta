import { AppReviewConfig } from '../config/load';
import { OfficialSource, Snapshot, SnapshotFile } from '../types';
import { PlistValue, parsePlist, PlistParseResult } from '../parsers/plist';
import { StaticExpoConfig, buildStaticExpoConfig } from '../parsers/expoConfig';

export interface RuleMetadata {
  id: string;
  title: string;
  category:
    'privacy' | 'permissions' | 'network' | 'background' | 'secret' | 'sdk' | 'coverage' | 'config';
  defaultSeverity: 'ERROR' | 'WARNING' | 'INFO';
  defaultConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  officialSource: { title: string; url: string };
  guidelineId?: string;
  paraphrase: string;
  detectionLogic: string;
  falsePositives: string;
  lastVerified: string;
}

export interface RuleContext {
  /** Null when computing base-side candidates. */
  base: Snapshot | null;
  head: Snapshot;
  config: AppReviewConfig;
}

export interface Rule {
  id: string;
  metadata: RuleMetadata;
  run(ctx: RuleContext): CandidateFindingInput[];
}

export interface CandidateFindingInput {
  officialSource: OfficialSource;
  title: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  category: RuleMetadata['category'];
  file: string;
  evidence: string;
  baseState?: string;
  headState?: string;
  whyItMatters: string;
  suggestedAction: string;
  analysisLimitations?: string[];
  line?: number;
  semanticKey: string;
  valueClass: string;
  heuristic?: boolean;
}

const expoCache = new WeakMap<Snapshot, StaticExpoConfig>();

export function getExpoConfig(snapshot: Snapshot): StaticExpoConfig {
  const cached = expoCache.get(snapshot);
  if (cached) return cached;
  const files = ['app.json', 'app.config.json', 'app.config.js', 'app.config.ts']
    .map((p) => snapshot.files.get(p))
    .filter((f): f is SnapshotFile => f !== undefined)
    .map((f) => ({ path: f.path, text: f.text }));
  const cfg = buildStaticExpoConfig(files);
  expoCache.set(snapshot, cfg);
  return cfg;
}

export function getPlistFiles(snapshot: Snapshot): SnapshotFile[] {
  return [...snapshot.files.values()].filter((f) => f.path.endsWith('.plist'));
}

export function getPrivacyManifestFiles(snapshot: Snapshot): SnapshotFile[] {
  return [...snapshot.files.values()].filter((f) => f.path.endsWith('.xcprivacy'));
}

export interface PlistSource {
  label: string;
  file: string;
  value?: PlistValue;
  error?: string;
}

/**
 * Info.plist sources: native plist files plus the statically resolvable
 * `expo.ios.infoPlist` object. Dynamic config produces no source here; the
 * coverage rule reports it instead.
 */
export function listInfoPlistSources(snapshot: Snapshot): PlistSource[] {
  const out: PlistSource[] = [];
  for (const f of getPlistFiles(snapshot)) {
    // Only the app's Info.plist qualifies. Service/config plists (e.g.
    // GoogleService-Info.plist) must not be fed to ATS/permission rules.
    const basename = f.path.slice(f.path.lastIndexOf('/') + 1);
    if (basename !== 'Info.plist') continue;
    const r = parsePlist(f.text);
    if (r.ok) out.push({ label: f.path, file: f.path, value: r.value });
    else out.push({ label: f.path, file: f.path, error: r.error });
  }
  const expo = getExpoConfig(snapshot);
  if (expo.expo) {
    const ios = expo.expo['ios'];
    const infoPlist =
      ios && typeof ios === 'object' && !Array.isArray(ios) ? ios['infoPlist'] : undefined;
    if (infoPlist !== undefined) {
      const src = expo.sourceFiles[0] ?? 'app config';
      out.push({ label: `expo.ios.infoPlist (${src})`, file: src, value: infoPlist });
    }
  }
  return out;
}

/**
 * Privacy-manifest sources: PrivacyInfo.xcprivacy files plus the statically
 * resolvable `expo.ios.privacyManifests` object.
 */
export function listPrivacyManifestSources(snapshot: Snapshot): PlistSource[] {
  const out: PlistSource[] = [];
  for (const f of getPrivacyManifestFiles(snapshot)) {
    const r = parsePlist(f.text);
    if (r.ok) out.push({ label: f.path, file: f.path, value: r.value });
    else out.push({ label: f.path, file: f.path, error: r.error });
  }
  const expo = getExpoConfig(snapshot);
  if (expo.expo) {
    const ios = expo.expo['ios'];
    const pm =
      ios && typeof ios === 'object' && !Array.isArray(ios) ? ios['privacyManifests'] : undefined;
    if (pm !== undefined) {
      const src = expo.sourceFiles[0] ?? 'app config';
      out.push({ label: `expo.ios.privacyManifests (${src})`, file: src, value: pm });
    }
  }
  return out;
}

export function isDictValue(v: PlistValue | undefined): v is { [key: string]: PlistValue } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function asStringValue(v: PlistValue | undefined): string | undefined {
  if (typeof v === 'string') return v;
  return undefined;
}

export function normalizeList(v: PlistValue | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .sort();
}

export function effectiveSeverity(
  defaultSeverity: 'ERROR' | 'WARNING' | 'INFO',
  config: AppReviewConfig,
  ruleId: string,
): 'ERROR' | 'WARNING' | 'INFO' {
  return config.rules[ruleId]?.severity ?? defaultSeverity;
}

export function parsePlistResult(file: SnapshotFile): PlistParseResult {
  return parsePlist(file.text);
}

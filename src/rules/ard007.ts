import { CandidateFindingInput, Rule, RuleContext, effectiveSeverity } from './shared';
import { matchSdkCategory } from './sdkCategories';
import { Snapshot } from '../types';

const SOURCE = {
  title: 'App Store Review Guidelines (privacy and payments sections)',
  url: 'https://developer.apple.com/app-store/review/guidelines/',
};

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePackageJson(snapshot: Snapshot): PackageJson | null {
  const f = snapshot.files.get('package.json');
  if (!f) return null;
  try {
    return JSON.parse(f.text) as PackageJson;
  } catch {
    return null;
  }
}

export const ARD007: Rule = {
  id: 'ARD007',
  metadata: {
    id: 'ARD007',
    title: 'Review-Sensitive SDK Category Added',
    category: 'sdk',
    defaultSeverity: 'INFO',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'Adding a purchase, ads, tracking, analytics, social-authentication, or AI/data-processing SDK changes the App Store review/privacy/payment surface.',
    detectionLogic:
      'Compares root package.json dependencies/devDependencies between BASE and HEAD. For each package newly added in HEAD, checks a small curated category database (documented in docs/RULES.md) and emits one INFO finding per package/category. Never claims a policy violation.',
    falsePositives:
      'A category match does not imply misuse; a devDependency or unused dependency may have no review impact. INFO only, so it never blocks CI.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    const out: CandidateFindingInput[] = [];
    const headPkg = parsePackageJson(ctx.head);
    if (!headPkg) return out;
    const basePkg = ctx.base ? parsePackageJson(ctx.base) : null;
    const headDeps = { ...headPkg.dependencies, ...headPkg.devDependencies };
    const baseDeps = basePkg ? { ...basePkg.dependencies, ...basePkg.devDependencies } : {};
    const extra = ctx.config.sdkCategories;

    for (const [name] of Object.entries(headDeps)) {
      if (name in baseDeps) continue;
      const matches = matchSdkCategory(name, extra);
      for (const m of matches) {
        out.push({
          title: `Review-sensitive SDK added (${m.category})`,
          severity: effectiveSeverity('INFO', ctx.config, 'ARD007'),
          confidence: 'HIGH',
          category: 'sdk',
          file: 'package.json',
          evidence: `This PR adds "${name}" (${m.description}) to package.json dependencies. App Store review/privacy/payment surfaces may have changed.`,
          headState: name,
          whyItMatters:
            'Purchase, advertising, tracking, analytics, social-auth, and AI/data-processing SDKs are categories App Review and privacy processes look at closely.',
          suggestedAction:
            'Confirm the SDK is required, and update App Privacy / review materials if the data surface changes.',
          officialSource: SOURCE,
          semanticKey: `sdk:${m.category}:${name}`,
          valueClass: name,
        });
      }
    }
    return out;
  },
};

import { CandidateFindingInput, Rule, RuleContext, effectiveSeverity } from './shared';
import { fingerprintOf } from '../util/hash';
import { Snapshot } from '../types';

const SOURCE = {
  title: 'AppReviewDelta policy handling (docs/SECURITY_MODEL.md)',
  url: 'https://github.com/569001773-wq/app-review-delta/blob/main/docs/SECURITY_MODEL.md',
};

function configText(snapshot: Snapshot): string | null {
  const f = snapshot.files.get('.reviewdelta.yml') ?? snapshot.files.get('.reviewdelta.yaml');
  return f ? f.text : null;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export const ARD009: Rule = {
  id: 'ARD009',
  metadata: {
    id: 'ARD009',
    title: 'Scanner Policy Changed in PR',
    category: 'config',
    defaultSeverity: 'INFO',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'The scanner policy (.reviewdelta.yml) is read from the BASE revision so a PR cannot change the rules that gate its own check; a policy change in the PR is reported and takes effect only after merge.',
    detectionLogic:
      'Compares .reviewdelta.yml between BASE and HEAD. Reports added, removed, or changed policy. Never uses the HEAD policy for the current check (config resolution defaults to BASE; config-ref: head opts out explicitly).',
    falsePositives:
      'Intentional policy changes (e.g., adding a suppression with a reason) are expected and only informational.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    if (!ctx.base) return [];
    const baseText = configText(ctx.base);
    const headText = configText(ctx.head);
    if (baseText === headText) return [];

    const normalizedHead = headText === null ? null : normalize(headText);
    let semanticKey: string;
    let title: string;
    let evidence: string;
    let valueClass: string;
    if (baseText === null && headText !== null) {
      semanticKey = 'policy:added';
      title = 'Scanner policy added in this PR';
      evidence =
        'fact: .reviewdelta.yml exists in HEAD but not in BASE. The current check uses the BASE (default) policy; this file takes effect after merge.';
      valueClass = 'added';
    } else if (baseText !== null && headText === null) {
      semanticKey = 'policy:removed';
      title = 'Scanner policy removed in this PR';
      evidence =
        'fact: .reviewdelta.yml exists in BASE but not in HEAD. The current check uses the BASE policy; defaults take effect after merge.';
      valueClass = 'removed';
    } else {
      semanticKey = 'policy:changed';
      title = 'Scanner policy changed in this PR';
      evidence =
        'fact: .reviewdelta.yml differs between BASE and HEAD. The current check uses the BASE policy; this change takes effect only after merge.';
      valueClass = fingerprintOf(['policy', normalizedHead ?? '']);
    }

    return [
      {
        title,
        severity: effectiveSeverity('INFO', ctx.config, 'ARD009'),
        confidence: 'HIGH',
        category: 'config',
        file: '.reviewdelta.yml',
        evidence,
        whyItMatters:
          'A PR must not be able to change the rules, suppressions, severities, or fail threshold that gate its own check. This change is reported for transparency and applies after merge.',
        suggestedAction:
          'Review the policy change; it takes effect for the base branch once merged.',
        officialSource: SOURCE,
        semanticKey,
        valueClass,
      },
    ];
  },
};

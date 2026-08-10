import { CandidateFindingInput, Rule, RuleContext } from './shared';

const SOURCE = {
  title: 'AppReviewDelta analysis coverage policy',
  url: 'https://github.com/569001773-wq/app-review-delta/blob/main/docs/LIMITATIONS.md',
};

export const ARD008: Rule = {
  id: 'ARD008',
  metadata: {
    id: 'ARD008',
    title: 'Static Analysis Coverage Gap',
    category: 'coverage',
    defaultSeverity: 'INFO',
    defaultConfidence: 'HIGH',
    officialSource: SOURCE,
    paraphrase:
      'When relevant configuration cannot be resolved statically (dynamic Expo config, truncated API responses, oversized/binary files, unparsable plists), the tool says so instead of pretending analysis was complete.',
    detectionLogic:
      'The engine compares coverage gaps between BASE and HEAD snapshots and reports newly appearing gaps (dynamic app.config.js/ts, API truncation, missing/oversized/binary/symlink files, parse failures).',
    falsePositives:
      'Coverage findings are informational; a gap is not a compliance problem, only an honest limitation.',
    lastVerified: '2026-08-10',
  },
  run(ctx: RuleContext): CandidateFindingInput[] {
    void ctx;
    // Emitted by the engine (needs both snapshots' coverage information).
    return [];
  },
};

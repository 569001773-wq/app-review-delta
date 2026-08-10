# Contributing

Thanks for helping make AppReviewDelta trustworthy. This project is a small, conservative tool: quality and honesty matter more than rule count.

## Ground rules

- **Never execute target code** — in code, tests, or examples. The analyzed repository is untrusted input by design.
- **Anchor rules to primary sources.** Apple/Expo documentation links with a `lastVerified` date. No blog posts as source of truth.
- **Prefer fewer, precise rules.** A rule must have a documented detection logic, false-positive considerations, and tests before it is added.
- **Redact aggressively.** Secret values never appear in evidence, logs, or docs.
- **Stay conservative.** Do not claim approval prediction, guaranteed rejection, or complete coverage — in code, docs, or README.

## Development

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run bundle:action
```

The CI workflow runs typecheck, lint, tests, and build on every PR.

## Tests

- Unit tests: parsers, config, fingerprints, subtraction, suppressions, redaction.
- Integration fixtures: the 20 documented scenarios (clean app → invalid manifest → ATS → permissions → background → secrets → SDKs → dynamic config → line-move/formatting invariance).
- Security fixtures: malicious `app.config.ts`, `package.json`, config plugin, path traversal, huge malformed plist, sentinel side-effect checks.
- Canary: a synthetic git repository with PR sequence A–E plus fixes, run through the real CLI pipeline.

When you change a rule, extend the fixtures, not just the unit tests.

## Adding a rule

1. Open a rule-proposal issue first (template provided).
2. Provide the official source and a paraphrase.
3. Implement the rule in `src/rules/`, register it, add metadata to `docs/RULES.md`.
4. Add unit tests, at least one integration fixture, and false-positive fixtures.
5. Keep the fingerprint/subtraction model in mind: findings must be stable across line moves and formatting changes.

## Releases

Maintainers cut semantic-version releases; the release workflow rebuilds the bundled Action, moves the `v1` major tag, and (when the Marketplace Developer Agreement is accepted) publishes the Action to GitHub Marketplace.

## Code of conduct

All interactions fall under [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

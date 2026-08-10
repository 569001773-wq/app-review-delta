# Security Policy

## Scope

This policy covers the AppReviewDelta repository and the `app-review-delta` npm package. It does **not** cover the analyzed target repositories — those are untrusted input by design.

## Target code is never executed

AppReviewDelta inspects target-repository files **as data only**. It never:

- checks out or clones the target repository by default;
- runs `npm/yarn/pnpm/bun install` or any package scripts;
- runs Expo CLI, `expo config`, `expo prebuild`, EAS, Metro, Babel, or TypeScript tooling on the target;
- runs target tests, builds, Xcode, CocoaPods, Ruby, Fastlane, Makefiles, or shell scripts;
- imports, `require`s, or `eval`s target modules, config plugins, or `app.config.js`/`app.config.ts`.

`app.config.js` and `app.config.ts` are parsed as syntax trees. Only provably safe literal values are extracted; anything dynamic is reported as an unresolved coverage gap.

## Reporting a vulnerability

Please report security issues privately by opening a GitHub issue with the `security` label, or by emailing the maintainer through the contact mechanism listed in the repository profile. Do **not** create a public issue for credential or supply-chain incidents.

When reporting, include:

- repository and file affected;
- a minimal reproduction (a fixture repository is preferred);
- the AppReviewDelta version and output;
- why you believe the impact is security-relevant.

## Supported versions

Only the latest `v1` release receives security fixes. Patch releases are tagged `v1.x.y` and the `v1` major tag is moved to the latest patch.

## Disclosure process

1. Acknowledgment within 5 business days.
2. Triage and fix within 30 days for high-severity issues affecting the Action's execution model or secret handling.
3. Public disclosure after a release containing the fix.

## Supply-chain notes for users

- The Action's bundle is built from this repository's source at release time; the committed `dist/action` bundle corresponds to the tagged release.
- Review `action.yml` and the bundle before adoption. GitHub's guidance recommends pinning actions to a full commit SHA for immutable releases.
- The Action requires only `contents: read` and `pull-requests: read`; do not grant more.

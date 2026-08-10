# Changelog

All notable changes to AppReviewDelta are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.4] - 2026-08-10

### Security

- **Scanner policy is now read from the BASE revision by default** (new `config-ref` input, default `base`). A PR can no longer disable rules, add suppressions, change severities, or set `fail-on: never` for its own check. PR-side policy changes are reported as a new informational rule (ARD009) and take effect only after merge.
- **Fixed GitHub changed-files pagination.** The Action now uses the PR files API (paginated, up to 3000 files) as the primary changed-file source; the compare endpoint is used only without a PR number and a 300-file first page is always reported as truncated.
- **RevenueCat public API keys (`appl_…`) are no longer flagged** as secrets (they are public by design; only private credentials are ERROR).
- **Fixed local CLI symlink protection**: working-tree reads now use `lstat` and verify `realpath` stays inside the repository.
- **Expo `app.config.js/ts` wrapper handling hardened**: only `defineConfig` imported from `expo/…` is unwrapped; arbitrary wrapper calls are treated as unresolvable.

### Rules

- ARD002 now reports a privacy manifest **removed entirely** by the PR.
- ARD001 validates the full collected-data dictionary: required `NSPrivacyCollectedDataTypeLinked`, `NSPrivacyCollectedDataTypeTracking`, and `NSPrivacyCollectedDataTypePurposes` fields, plus documented purpose values (lenient/strict).
- ARD004 now reports non-string usage-description values (ERROR) and tracks `NSCalendarsFullAccessUsageDescription`, `NSCalendarsWriteOnlyAccessUsageDescription`, and `NSRemindersFullAccessUsageDescription`.
- ARD004/ARD006/ARD007/ARD008 now honor per-rule severity overrides like the other rules; ARD009 (new, INFO) reports scanner-policy changes.
- Info.plist detection now requires the exact `Info.plist` basename; service plists (e.g., `GoogleService-Info.plist`) are excluded.

### Tests

- Added regression tests for compare/PR-files pagination (would have caught the P0), base-first policy resolution, symlink escape, `defineConfig` whitelist, manifest removal, collected-data validation, RevenueCat public keys, permission type errors, new permission keys, and severity overrides. Suite: 101 tests.

## [1.0.3] - 2026-08-10

### Fixed

- Version-string consistency: `app-review-delta --version`, the JSON report `version` field, and the package version now report `1.0.3` (they previously reported `1.0.0`).
- Hardened the fork-PR files fallback: if the PR files API also fails (for example a private fork the token cannot read), the check now reports a clear, actionable message instead of a raw API error.

## [1.0.2] - 2026-08-10

### Fixed

- **Critical: the published Action bundle crashed at startup on GitHub runners.** Current `@actions/*` toolkit majors are ESM-only and could not be bundled into the CommonJS Action bundle (ncc emitted runtime stubs); older majors pull in a vulnerable `undici` chain. The Action now has **no `@actions/*` runtime dependencies**: the small runner surface (inputs, outputs, annotations, step summary, `setFailed`) is implemented locally, and GitHub API access uses `@octokit/rest` directly. CI now verifies the bundle is self-contained (fails on unbundled-dependency stubs) and the Action was validated end-to-end from a separate synthetic consumer repository.
- The context reader tolerates a UTF-8 BOM in the GitHub event file.

## [1.0.1] - 2026-08-10

### Fixed

- README no longer instructs users to `npm install -g app-review-delta` (the npm package is not published yet); the CLI is documented as running from source.
- Removed unsupported general claims about competitors from the README and research notes; positioning now focuses on AppReviewDelta's own architecture.
- Fixed a broken Apple documentation URL used by ARD004's official source.
- Aligned ARD005 finding confidence (HIGH) with the documented metadata.
- Fork pull requests are now analyzed correctly: head-side reads route to the fork repository, the changed-file list falls back to the PR files API when cross-repository compare is unavailable, and the check fails with a clear message when the workflow token cannot read a private fork.

### Changed

- GitHub Discussions enabled for support (README CTA verified).
- `actions/checkout` and `actions/setup-node` bumped to v7 in CI/release workflows.
- Re-ran the Codex Security repository scan on the final state: 0 reportable findings.

## [1.0.0] - 2026-08-10

### Added

- Base → HEAD differential analysis engine with semantic finding fingerprints (line-move and formatting invariant).
- Rules:
  - ARD001 Invalid Privacy Manifest (ERROR)
  - ARD002 Privacy Manifest Regression (WARNING)
  - ARD003 ATS Exception Introduced (WARNING)
  - ARD004 Sensitive Permission Configuration Changed (WARNING/INFO)
  - ARD005 Background Mode Introduced (INFO, WARNING for voip/location/processing)
  - ARD006 Strong Client Secret Exposure (ERROR, redacted evidence)
  - ARD007 Review-Sensitive SDK Category Added (INFO)
  - ARD008 Static Analysis Coverage Gap (INFO)
- GitHub Action (no target checkout; reads GitHub APIs; read-only permissions; job summary, annotations, JSON output).
- Local CLI (`app-review-delta check` / `rules`) powered by the same engine, reading Git objects safely.
- Security model: target code inspected as data, never executed; static `app.config.js`/`app.config.ts` extraction; redaction; path/size/binary guards.
- Configuration: `.reviewdelta.yml` with fail-on threshold, rule overrides, exclusions, suppression with reason + expiry.
- Tests: unit, 20 integration fixtures, security fixtures, and a realistic canary PR sequence.
- Documentation: RESEARCH, ARCHITECTURE, RULES, SECURITY_MODEL, THREAT_MODEL, LIMITATIONS.

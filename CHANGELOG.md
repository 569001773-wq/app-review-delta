# Changelog

All notable changes to AppReviewDelta are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

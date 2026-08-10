# Changelog

All notable changes to AppReviewDelta are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

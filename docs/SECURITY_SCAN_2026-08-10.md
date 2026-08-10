# Pre-Release Security Scan — 2026-08-10

AppReviewDelta was scanned with the Codex Security standard repository scan before the v1.0.0 release and re-scanned before v1.0.1 and v1.0.2. This page records the results; canonical artifacts (current final scan) live in `docs/security/`.

## Final scan before v1.0.2 (current state)

- **Reportable findings: 0** (scan `scan_ard_final_20260810`, coverage complete, prompt-only scan — desktop SDK scan tools were not available in the environment)
- Reviewed surfaces include the self-contained runner shim, BOM-tolerant context reader, `@octokit/rest` client, and fork-PR routing with PR-files fallback.
- Dependency audit: `npm audit` = 0 vulnerabilities (no `@actions/*` runtime dependencies; no vulnerable `undici` chain).
- Secret scan: no real credentials; only intentionally synthetic test fixtures.

## Re-scan before v1.0.1 (final state)

- **Reportable findings: 0** (scan `scan_ard_polish_20260810`, coverage complete, prompt-only scan — desktop SDK scan tools were not available in the environment)
- Reviewed surfaces: untrusted parsers, Action runtime + REST client + snapshot builder + engine + reporters (including new fork-PR routing), local git layer, rules/config/redaction.
- Dependency audit: `npm audit` = 0 vulnerabilities.
- Secret scan: no real credentials; only intentionally synthetic test fixtures.

## v1.0.0 scan (first pass)

- Scan mode: repository (prompt-only)
- Coverage: complete for `src/`, `action.yml`, `.github/workflows`, `package.json` (exclusions: `node_modules/`, `dist/`, `test/` fixtures, `.git/`)
- Findings: 4 (1 medium, 3 low) — **all fixed and verified before release**

### Findings (all remediated)

1. **CWE-1321 (medium)** — Attacker-controlled dictionary keys (`__proto__`) could pollute `Object.prototype` in plist/app-config/config parsing. Fixed with null-prototype objects; dedicated security fixture added.
2. **CWE-400 (low)** — Oversized file content could be read before the size check in the git and GitHub providers. Fixed with size-before-read in all three providers.
3. **CWE-532 (low)** — `baseState`/`headState` were not passed through the redactor. Fixed; all engine string fields now share one redaction path.
4. **CWE-20 (low)** — Non-file contents-API entries (directories/submodules) were not explicitly skipped. Fixed.

## Adversarial review

Additional adversarial review (Expo maintainer, iOS engineer, Actions security reviewer, skeptical maintainer, false-positive-averse developer) confirmed:

- the tool never executes target code (no eval/import/exec of target files; git commands are read-only and argument-array based);
- `pull_request` (not `pull_request_target`) with read-only permissions is the documented usage;
- findings are base→head differential, line-move/formatting invariant (canary suite);
- uncertainty is disclosed via ARD008 coverage gaps and `lastVerified` metadata;
- README makes no approval guarantees and no affiliation claims;
- no embarrassing high-confidence false positives remain in the fixture suite.

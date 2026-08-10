# Threat Model

This document enumerates the threat scenarios AppReviewDelta defends against, the controls that mitigate them, and any residual risk. It is reviewed before every release.

## Trust boundaries

| Boundary                                 | Trusted?                                       |
| ---------------------------------------- | ---------------------------------------------- |
| AppReviewDelta source + committed bundle | Trusted (release-gated)                        |
| AppReviewDelta maintainer                | Trusted                                        |
| Analyzed repository content (PRs, forks) | **Untrusted**                                  |
| GitHub REST API responses                | Semi-trusted (validated shapes, bounded sizes) |
| Runner environment                       | Trusted by GitHub                              |

## Scenarios

### 1. Malicious fork PR (script injection / repo takeover)

**Attack:** A fork PR embeds code in workflow-relevant files (`package.json` scripts, `app.config.js`, config plugins, plist XML, symlinks) designed to execute on the runner, read `GITHUB_TOKEN`, or modify the repository.

**Controls:**

- no checkout of the target repository;
- no execution of any target file (parsers only);
- no `pull_request_target` (the Action runs on the standard `pull_request` event, which receives a read-only token and no secrets);
- token permissions are explicitly minimized in the recommended workflow;
- bundled code is the only code the Action runs.

**Residual risk:** A compromised _AppReviewDelta_ release could be malicious. Mitigated by release-gating, source review, and consumers pinning to a SHA.

### 2. Malicious `package.json` (postinstall / scripts)

**Attack:** `postinstall`, `preinstall`, or arbitrary `scripts` values execute attacker code when a tool runs `npm install`.

**Controls:** AppReviewDelta never runs installs or scripts. `package.json` is read by `JSON.parse` and used only as data (dependency lists for ARD007).

### 3. Malicious `app.config.ts` / config plugin

**Attack:** `app.config.ts` executes code (e.g., writes a sentinel file, reads secrets, opens sockets) when evaluated by Expo tooling.

**Controls:** `app.config.js`/`app.config.ts` are parsed with a Babel AST; only literal values are extracted; any dynamic construct (calls, imports, computed values) marks the field unresolved. No `require`, `import`, or `eval` of target modules. Covered by the security test suite with an executable sentinel fixture.

### 4. Malicious symlink / path traversal

**Attack:** A path such as `../outside` or a symlink pointing outside the repository causes the tool to read files outside the target, or a huge/crafted path causes a denial of service.

**Controls:**

- paths are normalized and validated (`..` segments, absolute paths, and drive-letter paths rejected);
- GitHub contents API responses for symlinks are skipped and recorded as coverage gaps;
- local git reads use blob SHAs from `git ls-tree` with literal pathspecs; symlink modes (120000) are skipped;
- working-tree reads verify the resolved path is inside the repository;
- test suite covers traversal fixtures.

### 5. Huge files / binary files / parser DoS

**Attack:** A multi-GB file, a deeply nested XML document, or a pathological entity expansion exhausts memory/CPU.

**Controls:**

- `max-file-size-bytes` (default 2 MiB) bounds every fetch and read;
- `max-files` and `max-compare-pages` bound request volume;
- binary detection (NUL probe) skips binary content;
- XML parsing is entity-safe (no external entity resolution), and the tag-balance guard bounds scanning;
- a malformed-huge-plist fixture is part of the test suite.

### 6. Malformed XML / plist

**Attack:** Malformed plists hide structure or crash parsers.

**Controls:** Tag-balance validation; parse failures surface as ARD001 `ERROR` or ARD008 coverage gaps rather than crashes or silent misparses.

### 7. Malicious YAML (config)

**Attack:** `.reviewdelta.yml` uses YAML aliases/anchors or crafted values to exhaust memory or smuggle configuration.

**Controls:** `yaml` package default safe parse; strict schema validation (unknown rule IDs, bad enums, path traversal in globs are errors); the config file is data only.

### 8. Secret leakage into logs

**Attack:** A committed credential is echoed into CI logs, summaries, or JSON artifacts.

**Controls:** A dedicated redactor strips private-credential formats (PEM blocks, provider secret keys, tokens) from all evidence; ARD006 evidence is constructed redacted-first; tests assert redaction.

### 9. GitHub token misuse

**Attack:** The Action uses the token for unauthorized endpoints or writes.

**Controls:** The client only calls compare/contents/blobs read endpoints; permissions are minimized; `pull-requests: read` + `contents: read` is the documented default.

### 10. Truncated GitHub API responses

**Attack:** The compare or contents response is truncated, silently reducing coverage.

**Controls:** Pagination with a documented limit; truncation is recorded as an ARD008 gap; coverage is never silently assumed complete.

### 11. Exfiltration

**Attack:** Target content or secrets are uploaded to an attacker-controlled endpoint.

**Controls:** The bundle makes no network calls other than GitHub API reads; no backend, telemetry, or analytics code exists; dependency audit + source review gate releases.

### 12. Prototype pollution via attacker-controlled keys

**Attack:** A malicious plist or `app.config.js` uses keys such as `__proto__` to mutate `Object.prototype` and inject values the analyzer would treat as configuration (or crash downstream code).

**Controls:** Every dictionary constructed from attacker-controlled keys (plist `dict` conversion, static Expo-config object walking, config `sdk-categories`, deep merge) uses null-prototype objects, and the security suite includes a `__proto__` fixture.

### 13. Oversized content read before the size check

**Attack:** A multi-gigabyte file exhausts memory because content is fetched before the size limit is enforced.

**Controls:** Both the GitHub and git providers check the declared size against `max-file-size-bytes` **before** reading content (contents API size, `git cat-file -s`, and `stat` for working-tree reads) and record an oversized-file coverage gap.

## Residual risks (accepted)

- Apple/Expo documentation changes can make rule tables stale; mitigated by `lastVerified` metadata and lenient-mode warnings.
- Static analysis cannot prove API usage or app intent; mitigated by INFO/WARNING calibration and explicit "needs human review" language.
- Consumers pinning by mutable tag (`v1`) inherit tag-move risk; documented in SECURITY.md.

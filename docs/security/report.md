# Security Review: app-review-delta (local pre-release worktree)

## Scope

The scan reviewed the canonical include paths and exclusions listed below.

- Scan mode: repository
- Target kind: git_worktree
- Target ID: target_ard_local_worktree
- Revision: local-worktree
- Snapshot digest: codex-security-snapshot/v1:sha256:476ffd6405ae9fc013c5b3e3a67dcb80bfccffda10d7c59c684b6b2bc3de34dc
- Inventory strategy: directory
- Included paths: .
- Excluded paths: node_modules/, dist/, .git/, test/
- Runtime or test status: not recorded

Limitations and exclusions:

- Excluded node_modules/: Third-party dependencies; covered separately by npm audit (0 vulnerabilities).
- Excluded dist/: Build output regenerated from src and re-verified by the CI bundle check.
- Excluded test/: Fixtures intentionally contain synthetic credential values for scanner tests.
- Excluded .git/: Repository history is not reviewed by design.

### Scan Summary

| Field               | Value              |
| ------------------- | ------------------ |
| Reportable findings | 4                  |
| Severity mix        | medium: 1, low: 3  |
| Confidence mix      | high: 3, medium: 1 |
| Coverage            | complete           |
| Validation mode     | not recorded       |

Canonical artifacts: `scan-manifest.json`, `findings.json`, and `coverage.json`. This report is a deterministic projection of those files.

## Threat Model

No explicit canonical threat-model summary was recorded.

## Findings

| Finding                                                                                        | Severity | Confidence | Detailed write-up |
| ---------------------------------------------------------------------------------------------- | -------- | ---------- | ----------------- |
| [Attacker-controlled dictionary keys can pollute Object.prototype](#finding-1)                 | medium   | high       | inline below      |
| [Oversized file content can be read into memory before the size limit is enforced](#finding-2) | low      | high       | inline below      |
| [Non-file contents-API entries were not explicitly skipped](#finding-3)                        | low      | high       | inline below      |
| [Finding base/head state values were not passed through the redactor](#finding-4)              | low      | medium     | inline below      |

### Confidence Scale

| Label  | Meaning                                                                                  |
| ------ | ---------------------------------------------------------------------------------------- |
| high   | Direct evidence supports the finding with no material unresolved blocker.                |
| medium | Evidence supports a plausible issue, but material runtime or reachability proof remains. |
| low    | Evidence is incomplete and the item is retained only for explicit follow-up.             |

<a id="finding-1"></a>

### [1] Attacker-controlled dictionary keys can pollute Object.prototype

| Field                | Value                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Severity             | medium                                                                                                                                                 |
| Confidence           | high                                                                                                                                                   |
| Confidence rationale | Reproduced with a minimal fixture: out\['**proto**'\] = {NSPrivacyTracking: 'INJECTED'} made out\['NSPrivacyTracking'\] resolve to the injected value. |
| Category             | prototype-pollution                                                                                                                                    |
| CWE                  | CWE-1321                                                                                                                                               |
| Affected lines       | src/parsers/plist.ts:77-80, src/parsers/expoConfig.ts:79-81, src/config/schema.ts:48                                                                   |

#### Summary

Dictionaries built from untrusted plist/config keys assigned values with plain-object semantics, so a key such as **proto** could mutate Object.prototype and inject values the analyzer would read as configuration.

#### Root Cause

Plain-object assignment of attacker-controlled keys without null prototypes.

**Broken control**

```typescript
const out = {};
out[pendingKey] = convertNode(child);
```

#### Validation

Confirmed vulnerable before fix with a standalone Node reproduction; confirmed fixed after change with a dedicated security test (test/security/malicious.test.ts '**proto** keys do not pollute objects or inject values').

#### Dataflow

The canonical finding records the affected path at src/parsers/plist.ts:77-80, src/parsers/expoConfig.ts:79-81, src/config/schema.ts:48, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Medium** — A malicious PR author controls plist and app.config keys; successful pollution alters analyzer-visible configuration and can corrupt downstream object behavior, but does not achieve code execution on the runner.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Build all attacker-keyed dictionaries with Object.create(null) (applied in src/parsers/plist.ts, src/parsers/expoConfig.ts walkPartial/evaluateNode/deepMerge, src/config/schema.ts parseRuleOverrides/parseSdkCategories, src/rules/sdkCategories.ts).

Tests:

- test/security/malicious.test.ts (prototype-pollution fixture)

Preventive controls:

- Null-prototype objects for all attacker-keyed dictionaries
- Security fixture asserting Object.getPrototypeOf(result) === null

<a id="finding-2"></a>

### [2] Oversized file content can be read into memory before the size limit is enforced

| Field                | Value                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------- |
| Severity             | low                                                                                    |
| Confidence           | high                                                                                   |
| Confidence rationale | Direct source trace: fetchBlob/getFile read content before any maxFileSize comparison. |
| Category             | resource-exhaustion                                                                    |
| CWE                  | CWE-400                                                                                |
| Affected lines       | src/git/gitSnapshot.ts:91-94, src/github/client.ts:188-190                             |

#### Summary

The local git provider and the GitHub blob fallback fetched full blob content before buildSnapshot applied max-file-size-bytes, so a multi-gigabyte file in a PR could transiently exhaust runner/CLI memory.

#### Root Cause

Content read preceded the size check in the provider layer.

#### Validation

Verified the size guard now short-circuits before the read in fetchBlob, fetchWorkingFile, and GitHub getFile; oversized-file coverage-gap behavior is covered by test/unit/buildSnapshot.test.ts.

#### Dataflow

The canonical finding records the affected path at src/git/gitSnapshot.ts:91-94, src/github/client.ts:188-190, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Low** — Local-CLI DoS potential only; the GitHub contents API inlines only small files, and the fallback path is bounded after the fix. Requires a large file in the relevant-path set.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Check declared size (git cat-file -s / contents API size / stat) against max-file-size-bytes before reading content, and mark oversized files as truncated coverage gaps (applied).

Tests:

- test/unit/buildSnapshot.test.ts (oversized-file gap)

Preventive controls:

- Size check before read in all three providers (git blob, working tree, GitHub contents/blob fallback)

<a id="finding-3"></a>

### [3] Non-file contents-API entries were not explicitly skipped

| Field                | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| Severity             | low                                                         |
| Confidence           | high                                                        |
| Confidence rationale | Direct source inspection of the contents response handling. |
| Category             | input-validation                                            |
| CWE                  | CWE-20                                                      |
| Affected lines       | src/github/client.ts:162-170                                |

#### Summary

The GitHub contents client only special-cased symlinks; directories and submodules fell through to the blob fallback path, which could raise or fetch unexpected data instead of a clean skip.

#### Root Cause

Incomplete type handling for contents-API responses.

#### Validation

Code now returns a symlink-style skip for dir/submodule entries before the blob fallback.

#### Dataflow

The canonical finding records the affected path at src/github/client.ts:162-170, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Low** — The relevant-path set rarely contains directories/submodules; impact is a noisy error or unnecessary request rather than a security break, and it is now explicitly skipped.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Skip any contents-API entry whose type is not 'file' and record it as a coverage gap (applied).

Preventive controls:

- Explicit skip for all non-file contents entries

<a id="finding-4"></a>

### [4] Finding base/head state values were not passed through the redactor

| Field                | Value                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Severity             | low                                                                                                |
| Confidence           | medium                                                                                             |
| Confidence rationale | Code path confirmed; exploitability depends on rules populating state with secret-bearing content. |
| Category             | sensitive-data-exposure                                                                            |
| CWE                  | CWE-532                                                                                            |
| Affected lines       | src/engine.ts:39-40                                                                                |

#### Summary

candidateToFinding redacted evidence but copied baseState/headState verbatim, so a credential that appeared inside a compared configuration value (e.g., an exotic purpose string) could be echoed in JSON/markdown output.

#### Root Cause

Inconsistent redaction coverage between evidence and state fields.

#### Validation

Confirmed engine.ts now redacts both state fields; redaction unit tests still pass.

#### Dataflow

The canonical finding records the affected path at src/engine.ts:39-40, but no expanded source-to-sink narrative was recorded.

#### Reachability

Reachability was not recorded beyond the canonical finding summary and affected locations.

#### Severity

**Low** — ARD006 never populates state fields, and other rules' state values are configuration strings; the exposure requires a secret placed inside a compared config field, but defense-in-depth redaction is cheap.

Additional runtime or deployment evidence could raise or lower this severity.

#### Remediation

Route baseState/headState through redacted() before building Finding (applied).

Tests:

- test/unit/redact.test.ts

Preventive controls:

- Single redaction path for every string field emitted by the engine

## Reviewed Surfaces

| Surface                                                               | Risk Area    | Outcome  | Notes                                        |
| --------------------------------------------------------------------- | ------------ | -------- | -------------------------------------------- |
| Untrusted-content parsers (plist, JSON, YAML, static Expo config)     | not recorded | Reported | No additional canonical notes were recorded. |
| GitHub Action entry, REST client, snapshot builder, engine, reporters | not recorded | Reported | No additional canonical notes were recorded. |
| Local git snapshot layer and working-tree reads                       | not recorded | Reported | No additional canonical notes were recorded. |
| Rules, secret patterns, config schema, redaction                      | not recorded | Reported | No additional canonical notes were recorded. |

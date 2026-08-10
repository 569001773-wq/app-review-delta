# Architecture

## One engine, two entry points

AppReviewDelta ships a GitHub Action and a local CLI that both call the same analysis core:

```text
analyze(baseSnapshot, headSnapshot, config) -> AnalysisResult
```

```
src/
  action/        GitHub Action entry (reads pull_request context, REST client, annotations, job summary)
  cli/           Local CLI entry (git-object snapshot builder, commander)
  github/        GitHub REST client (compare, contents, blobs) + snapshot builder
  git/           Local git snapshot builder (git diff/show/cat-file; never executes project code)
  snapshots/     Scoped snapshot construction, relevant-path discovery, size/binary/symlink guards
  parsers/       plist (XML-as-data), JSON, static Expo app.config.js/ts extraction (Babel AST, no eval)
  rules/         Rule implementations + curated reference data (privacy categories, SDK categories, secret patterns)
  diff/          (fingerprints + base/head subtraction live in src/engine.ts)
  reporting/     Terminal, JSON, Markdown (job summary) reporters
  config/        .reviewdelta.yml parsing, validation, suppression expiry
  util/          Redaction, path safety, hashing, line lookup
```

## Snapshots

A snapshot is a scoped set of files at one revision (SHA or working tree), plus a coverage record:

```ts
interface Snapshot {
  ref: string;
  files: Map<string, SnapshotFile>; // relevant files only
  coverage: CoverageInfo; // gaps: dynamic-config, truncated-api, missing-file, oversized-file, binary-file, symlink, ...
}
```

Relevant paths are a small, documented set: root `package.json` and lockfiles, `app.json`/`app.config.*`, `eas.json`, `Info.plist`/plists under `ios/`, `*.entitlements`, `*.xcprivacy`, committed `.env*` files, and secret-shaped filenames. Everything else in the repository is ignored.

The GitHub source fetches the compare response (paginated, with truncation detection) and then individual file contents via the contents API, falling back to the Git blobs API for large files. The git source reads blobs with `git cat-file`/`git ls-tree` using literal pathspecs; symlinks are never followed.

## Static Expo config

`app.json` / `app.config.json` are parsed as JSON. `app.config.js` / `app.config.ts` are parsed with a Babel AST (typescript plugin) and evaluated only for provably safe literal constructs:

- object literals, arrays, strings, numbers, booleans, null;
- template literals without interpolation;
- simple unary/binary expressions on literals;
- `export default {…}`, `export default defineConfig({…})` (object first argument), `module.exports = {…}`.

Anything else — calls, imports, identifiers, computed values — marks the field unresolved. Unresolved fields become ARD008 coverage gaps; they are never treated as compliant or non-compliant.

## Findings and fingerprints

Rules emit candidates with a semantic key and value class. The engine computes a stable fingerprint:

```text
sha256([ruleId, semanticKey, normalizedPath, valueClass])
```

Line numbers are not part of identity. Base candidates and head candidates are subtracted by fingerprint:

- head candidate with a base twin at equal severity → pre-existing (hidden, counted);
- head candidate with a base twin at higher severity → introduced (worsened);
- head candidate with no base twin → introduced.

Rules that detect regressions (ARD002) or additions (ARD007) compare inside the rule, so they only emit for HEAD.

## Configuration

`.reviewdelta.yml` (parsed with the `yaml` package, validated strictly):

- `fail-on`: `error` (default) | `warning` | `never`;
- `rules.<ID>.enabled` and `rules.<ID>.severity` (optional overrides);
- `exclude-paths` (glob);
- `ignore` entries with a mandatory `reason` and optional `expires` (expired suppressions stop applying);
- `privacy-manifest.reason-code-mode`: `lenient` (default) | `strict`;
- `max-file-size-bytes` and `sdk-categories`.

Unknown rule IDs, missing reasons, invalid expiry dates, and path traversal in globs are configuration errors.

## Outputs

The same `AnalysisResult` drives:

- terminal reporter (default CLI output);
- GitHub job summary (Markdown);
- GitHub annotations (`error`/`warning`/`notice` with file and best-effort line);
- JSON reporter (`--format json` / Action `output-json`).

Every evidence string passes through the redactor before it reaches a reporter. `GITHUB_TOKEN` is only used to read the repository.

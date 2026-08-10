# Security Model

**The analyzed repository is untrusted input.** AppReviewDelta is designed so that a malicious fork PR — or a compromised repository — cannot execute code on the runner, leak secrets, or exfiltrate data through the Action.

## Design invariants

1. **No target checkout.** The Action does not check out or clone the target repository. It reads the `pull_request` event payload, the PR files API (paginated, up to 3000 files; the compare endpoint is used only when no PR number is available and is reported as truncated at 300 files), and individual file contents through the GitHub REST API. Head-side reads are routed to the fork repository (`pull_request.head.repo`) when the PR comes from a fork. If the workflow token cannot read the fork (for example a private fork), the check stops with a clear, actionable message instead of reporting partial results.
2. **Policy comes from the trusted base.** The scanner policy (`.reviewdelta.yml`) is read from the BASE revision by default, so a PR cannot disable rules, add suppressions, change severities, or set `fail-on: never` for its own check. PR-side policy changes are reported (ARD009) and take effect only after merge. `config-ref: head` opts into untrusted PR-controlled policy explicitly.
3. **Target code is data.** No target file is ever executed, imported, `require`d, or `eval`ed. Configuration files are parsed as syntax trees or data:
   - XML plists via a DOM-style parser with a tag-balance guard;
   - JSON via `JSON.parse`;
   - YAML via the `yaml` package (safe parse);
   - `app.config.js`/`app.config.ts` via a Babel AST and a strict literal evaluator.
4. **Read-only credentials.** The Action requests `contents: read` and `pull-requests: read` only. It never asks for write permissions, secrets, or an API key.
5. **No external data flow.** No telemetry, analytics, tracking, backend, cloud database, or third-party AI service. The only network endpoints are GitHub API endpoints needed to read the PR/repository (and the user's own runner for the Action itself).
6. **Scoped fetch.** Only a small documented set of relevant paths is fetched, each bounded by `max-file-size-bytes` (default 2 MiB). Binary files, symlinks, and oversized files are skipped and reported as coverage gaps.
7. **Secret hygiene.** ARD006 evidence is aggressively redacted by a dedicated redactor before any reporter sees it. No secret value is ever written to logs, summaries, or JSON output.
8. **Coverage honesty.** API truncation, parse failures, dynamic config, and inaccessible content are reported as ARD008 gaps. The tool never claims complete analysis it did not perform.

## What the Action executes

- its own bundled JavaScript (compiled from this repository at release time);
- the bundle is fully self-contained — it has no runtime `node_modules` dependency (the small GitHub Actions runner surface — inputs, outputs, annotations, step summary — is implemented locally in `src/action/runner.ts`), and CI verifies this with a bundle-integrity check that fails on unbundled-dependency stubs;
- `git` commands (local CLI only) that read objects: `rev-parse`, `diff`, `ls-tree`, `cat-file`, `show` — none of which run repository hooks or scripts;
- no target: `npm install`, scripts, Expo CLI, EAS, Metro, Babel, TypeScript, tests, builds, Xcode, CocoaPods, Ruby, Fastlane, Makefiles, shell scripts, or config plugins.

## Runner and token guidance

- Use the minimal permissions shown in the README. `GITHUB_TOKEN` is scoped to read by default and never exported into shell environments.
- Pin the Action to a full commit SHA for immutable releases, or to `v1` if you accept tag-move risk (see GitHub's action-pinning guidance).
- The Action's bundled `dist/action/index.js` is committed so consumers do not run a build step; the bundle is produced from the tagged source by the release workflow.

## Local CLI model

The CLI reads Git blobs for the two refs without checking them out. `git show`/`git cat-file` output is treated as bytes; blobs are never executed. Path handling uses git's literal pathspec magic, and working-tree reads verify the resolved path stays inside the repository.

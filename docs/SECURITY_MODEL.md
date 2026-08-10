# Security Model

**The analyzed repository is untrusted input.** AppReviewDelta is designed so that a malicious fork PR — or a compromised repository — cannot execute code on the runner, leak secrets, or exfiltrate data through the Action.

## Design invariants

1. **No target checkout.** The Action does not check out or clone the target repository. It reads the `pull_request` event payload, the compare response, and individual file contents through the GitHub REST API.
2. **Target code is data.** No target file is ever executed, imported, `require`d, or `eval`ed. Configuration files are parsed as syntax trees or data:
   - XML plists via a DOM-style parser with a tag-balance guard;
   - JSON via `JSON.parse`;
   - YAML via the `yaml` package (safe parse);
   - `app.config.js`/`app.config.ts` via a Babel AST and a strict literal evaluator.
3. **Read-only credentials.** The Action requests `contents: read` and `pull-requests: read` only. It never asks for write permissions, secrets, or an API key.
4. **No external data flow.** No telemetry, analytics, tracking, backend, cloud database, or third-party AI service. The only network endpoints are GitHub API endpoints needed to read the PR/repository (and the user's own runner for the Action itself).
5. **Scoped fetch.** Only a small documented set of relevant paths is fetched, each bounded by `max-file-size-bytes` (default 2 MiB). Binary files, symlinks, and oversized files are skipped and reported as coverage gaps.
6. **Secret hygiene.** ARD006 evidence is aggressively redacted by a dedicated redactor before any reporter sees it. No secret value is ever written to logs, summaries, or JSON output.
7. **Coverage honesty.** API truncation, parse failures, dynamic config, and inaccessible content are reported as ARD008 gaps. The tool never claims complete analysis it did not perform.

## What the Action executes

- its own bundled JavaScript (compiled from this repository at release time);
- `git` commands (local CLI only) that read objects: `rev-parse`, `diff`, `ls-tree`, `cat-file`, `show` — none of which run repository hooks or scripts;
- no target: `npm install`, scripts, Expo CLI, EAS, Metro, Babel, TypeScript, tests, builds, Xcode, CocoaPods, Ruby, Fastlane, Makefiles, shell scripts, or config plugins.

## Runner and token guidance

- Use the minimal permissions shown in the README. `GITHUB_TOKEN` is scoped to read by default and never exported into shell environments.
- Pin the Action to a full commit SHA for immutable releases, or to `v1` if you accept tag-move risk (see GitHub's action-pinning guidance).
- The Action's bundled `dist/action/index.js` is committed so consumers do not run a build step; the bundle is produced from the tagged source by the release workflow.

## Local CLI model

The CLI reads Git blobs for the two refs without checking them out. `git show`/`git cat-file` output is treated as bytes; blobs are never executed. Path handling uses git's literal pathspec magic, and working-tree reads verify the resolved path stays inside the repository.

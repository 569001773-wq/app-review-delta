# AppReviewDelta — Research & Positioning

**Date researched:** 2026-08-10 (fresh search performed on this date)

**Researcher:** AppReviewDelta maintainer (automated research during initial development)

This document records the fresh market research performed before implementation, the name-verification results, the competitor landscape, and the official-source index that the product's rules are anchored to. It is intentionally conservative: every factual claim here was checked against a primary or first-party source on the date above, and rule-level sources are re-verified during maintenance.

## 1. Why this tool exists

Expo / React Native teams shipping iOS apps already have strong tooling for _whole-project_ health (`npx expo-doctor`, Xcode warnings, static analyzers) and a growing ecosystem of LLM-based "preflight" review skills that scan an entire codebase against App Store Review Guidelines before submission. What is missing is a **deterministic, pull-request-scoped answer to one narrow question**:

> Which new iOS release-review risks or review-sensitive changes did this PR introduce?

Existing tools have three properties that make them a poor fit for CI-on-every-PR:

1. **Whole-project, not per-PR.** They re-scan everything on every run, so an old problem in the base branch re-appears as "new" and the signal is drowned in noise.
2. **LLM/agent-based or interactive.** They require an agent harness, an API key, or a human in the loop, and their output is a narrative judgment rather than a reproducible, rule-based report.
3. **They are not built around a no-execution model for CI.** AppReviewDelta is designed so the analyzed PR does not need to be checked out or executed: it reads the minimum relevant repository data through GitHub APIs and treats target code as untrusted data.

AppReviewDelta is designed for the gap in between: a static, rule-based, **base → head differential analyzer** that runs on `pull_request` events, reads only the files it needs through GitHub APIs (no target checkout, no project execution, no source upload), and reports only what a PR _newly introduced or materially worsened_. It deliberately does not predict approval, does not compute a compliance score, and does not claim to cover Apple policy exhaustively.

## 2. Name verification

Candidates evaluated (GitHub repository-name uniqueness checked globally on 2026-08-10 via the GitHub REST API; npm availability checked against the npm registry; GitHub Marketplace display-name uniqueness checked via Marketplace search):

| Candidate          | GitHub repo name available?                                   | npm package available?                  | Marketplace display-name collision?                                                                      | Notes                                                                                                                    |
| ------------------ | ------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `AppReviewDelta`   | Yes (`app-review-delta` and `appreviewdelta` both return 404) | Yes (`app-review-delta` not registered) | None found for "App Review Delta"                                                                        | Working name; matches product purpose; no confusingly similar active repo found                                          |
| `iOSReviewDelta`   | Yes                                                           | Yes                                     | None found                                                                                               | More platform-specific, but product also targets Expo/React Native config where the platform is implied; slightly longer |
| `StoreReviewDelta` | Yes                                                           | Yes                                     | "Store review" collides conceptually with App Store _user-review_ monitoring tools (e.g., ZReviewTender) | Risk of confusion with review-status/user-review monitoring                                                              |
| `AppStoreDelta`    | Yes                                                           | Yes                                     | None found                                                                                               | Too broad; could suggest store listing/price diffs                                                                       |
| `ReviewDiff`       | —                                                             | —                                       | —                                                                                                        | Explicitly excluded by project brief (name occupied)                                                                     |

**Decision: `AppReviewDelta`** (repository: `app-review-delta`, npm package: `app-review-delta`, Action display name: "App Review Delta").

Rationale:

- Globally unique on GitHub and npm as of the check date.
- No active repository, package, or Marketplace listing with this name or a confusingly similar active name was found.
- "App Review" + "Delta" is descriptive of the core value (what a PR _changes_ in release-review surface) without claiming approval prediction.
- The account that will host the repository (`569001773-wq`) has no existing repository with this name or a near name.

> Re-check immediately before publication, per the release gate.

## 3. Method

Fresh searches performed on 2026-08-10:

- GitHub repository search (via GitHub Search API) for ~20 concept queries, including: "App Store review github action", "iOS app review scanner", "App Store compliance action", "expo app store scanner", "app review diff pull request ios", "release risk diff ios", `StorePreflight`, `PreReview`, `app-review-skill`, `app-review-delta`, `iosreviewdelta`, `storereviewdelta`, `appstoredelta`, "store preflight", "app store compliance scanner".
- GitHub Marketplace search for "app review", "app store review".
- npm registry checks for the candidate names and adjacent packages.
- Apple Developer documentation (primary pages listed in §6).
- Expo documentation (primary pages listed in §6).
- GitHub Actions documentation (primary pages listed in §6).

## 4. Competitor and adjacent-project table

Each record is dated 2026-08-10. "Scope" uses these labels: **whole-project** (scans the current tree), **binary**, **metadata**, **PR-diff** (analyzes the difference between two revisions).

| Name                                                                                                    | What it actually does                                                                                                                                                                               | Scope                                  | Distribution                            | OSS                      | Stars | Recent activity                                | Overlap with us                                            | Differentiation                                                                                                               |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------- | ------------------------ | ----- | ---------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [truongduy2611/app-store-preflight-skills](https://github.com/truongduy2611/app-store-preflight-skills) | AI agent skill that scans iOS/macOS projects for App Store rejection patterns before submission                                                                                                     | whole-project                          | Agent skill (Claude Code / Codex skill) | Yes                      | 1313  | Pushed 2026-05-29                              | Same broad domain (pre-submission App Store risk)          | LLM-based whole-project narrative review; requires a coding-agent runtime; no PR-diff semantics; no deterministic CI report   |
| [safaiyeh/app-store-review-skill](https://github.com/safaiyeh/app-store-review-skill)                   | Claude Code skill to validate a codebase against Apple App Review Guidelines                                                                                                                        | whole-project                          | Agent skill                             | Yes                      | 267   | Pushed 2026-07-21                              | Same broad domain                                          | Whole-codebase agent review; subjective guideline judgment; not PR-scoped; not deterministic                                  |
| [devsemih/appstore-review-skill](https://github.com/devsemih/appstore-review-skill)                     | Claude Code skill checking iOS apps (Swift/Flutter/RN/Expo/KMP) against App Store Review Guidelines pre-submission                                                                                  | whole-project                          | Agent skill                             | Yes                      | 84    | Pushed 2026-07-13                              | Same broad domain                                          | Agent-based; whole-project; no diff semantics                                                                                 |
| [mjmirza/app-store-compliance](https://github.com/mjmirza/app-store-compliance)                         | Enterprise rejection-compliance playbook + pre-submission guard + agent audit skill                                                                                                                 | whole-project / process                | Docs + agent skill                      | Yes                      | 76    | Pushed 2026-08-09                              | Same broad domain                                          | Documentation/playbook-oriented; LLM skill; no PR-diff analysis                                                               |
| [atharvnaik1/ipaship-audit](https://github.com/atharvnaik1/ipaship-audit)                               | AI agent review of iOS/Android apps for policy/security bugs; web app, CLI, MCP, Claude skill                                                                                                       | whole-project (and binary-ish via web) | Web app / CLI / MCP / skill             | Yes                      | 43    | Pushed 2026-05-25                              | Same broad domain                                          | LLM-based; whole-project; requires agent/LLM; no PR-diff                                                                      |
| [momenbuilds/app-launch-guard](https://github.com/momenbuilds/app-launch-guard)                         | Open-source CLI + GitHub Action that scans the _current_ iOS project for App Store submission risks (plists, privacy manifest, metadata, analytics, RevenueCat, security) and computes a risk score | whole-project                          | CLI + GitHub Action + npm               | Yes (MIT)                | 14    | Pushed 2026-05-20 (single push, 0 open issues) | Closest single-tool overlap (CLI + Action, static, no LLM) | Whole-project scan of the current tree (per its README/examples); risk score (explicitly out of our scope); no base→head diff |
| [kotaroyamazaki/playcheck](https://github.com/kotaroyamazaki/playcheck)                                 | Google Play Store compliance scanner for Android apps                                                                                                                                               | whole-project                          | CLI/script                              | Yes                      | 2     | Pushed 2026-02-18                              | Conceptually adjacent (pre-submission scanner)             | Android/Google Play only; no PR-diff                                                                                          |
| [asif786ka/store-preflight-mcp](https://github.com/asif786ka/store-preflight-mcp)                       | MCP mapping API usage to required privacy declarations before store submission                                                                                                                      | whole-project                          | MCP server                              | Yes                      | 0     | Pushed 2026-07-15                              | Adjacent (privacy declaration mapping)                     | MCP/LLM oriented; whole-project; no PR-diff                                                                                   |
| [cristianoendo/store-audit-plugin](https://github.com/cristianoendo/store-audit-plugin)                 | Claude Code plugin scanning App Store/Google Play projects with parallel auditors                                                                                                                   | whole-project                          | Agent plugin                            | Yes                      | 0     | Pushed 2026-04-28                              | Adjacent                                                   | Agent-based; whole-project; no PR-diff                                                                                        |
| [suntan-superman/StorePreflight](https://github.com/suntan-superman/StorePreflight)                     | Next.js web app ("StorePreflight" SaaS-style submission workflow with auth/dashboard/scan API)                                                                                                      | whole-project / web                    | Web app                                 | Repo public (no license) | 0     | Pushed 2026-01-05                              | Name-adjacent only                                         | Web SaaS; no license; no PR-diff; unrelated architecture                                                                      |
| [DooHyun-Lee/ReviewDiff](https://github.com/DooHyun-Lee/ReviewDiff)                                     | Stale personal repo (2023), unrelated to App Store review                                                                                                                                           | n/a                                    | n/a                                     | Yes                      | 0     | 2023-12                                        | None                                                       | Name collision only; explicitly excluded by brief                                                                             |
| [ZReviewTender](https://github.com/marketplace) (Marketplace)                                           | Monitors _user_ App Store/Google Play reviews and forwards them to Slack                                                                                                                            | n/a (monitoring)                       | GitHub App                              | Unknown                  | n/a   | n/a                                            | None (different meaning of "reviews")                      | Monitors user reviews, not release-review risk                                                                                |
| "App Store Review Monitor" (Marketplace discussion)                                                     | Monitors App Store Connect _review status_ and files GitHub Issues                                                                                                                                  | n/a (monitoring)                       | GitHub Action                           | Unknown                  | n/a   | 2026-03                                        | None                                                       | Monitors submission status, not PR risk                                                                                       |

### Adjacent non-competitors

- **Expo Doctor** (`npx expo-doctor`) — validates Expo project configuration and dependency compatibility. Whole-project, execution-based, not review-risk focused. We are not a replacement; our scope is the _review-sensitive delta_ of a PR.
- **Apple App Store Connect / App Review** — the actual human review process. We explicitly are not a replacement, predictor, or submission assistant.
- **GitHub code review / diff review tools** — review code quality, not release-review surface.
- **Generic secret scanners (gitleaks, trufflehog, GitHub secret scanning)** — broader secret detection across history; our ARD006 is a narrow, conservative, config-file-focused rule, not a replacement.

## 5. Reassessment: is the idea already taken?

The brief required a stop-and-reassess if a mature, actively maintained project already offers specifically: _static base-to-head pull-request analysis reporting newly introduced Apple/iOS release-review risks_.

**Result: no such project was found.** Every scanner/preflight tool found is whole-project and/or LLM-agent-based. The closest single-tool analog (`app-launch-guard`) is a whole-project scanner that operates on the current project tree (per its README/examples). No project was found that:

- analyzes `BASE SHA → HEAD SHA` semantically,
- fetches only needed files through GitHub APIs without checking out the target,
- refuses to execute any target code,
- reports only newly introduced/review-sensitive changes with rule IDs, confidence, and official sources.

The differentiation therefore holds, and implementation proceeds.

## 6. Official-source index (checked 2026-08-10)

### Apple Developer documentation (primary)

| Topic                                                                                                                                      | Source                                                   | URL                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ATS overview                                                                                                                               | Apple Developer: NSAppTransportSecurity                  | https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity                             |
| ATS: NSAllowsArbitraryLoads (justification required at review when YES)                                                                    | Apple Developer: NSAllowsArbitraryLoads                  | https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloads      |
| ATS: Provide Justification for Exceptions                                                                                                  | Apple Developer: Preventing Insecure Network Connections | https://developer.apple.com/documentation/security/preventing-insecure-network-connections                                             |
| Required reason API (privacy manifest requirements; May 1, 2024 App Store Connect enforcement)                                             | Apple Developer: Describing use of required reason API   | https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api                                        |
| Privacy manifest schema keys (`NSPrivacyTracking`, `NSPrivacyTrackingDomains`, `NSPrivacyCollectedDataTypes`, `NSPrivacyAccessedAPITypes`) | Apple Developer: App Privacy Configuration               | https://developer.apple.com/documentation/bundleresources/app-privacy-configuration                                                    |
| Privacy manifest file format/name                                                                                                          | Apple Developer: Privacy manifest files                  | https://developer.apple.com/documentation/bundleresources/privacy-manifest-files                                                       |
| Accessed API categories and reason codes                                                                                                   | Apple Developer: NSPrivacyAccessedAPIType                | https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype |
| Camera usage description required                                                                                                          | Apple Developer: NSCameraUsageDescription                | https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription                           |
| Microphone usage description required                                                                                                      | Apple Developer: NSMicrophoneUsageDescription            | https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription                       |
| Photo library usage description required                                                                                                   | Apple Developer: NSPhotoLibraryUsageDescription          | https://developer.apple.com/documentation/bundleresources/information-property-list/nsphotolibraryusagedescription                     |
| Location (when in use) usage description required                                                                                          | Apple Developer: NSLocationWhenInUseUsageDescription     | https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationwheninuseusagedescription                |
| Tracking usage description (ATT)                                                                                                           | Apple Developer: NSUserTrackingUsageDescription          | https://developer.apple.com/documentation/bundleresources/information-property-list/nsusertrackingusagedescription                     |
| Background modes possible values                                                                                                           | Apple Developer: UIBackgroundModes                       | https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes                                  |

### Expo documentation (primary)

| Topic                                                                              | Source                                   | URL                                               |
| ---------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Privacy manifests in app config (`ios.privacyManifests`)                           | Expo: Privacy manifests guide            | https://docs.expo.dev/guides/apple-privacy/       |
| App config reference (`ios.infoPlist`, `ios.entitlements`, `ios.privacyManifests`) | Expo: app.json / app.config.js reference | https://docs.expo.dev/versions/latest/config/app/ |

### GitHub Actions documentation (primary)

| Topic                                                                                               | Source                                                | URL                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Security hardening (least privilege, `pull_request_target` risk, script injection, pinning actions) | GitHub Docs: Secure use reference                     | https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions             |
| Marketplace publishing requirements (public repo, root `action.yml`, unique name, agreement, 2FA)   | GitHub Docs: Publishing actions in GitHub Marketplace | https://docs.github.com/en/actions/sharing-automations/creating-actions/publishing-actions-in-github-marketplace                 |
| Release/versioning convention (semantic tags, major `v1` tag, build at release time)                | GitHub Docs: Releasing and maintaining actions        | https://docs.github.com/en/actions/sharing-automations/creating-actions/releasing-and-maintaining-actions                        |
| Compare two commits REST API (files, statuses, truncation at 300 files)                             | GitHub REST API docs: Compare two commits             | https://docs.github.com/en/rest/commits/commits#compare-two-commits                                                              |
| Get repository content (single-file fetch, no checkout)                                             | GitHub REST API docs: Get repository content          | https://docs.github.com/en/rest/repos/contents#get-repository-content                                                            |
| `pull_request` event payload (`base.sha`, `head.sha`)                                               | GitHub Docs: Events that trigger workflows            | https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#pull_request |

## 7. Notes for maintainers

- Apple's required-reason-API list is explicitly described by Apple as "continually reviewed" and updated. Rules that depend on it (ARD001) ship the observed 2026-08-10 category/reason table and mark membership checks as `WARNING` with a `lastVerified` date, never as an absolute judgment.
- GitHub Actions switched its JavaScript runtime default to Node 24 on 2026-06-02 (Node 20 removal planned for September 2026). The Action metadata uses `runs.using: node24`.
- The npm package name is available but no npm credentials exist on this machine; npm publication is prepared (package metadata + `npm pack` verified) but not performed, and does not block the GitHub Action release.

# Limitations

AppReviewDelta is a narrow, static, differential tool. It is honest about what it cannot know.

## What the tool cannot do

- **Predict or guarantee App Store approval or rejection.** Apple App Review is a human process; static config analysis cannot replicate it.
- **Prove API usage.** ARD004 cannot prove that a permission is actually used by the app. It reports configured surfaces and obvious string-quality problems only.
- **Resolve dynamic Expo config.** `app.config.js`/`app.config.ts` values produced by functions, imports, environment-dependent expressions, or runtime branching are reported as ARD008 coverage gaps — never assumed compliant or non-compliant.
- **Detect everything.** Rule coverage is limited to the V1 rule set; Apple policy is broader than any static rule list.
- **Scan binaries or IPAs.** No IPA/binary inspection is performed.
- **Judge business purpose.** ARD005 never infers why a background mode exists; it flags the introduced capability for human verification.
- **Cover subjective review criteria.** No rules for design quality, screenshots, metadata truthfulness, minimum functionality, spam, kids category, and other subjective or content-dependent areas (explicitly out of V1).

## Data-quality limitations

- **Required-reason-API table is dated.** ARD001's category/reason membership reflects Apple's documentation checked on 2026-08-10. Apple updates the list; lenient mode therefore reports out-of-table codes as WARNING, not ERROR.
- **GitHub API truncation.** Very large diffs or content responses may be truncated; this is reported as a coverage gap.
- **Lockfile scope.** ARD007 reads the root `package.json` (dependencies + devDependencies); transitive dependencies are not classified in V1.
- **File scope.** Only the documented relevant-path set is fetched. Code-level review risks (e.g., a new API call in Swift) are not analyzed in V1.
- **Redaction is pattern-based.** Unknown credential formats could in principle pass through; the redactor covers the private formats the tool detects.

## False-positive policy

The product optimizes for a low false-positive rate: six excellent rules over sixty noisy rules. Findings use conservative wording ("may", "review-sensitive", "needs human review"), separate facts from heuristics, and only ERROR when Apple/Expo documentation objectively supports the claim from static evidence. If a rule is wrong, report it via the [false-positive issue template](../.github/ISSUE_TEMPLATE/false_positive.md).

## Explicitly out of V1

Not automated in V1 (may become experimental human-review rules after evidence and false-positive testing): account creation without deletion, Restore Purchases, external payments / Stripe legality, UGC moderation completeness, Sign in with Apple requirement, third-party AI consent, medical rules, kids category, VPN/MDM, crypto, gambling, 4.3 spam, minimum functionality, subjective design quality, App Store screenshots, metadata truthfulness.

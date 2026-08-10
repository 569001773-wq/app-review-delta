# AppReviewDelta Rules (V1)

Each rule below includes: stable ID, title, severity policy, confidence policy, official source (with identifier where applicable), a short paraphrase, detection-logic documentation, false-positive considerations, and the last-verified date of the official source.

Terminology used in output:

- **introduced by this PR** — the finding did not exist in BASE (or materially worsened).
- **review-sensitive change** — a config change that materially alters the App Store review surface.
- **release risk** — something Apple or Expo documents as requiring justification or verification.
- **needs human review** — the tool cannot prove the app's real behavior.
- **analysis coverage limitation** — a relevant value could not be resolved statically.

Severity levels: `ERROR` (fails CI by default), `WARNING` (never fails by default), `INFO` (never fails by default). Confidence: `HIGH`, `MEDIUM`, `LOW`.

---

## ARD001 — Invalid Privacy Manifest

- **Default severity:** ERROR
- **Default confidence:** HIGH
- **Category:** privacy
- **Official source:** [Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) · [Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files) · [App Privacy Configuration](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration) (checked 2026-08-10)
- **Guideline reference:** Apple enforces required-reason-API declarations in App Store Connect submissions (email notice + rejection starting May 1, 2024).

**Paraphrase:** PrivacyInfo.xcprivacy (or `expo.ios.privacyManifests`) must follow the structure Apple documents. A structurally invalid manifest cannot satisfy the declaration requirement.

**Detection logic:**

1. Parse `*.xcprivacy` files as plist data (never executed). Parse failures are `ERROR`.
2. Validate the root is a dictionary; `NSPrivacyTracking` is a boolean; `NSPrivacyTrackingDomains` is a non-empty list of domain strings when tracking is enabled.
3. Validate `NSPrivacyAccessedAPITypes` is an array of dictionaries, each with a string `NSPrivacyAccessedAPIType` and a non-empty array-of-strings `NSPrivacyAccessedAPITypeReasons`.
4. Validate reason-code format (`^[A-Z0-9]{2,6}\.[0-9]{1,2}$`). Reason codes outside the documented set (per the 2026-08-10 Apple page) are `WARNING MEDIUM` in lenient mode and `ERROR HIGH` in strict mode, because Apple updates this list.
5. Validate `NSPrivacyCollectedDataTypes` entries fully: `NSPrivacyCollectedDataType` (required string), `NSPrivacyCollectedDataTypeLinked` (required Boolean), `NSPrivacyCollectedDataTypeTracking` (required Boolean), and `NSPrivacyCollectedDataTypePurposes` (required array of strings from Apple's documented purpose list; unknown values are `WARNING MEDIUM` in lenient mode and `ERROR HIGH` in strict mode).
6. Unknown top-level keys are `INFO LOW`.

**False-positive considerations:** The category/reason table is versioned (`PRIVACY_ACCESSED_LAST_VERIFIED = 2026-08-10`); Apple explicitly says the list is continually reviewed. Domain-format checks are heuristic (`WARNING` only). Never invented schema requirements: only rules Apple documents are enforced as ERROR.

---

## ARD002 — Privacy Manifest Regression

- **Default severity:** WARNING
- **Default confidence:** HIGH
- **Category:** privacy
- **Official source:** [Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) (checked 2026-08-10)

**Paraphrase:** Removing or weakening a previously declared privacy-manifest item (API category, reason, tracking declaration, tracking domain) changes the App Privacy surface and is review-sensitive.

**Detection logic:** Compares parsed privacy manifests between BASE and HEAD (per file identity, including the statically resolved `expo.ios.privacyManifests` source):

- previously declared accessed-API category removed → `WARNING HIGH`;
- previously declared reason code removed → `WARNING HIGH`;
- tracking flag changed (`false → true`) → `WARNING MEDIUM`;
- tracking domains removed while tracking remains enabled → `WARNING MEDIUM` per domain.

ARD002 never claims the new state is invalid — that is ARD001's job.

**False-positive considerations:** A removal may be intentional (e.g., an SDK was removed). The finding describes exactly what changed and asks for confirmation.

---

## ARD003 — ATS Exception Introduced

- **Default severity:** WARNING (NSAllowsLocalNetworking defaults to INFO LOW)
- **Default confidence:** HIGH for `NSAllowsArbitraryLoads`; MEDIUM for other exceptions
- **Category:** network
- **Official source:** [NSAllowsArbitraryLoads](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloads) · [NSAppTransportSecurity](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity) · [Preventing Insecure Network Connections](https://developer.apple.com/documentation/security/preventing-insecure-network-connections) (checked 2026-08-10)

**Paraphrase:** Newly enabled ATS exceptions are review-sensitive. Apple explicitly states: "You must supply a justification during App Store review if you set [NSAllowsArbitraryLoads] to YES."

**Detection logic:** Reads `NSAppTransportSecurity` from Info.plist files and statically resolvable `expo.ios.infoPlist`. Emits one finding per exception key/value enabled in HEAD: `NSAllowsArbitraryLoads`, `NSAllowsArbitraryLoadsForMedia`, `NSAllowsArbitraryLoadsInWebContent`, per-domain `NSExceptionAllowsInsecureHTTPLoads`, and `NSAllowsLocalNetworking`. BASE/HEAD subtraction suppresses exceptions that already existed. Reports exact key, old value, new value, why review justification may be required, and the Apple source. Never claims rejection.

**False-positive considerations:** `NSAllowsLocalNetworking` is a common, narrower exception and is intentionally INFO LOW. Exception presence is not a policy violation.

---

## ARD004 — Sensitive Permission Configuration Changed

- **Default severity:** WARNING (empty/placeholder strings); INFO (surface introduced); INFO LOW (heuristically generic wording)
- **Default confidence:** HIGH for facts; LOW for heuristics
- **Category:** permissions
- **Official source:** [Information Property List](https://developer.apple.com/documentation/bundleresources/information-property-list) · individual `NS*UsageDescription` pages (e.g., [NSMicrophoneUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription), [NSCameraUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription), [NSUserTrackingUsageDescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nsusertrackingusagedescription)) (checked 2026-08-10)

**Paraphrase:** New or materially changed iOS permission surfaces (camera, microphone, photos, location, contacts, tracking, and other protected resources) are review-sensitive; purpose strings must actually tell people why access is requested.

**Detection logic:** Tracks the documented `NS*UsageDescription` keys across Info.plist sources and statically resolvable `expo.ios.infoPlist`:

- non-string value for a usage-description key → `ERROR HIGH` (Apple defines these keys as strings);
- new permission key → `INFO HIGH` ("permission surface introduced");
- empty or whitespace-only value → `WARNING HIGH`;
- placeholder value (known placeholder phrases) → `WARNING HIGH`;
- heuristically generic default wording → `INFO LOW` (labeled heuristic);
- materially rewordinged explicit string → `INFO LOW`.

Each finding distinguishes **fact** ("This PR adds NSMicrophoneUsageDescription.") from **heuristic** ("The wording may be too generic for the actual use case.").

**False-positive considerations:** Merely importing `expo-camera` without a usage description is not reported (API use cannot be proven statically). Boilerplate strings are only flagged as heuristics, never ERROR. Generic-wording detection is deliberately narrow to avoid noise.

Tracked keys include the current protected-resource set: camera, microphone, photo library (read and add), location (when-in-use and always), contacts, tracking (ATT), Bluetooth, calendars (`NSCalendarsUsageDescription`, `NSCalendarsFullAccessUsageDescription`, `NSCalendarsWriteOnlyAccessUsageDescription`), reminders (`NSRemindersUsageDescription`, `NSRemindersFullAccessUsageDescription`), motion, speech recognition, Face ID, health share/update, local network, media library, Siri, and video subscriber accounts.

---

## ARD005 — Background Mode Introduced

- **Default severity:** INFO HIGH; WARNING MEDIUM for `voip`, `location`, `processing`
- **Default confidence:** HIGH
- **Category:** background
- **Official source:** [UIBackgroundModes](https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes) · [Configuring background execution modes](https://developer.apple.com/documentation/Xcode/configuring-background-execution-modes) (checked 2026-08-10)

**Paraphrase:** A newly declared background mode expands the background capabilities App Review scrutinizes; Apple limits background execution to documented purposes.

**Detection logic:** Compares `UIBackgroundModes` between BASE and HEAD across Info.plist sources and statically resolvable `expo.ios.infoPlist`. Reports each newly added mode. `voip`/`location`/`processing` default to `WARNING MEDIUM`; other modes default to `INFO HIGH`. Never infers the app's real business purpose.

**False-positive considerations:** Declaring a background mode is not automatically a violation; the finding asks for verification that the capability matches actual behavior.

---

## ARD006 — Strong Client Secret Exposure

- **Default severity:** ERROR
- **Default confidence:** HIGH
- **Category:** secret
- **Official source:** [Apple Developer: manage API keys for App Store Connect API](https://developer.apple.com/help/account/manage-api-keys-for-app-store-connect-api/) · [Expo environment variables](https://docs.expo.dev/guides/environment-variables/) (checked 2026-08-10)

**Paraphrase:** Committed private credentials are a release and security risk. Only clearly private formats are flagged; public client identifiers are not.

**Detection logic:** Scans only the scoped configuration/secret-shaped files in the snapshot. Matches provider-specific private formats:

- PEM/PKCS8/OpenSSH private key blocks (including App Store Connect `AuthKey_*.p8`);
- AWS access key IDs and assigned secret access keys;
- OpenAI (`sk-proj-…`, legacy `sk-…`), Anthropic (`sk-ant-…`), Stripe secret keys (`sk_live_…`), GitHub tokens, Slack tokens;
- Google service-account `private_key` JSON;
- `EXPO_PUBLIC_*` variables whose name **and** value together match a private credential format (e.g., `EXPO_PUBLIC_OPENAI_API_KEY=sk-proj-…`).

All evidence is redacted (`EXPO_PUBLIC_OPENAI_API_KEY=<redacted>`), never the raw value.

**False-positive considerations:** Variables named `API_KEY` alone are not evidence. Stripe publishable keys, Google/Firebase API keys, Sentry DSNs, RevenueCat public API keys (`appl_…`, which are public by design), and other intentionally public client identifiers are never flagged.

---

## ARD007 — Review-Sensitive SDK Category Added

- **Default severity:** INFO (never blocks CI)
- **Default confidence:** HIGH
- **Category:** sdk
- **Official source:** [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (checked 2026-08-10)

**Paraphrase:** Adding a purchase, ads, tracking, analytics, social-authentication, or AI/data-processing SDK changes the App Store review/privacy/payment surface.

**Detection logic:** Compares root `package.json` dependencies and devDependencies between BASE and HEAD. For each newly added package, checks a small curated database (`src/rules/sdkCategories.ts`, documented and easy to update; custom categories via `sdk-categories` config). Emits one INFO finding per package/category: "This PR adds a purchase SDK. App Store review/privacy/payment surfaces may have changed."

**False-positive considerations:** A category match does not imply misuse or a policy violation; dev-only or unused dependencies may have no review impact. INFO only.

---

## ARD008 — Static Analysis Coverage Gap

- **Default severity:** INFO
- **Default confidence:** HIGH
- **Category:** coverage
- **Official source:** this repository's [LIMITATIONS.md](LIMITATIONS.md)

**Paraphrase:** When relevant configuration cannot be resolved statically, the tool says so instead of pretending analysis was complete.

**Detection logic:** The engine compares coverage gaps between BASE and HEAD snapshots and reports newly appearing gaps:

- dynamic `app.config.js`/`app.config.ts` fields that cannot be resolved safely;
- GitHub API compare truncation;
- missing, oversized, binary, or symlink files;
- unparsable plist/config sources.

**False-positive considerations:** A gap is not a compliance problem; it is an honest limitation and never blocks CI.

---

## ARD009 — Scanner Policy Changed in PR

- **Default severity:** INFO
- **Default confidence:** HIGH
- **Category:** config
- **Official source:** [docs/SECURITY_MODEL.md](SECURITY_MODEL.md)

**Paraphrase:** The scanner policy (`.reviewdelta.yml`) is read from the BASE revision so a PR cannot change the rules that gate its own check; a policy change in the PR is reported for transparency and takes effect only after merge.

**Detection logic:** Compares `.reviewdelta.yml` between BASE and HEAD and reports added, removed, or changed policy. The current check always uses the BASE policy (or defaults when the base has none); `config-ref: head` opts into untrusted PR-controlled policy explicitly.

**False-positive considerations:** Intentional policy changes (for example adding a suppression with a reason) are expected; the finding is informational and never blocks CI.

---

## Severity overrides

Every rule honors per-rule `severity` overrides from the configuration (`rules.<ID>.severity`), including ARD002, ARD006, ARD007, ARD008, and ARD009.

---

## Explicitly out of V1

The following are deliberately NOT automated in V1 (documented in [LIMITATIONS.md](LIMITATIONS.md)): account creation without deletion, Restore Purchases, external payments/Stripe legality, UGC moderation completeness, Sign in with Apple requirement, third-party AI consent, medical rules, kids category, VPN/MDM, crypto, gambling, 4.3 spam, minimum functionality, subjective design quality, App Store screenshots, and metadata truthfulness.

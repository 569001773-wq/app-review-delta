## AppReviewDelta

**6 review-sensitive changes introduced by this PR**

| Severity | Rule | Finding | File |
|---|---|---|---|
| WARNING | ARD003 | NSAllowsArbitraryLoads ATS exception enabled | `ios/DemoApp/Info.plist` |
| WARNING | ARD004 | Permission purpose string is empty: NSMicrophoneUsageDescription | `ios/DemoApp/Info.plist` |
| INFO | ARD004 | Permission surface introduced: NSMicrophoneUsageDescription | `ios/DemoApp/Info.plist` |
| INFO | ARD005 | Background mode introduced: audio | `ios/DemoApp/Info.plist` |
| INFO | ARD007 | Review-sensitive SDK added (purchases) | `package.json` |
| INFO | ARD007 | Review-sensitive SDK added (tracking) | `package.json` |

### WARNING · ARD003 · NSAllowsArbitraryLoads ATS exception enabled

**File:** `ios/DemoApp/Info.plist`

**Confidence:** HIGH

**Before:** (not present)

**After:** true

NSAllowsArbitraryLoads:
(not present) -> true

**Why this matters:** Apple documents that a justification must be supplied during App Store review when NSAllowsArbitraryLoads is YES.

**Suggested action:** Use a narrower exception (NSExceptionDomains) if possible, or prepare a clear review justification.

_Source: [NSAllowsArbitraryLoads | NSAppTransportSecurity](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowsarbitraryloads)_

### WARNING · ARD004 · Permission purpose string is empty: NSMicrophoneUsageDescription

**File:** `ios/DemoApp/Info.plist`

**Confidence:** HIGH

**Before:** (not present)

**After:** (empty string)

fact: NSMicrophoneUsageDescription changed in ios/DemoApp/Info.plist.

**Why this matters:** Apple requires a message that tells people why the app requests access; an empty or placeholder string fails that purpose.

**Suggested action:** Provide a clear, specific purpose string for the permission.

_Source: [Information Property List: protected-resource usage descriptions (Apple Developer)](https://developer.apple.com/documentation/bundleresources/information-property-list)_

### INFO · ARD004 · Permission surface introduced: NSMicrophoneUsageDescription

**File:** `ios/DemoApp/Info.plist`

**Confidence:** HIGH

**Before:** (not present)

**After:** 

fact: this PR adds NSMicrophoneUsageDescription (ios/DemoApp/Info.plist).

**Why this matters:** A new protected-resource permission changes the App Store review surface and the user-facing permission prompt.

**Suggested action:** Confirm the permission is actually used and the purpose string is clear and specific.

_Source: [Information Property List: protected-resource usage descriptions (Apple Developer)](https://developer.apple.com/documentation/bundleresources/information-property-list)_

### INFO · ARD005 · Background mode introduced: audio

**File:** `ios/DemoApp/Info.plist`

**Confidence:** HIGH

**Before:** (not present)

**After:** audio

UIBackgroundModes adds "audio" in ios/DemoApp/Info.plist.

**Why this matters:** Apple limits background execution to intended purposes. A new background mode is a review-sensitive capability that should match actual app behavior.

**Suggested action:** Confirm the background mode is required and matches the app functionality described to reviewers.

_Source: [UIBackgroundModes | Configuring background execution modes](https://developer.apple.com/documentation/bundleresources/information-property-list/uibackgroundmodes)_

### INFO · ARD007 · Review-sensitive SDK added (purchases)

**File:** `package.json`

**Confidence:** HIGH

**Before:** (not present)

**After:** react-native-purchases

This PR adds "react-native-purchases" (in-app purchases or subscriptions) to package.json dependencies. App Store review/privacy/payment surfaces may have changed.

**Why this matters:** Purchase, advertising, tracking, analytics, social-auth, and AI/data-processing SDKs are categories App Review and privacy processes look at closely.

**Suggested action:** Confirm the SDK is required, and update App Privacy / review materials if the data surface changes.

_Source: [App Store Review Guidelines (privacy and payments sections)](https://developer.apple.com/app-store/review/guidelines/)_

### INFO · ARD007 · Review-sensitive SDK added (tracking)

**File:** `package.json`

**Confidence:** HIGH

**Before:** (not present)

**After:** react-native-tracking-transparency

This PR adds "react-native-tracking-transparency" (tracking or attribution SDKs) to package.json dependencies. App Store review/privacy/payment surfaces may have changed.

**Why this matters:** Purchase, advertising, tracking, analytics, social-auth, and AI/data-processing SDKs are categories App Review and privacy processes look at closely.

**Suggested action:** Confirm the SDK is required, and update App Privacy / review materials if the data surface changes.

_Source: [App Store Review Guidelines (privacy and payments sections)](https://developer.apple.com/app-store/review/guidelines/)_

---

_AppReviewDelta does not guarantee App Store approval and is not affiliated with Apple. Target code is inspected as data and never executed._

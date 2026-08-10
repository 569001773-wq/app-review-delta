/**
 * Privacy-manifest reference data, checked against Apple's documentation on
 * 2026-08-10. Apple explicitly describes the required-reason-API list as
 * continually reviewed; membership checks therefore degrade to WARNING in
 * lenient mode (the default).
 */

export const PRIVACY_ACCESSED_CATEGORIES: Record<string, string[]> = {
  NSPrivacyAccessedAPICategoryFileTimestamp: ['DDA9.1', 'C617.1', '3B52.1', '0A2A.1'],
  NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1', '8FFB.1', '3D61.1'],
  NSPrivacyAccessedAPICategoryDiskSpace: ['85F4.1', 'E174.1', '7D9E.1', 'B728.1'],
  NSPrivacyAccessedAPICategoryActiveKeyboards: ['3EC4.1', '54BD.1'],
  NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1', '1C8F.1', 'C56D.1', 'AC6B.1'],
};

export const PRIVACY_ACCESSED_LAST_VERIFIED = '2026-08-10';

export const PRIVACY_MANIFEST_TOP_LEVEL_KEYS = [
  'NSPrivacyTracking',
  'NSPrivacyTrackingDomains',
  'NSPrivacyCollectedDataTypes',
  'NSPrivacyAccessedAPITypes',
] as const;

export const REASON_CODE_FORMAT = /^[A-Z0-9]{2,6}\.[0-9]{1,2}$/;

/**
 * Documented NSPrivacyCollectedDataTypePurposes values, checked against
 * Apple's "Describing data use in privacy manifests" documentation on
 * 2026-08-10. Apple states that custom reasons break privacy-report
 * generation, so membership is validated (lenient mode warns on unknown
 * values because the list may change).
 */
export const COLLECTED_DATA_PURPOSES = [
  'NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising',
  'NSPrivacyCollectedDataTypePurposeDeveloperAdvertising',
  'NSPrivacyCollectedDataTypePurposeAnalytics',
  'NSPrivacyCollectedDataTypePurposeProductPersonalization',
  'NSPrivacyCollectedDataTypePurposeAppFunctionality',
  'NSPrivacyCollectedDataTypePurposeOther',
] as const;

export const COLLECTED_DATA_PURPOSES_LAST_VERIFIED = '2026-08-10';

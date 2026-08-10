/**
 * Curated package database for ARD007. Small by design: easy to audit and
 * update. Categories describe App Store review/privacy-sensitive surfaces,
 * not policy violations.
 */

export interface SdkCategoryEntry {
  description: string;
  /** Package names; entries ending in '/' are scope prefixes. */
  patterns: string[];
}

export const SDK_CATEGORIES: Record<string, SdkCategoryEntry> = {
  purchases: {
    description: 'in-app purchases or subscriptions',
    patterns: [
      'react-native-purchases',
      '@revenuecat',
      'purchases-react-native',
      'react-native-iap',
      'react-native-billing',
      'expo-iap',
    ],
  },
  ads: {
    description: 'advertising SDKs',
    patterns: [
      'react-native-admob',
      '@react-native-admob',
      'react-native-google-mobile-ads',
      'expo-ads',
      'admob-plus',
      'react-native-fbads',
      'react-native-applovin',
    ],
  },
  tracking: {
    description: 'tracking or attribution SDKs',
    patterns: [
      'react-native-tracking-transparency',
      'expo-tracking-transparency',
      'react-native-appsflyer',
      'appsflyer',
      'react-native-branch',
      'branch-sdk',
      'react-native-kochava',
      'singular-sdk',
      'react-native-mparticle',
    ],
  },
  analytics: {
    description: 'analytics SDKs',
    patterns: [
      '@segment/analytics-react-native',
      '@amplitude/analytics-react-native',
      'amplitude-react-native',
      'mixpanel-react-native',
      'posthog-react-native',
      'rudder-sdk-react-native',
      '@sentry/react-native',
      '@react-native-firebase/analytics',
      'react-native-analytics',
      'react-native-google-analytics',
    ],
  },
  'social-authentication': {
    description: 'social or third-party authentication SDKs',
    patterns: [
      'react-native-fbsdk-next',
      '@invertase/react-native-apple-authentication',
      'expo-apple-authentication',
      '@react-native-google-signin',
      'react-native-google-signin',
      'react-native-auth0',
      '@react-native-firebase/auth',
      'expo-auth-session',
    ],
  },
  'ai-data-processing': {
    description: 'AI/data-processing provider SDKs',
    patterns: [
      'openai',
      '@anthropic-ai/sdk',
      '@ai-sdk/',
      'langchain',
      '@google/genai',
      '@google/generative-ai',
      'vertexai',
      'ollama',
      '@huggingface/inference',
      'cohere-ai',
    ],
  },
};

export function matchSdkCategory(
  packageName: string,
  extra?: Record<string, string[]>,
): { category: string; description: string }[] {
  const out: { category: string; description: string }[] = [];
  const merged: Record<string, SdkCategoryEntry> = Object.create(null) as Record<
    string,
    SdkCategoryEntry
  >;
  for (const [k, v] of Object.entries(SDK_CATEGORIES)) merged[k] = v;
  if (extra) {
    for (const [cat, pkgs] of Object.entries(extra)) {
      const existing = merged[cat];
      merged[cat] = {
        description: existing?.description ?? `custom category "${cat}"`,
        patterns: [...(existing?.patterns ?? []), ...pkgs],
      };
    }
  }
  for (const [category, entry] of Object.entries(merged)) {
    const hit = entry.patterns.some((p) => {
      if (p.endsWith('/')) return packageName.startsWith(p);
      return packageName === p || packageName.startsWith(`${p}/`);
    });
    if (hit) out.push({ category, description: entry.description });
  }
  return out;
}

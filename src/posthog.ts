import posthog from 'posthog-js';

const metaEnv = (import.meta as any).env || {};
const RAW_KEY = metaEnv.VITE_POSTHOG_KEY || '';
const POSTHOG_HOST = metaEnv.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

// PostHog browser SDK strictly requires a public Project API Key (phc_...)
// Personal API keys (phx_...) must never be used in client browsers (results in 401 Unauthorized)
const isProjectKeyValid = typeof RAW_KEY === 'string' && RAW_KEY.startsWith('phc_');

let isPosthogInitialized = false;

// PII Sanitizer: strips sensitive KYC data from analytics events
function sanitizePii(data: Record<string, any> = {}): Record<string, any> {
  const sanitized: Record<string, any> = {};
  const forbiddenKeys = new Set([
    'pan', 'pannumber', 'aadhaar', 'aadhaarnumber', 'aadhaarlast4',
    'bankaccount', 'accountnumber', 'reaccountnumber', 'ifsc',
    'cibilscore', 'score', 'otp', 'cootp', 'dob', 'dateofbirth',
    'password', 'pincode', 'completeaddress', 'street', 'building'
  ]);

  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (forbiddenKeys.has(normalizedKey)) {
      sanitized[key] = '[REDACTED_PII]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const initPostHog = () => {
  if (isPosthogInitialized) return;

  if (!isProjectKeyValid) {
    console.warn(
      '[PostHog Security] Browser SDK requires a public Project API Key (starts with "phc_"). ' +
      'Network ingestion disabled to protect credentials and prevent 401 errors.'
    );
    return;
  }

  try {
    posthog.init(RAW_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false, // Disabled on KYC portal to prevent sensitive input capture
      disable_session_recording: false,
      session_recording: {
        recordCrossOriginIframes: false,
        maskAllInputs: true, // Strict KYC privacy compliance
        maskTextSelector: '*'
      }
    });
    isPosthogInitialized = true;
    console.log('[PostHog] Initialized securely with Project API Key');
  } catch (err) {
    console.warn('[PostHog] Initialization error:', err);
  }
};

export const identifyPostHogUser = (distinctId: string, properties: Record<string, any> = {}) => {
  if (!isPosthogInitialized) return;
  try {
    const safeProps = sanitizePii(properties);
    posthog.identify(distinctId, safeProps);
  } catch (err) {
    console.warn('[PostHog] Identify failed:', err);
  }
};

export const capturePostHogEvent = (eventName: string, properties: Record<string, any> = {}) => {
  if (!isPosthogInitialized) return;
  try {
    const safeProps = sanitizePii(properties);
    posthog.capture(eventName, safeProps);
  } catch (err) {
    console.warn(`[PostHog] Capture failed for ${eventName}:`, err);
  }
};

export const resetPostHogUser = () => {
  if (!isPosthogInitialized) return;
  try {
    posthog.reset();
  } catch (err) {
    console.warn('[PostHog] Reset failed:', err);
  }
};

export default posthog;

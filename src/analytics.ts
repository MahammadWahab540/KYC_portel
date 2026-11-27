import mixpanel from 'mixpanel-browser';
import { initPostHog, identifyPostHogUser, capturePostHogEvent, resetPostHogUser } from './posthog.ts';

// Default / fallback token or read from Vite env (VITE_MIXPANEL_TOKEN)
const metaEnv = (import.meta as any).env || {};
const MIXPANEL_TOKEN = metaEnv.VITE_MIXPANEL_TOKEN || 'a74653b679d469273c5cf8c39e08ea3d';

let isInitialized = false;

export const initMixpanel = () => {
  if (isInitialized) return;
  try {
    mixpanel.init(MIXPANEL_TOKEN, {
      debug: Boolean(metaEnv.DEV),
      track_pageview: true,
      persistence: 'localStorage',
      ignore_dnt: true
    });
    isInitialized = true;
    console.log('[Mixpanel] Initialized successfully');
  } catch (err) {
    console.warn('[Mixpanel] Initialization failed:', err);
  }

  // Also initialize PostHog
  initPostHog();
};

/**
 * Identify authenticated student across Mixpanel and PostHog
 * Always called on login and session resume
 */
export const identifyUser = (userId: string, traits: Record<string, any> = {}) => {
  if (!isInitialized) initMixpanel();
  try {
    mixpanel.identify(userId);
    if (Object.keys(traits).length > 0) {
      mixpanel.people.set({
        $name: traits.name,
        $phone: traits.phone,
        program: traits.program,
        course_fee: traits.courseFee,
        balance_amount: traits.balanceAmount,
        last_login_at: new Date().toISOString(),
        ...traits
      });
    }
    // Register super properties across all subsequent events in this session
    mixpanel.register({
      student_phone: traits.phone || userId,
      program_name: traits.program || 'NxtWave Academy',
      portal_version: '2.0.0'
    });
  } catch (err) {
    console.warn('[Mixpanel] Identify failed:', err);
  }

  // PostHog Identify
  identifyPostHogUser(userId, {
    name: traits.name,
    phone: traits.phone,
    program: traits.program,
    course_fee: traits.courseFee,
    balance_amount: traits.balanceAmount
  });
};

// PII Sanitizer for Mixpanel tracking
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

/**
 * Track discrete KYC funnel events across Mixpanel and PostHog
 */
export const trackEvent = (eventName: string, properties: Record<string, any> = {}) => {
  if (!isInitialized) initMixpanel();
  const safeProperties = sanitizePii(properties);
  try {
    mixpanel.track(eventName, {
      timestamp: new Date().toISOString(),
      ...safeProperties
    });
    if (metaEnv.DEV) {
      console.log(`[Mixpanel Event] ${eventName}`, safeProperties);
    }
  } catch (err) {
    console.warn(`[Mixpanel] Track failed for ${eventName}:`, err);
  }

  // PostHog Event Capture
  capturePostHogEvent(eventName, safeProperties);
};

/**
 * Reset identity on logout across Mixpanel and PostHog
 */
export const resetUser = () => {
  if (!isInitialized) return;
  try {
    mixpanel.reset();
  } catch (err) {
    console.warn('[Mixpanel] Reset failed:', err);
  }
  resetPostHogUser();
};

export default mixpanel;



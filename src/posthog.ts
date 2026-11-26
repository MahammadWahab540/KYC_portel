import posthog from 'posthog-js';

const metaEnv = (import.meta as any).env || {};
const POSTHOG_KEY = metaEnv.VITE_POSTHOG_KEY || 'phc_nxtwave_kyc_default_token';
const POSTHOG_HOST = metaEnv.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let isPosthogInitialized = false;

export const initPostHog = () => {
  if (isPosthogInitialized) return;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        recordCrossOriginIframes: true,
        maskAllInputs: false,
        maskInputOptions: {
          password: true
        }
      }
    });
    isPosthogInitialized = true;
    console.log('[PostHog] Initialized successfully');
  } catch (err) {
    console.warn('[PostHog] Initialization failed:', err);
  }
};

export const identifyPostHogUser = (distinctId: string, properties: Record<string, any> = {}) => {
  if (!isPosthogInitialized) initPostHog();
  try {
    posthog.identify(distinctId, properties);
  } catch (err) {
    console.warn('[PostHog] Identify failed:', err);
  }
};

export const capturePostHogEvent = (eventName: string, properties: Record<string, any> = {}) => {
  if (!isPosthogInitialized) initPostHog();
  try {
    posthog.capture(eventName, properties);
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

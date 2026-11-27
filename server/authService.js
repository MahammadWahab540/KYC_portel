/**
 * Production Authentication Service
 * 
 * - Cryptographic OTP generation (crypto.randomInt)
 * - SHA-256 hashed OTP storage (never stored in plain text)
 * - 5-minute TTL expiration
 * - Max 5 verification attempts per OTP
 * - 30-second resend cooldown
 * - Rate limit: 3 OTP requests per phone per 15-minute window
 * - JWT session tokens on successful verification
 * - New vs existing user detection via Neon DB
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { query } from './db.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'nxtwave_kyc_fallback_secret';
const JWT_EXPIRES_IN = '24h';

// Optional QA test whitelist from env (e.g. "919100886544:000000")
const WHITELIST_OTPS = new Map(
  (process.env.TEST_WHITELIST_NUMBERS || '')
    .split(',')
    .map(pair => pair.trim().split(':'))
    .filter(([p, o]) => p && o)
);

// In-memory OTP store: keyed by phone number
// { otpHash, expiresAt, attempts, createdAt }
const otpStore = new Map();

// Rate limit store: keyed by phone number
// { timestamps: [Date, Date, ...] } — sliding 15-min window
const rateLimitStore = new Map();

// ── Helpers ──────────────────────────────────────────────────

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function generateSecureOtp() {
  // crypto.randomInt is CSPRNG-backed and uniform
  return crypto.randomInt(100000, 999999);
}

function maskPhone(phone) {
  if (!phone || phone.length < 4) return '****';
  return phone.slice(0, 2) + '****' + phone.slice(-2);
}

// ── Rate Limiting ────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 3;

function checkRateLimit(phone) {
  const now = Date.now();
  const entry = rateLimitStore.get(phone);

  if (!entry) return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };

  // Prune timestamps outside the window
  entry.timestamps = entry.timestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  
  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = Math.min(...entry.timestamps);
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldestInWindow);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
    };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.timestamps.length - 1 };
}

function recordRateLimitHit(phone) {
  const now = Date.now();
  if (!rateLimitStore.has(phone)) {
    rateLimitStore.set(phone, { timestamps: [now] });
  } else {
    rateLimitStore.get(phone).timestamps.push(now);
  }
}

// ── Cooldown ─────────────────────────────────────────────────

const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds

function checkResendCooldown(phone) {
  const entry = otpStore.get(phone);
  if (!entry) return { allowed: true };

  const elapsed = Date.now() - entry.createdAt;
  if (elapsed < RESEND_COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)
    };
  }

  return { allowed: true };
}

// ── Core Auth Methods ────────────────────────────────────────

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;

export class AuthService {

  /**
   * Check if QA OTP bypass is active.
   * When QA_OTP_BYPASS_ENABLED=true, allows direct login for ALL accounts during testing.
   */
  isQaBypassAllowed(phone) {
    // When QA_OTP_BYPASS_ENABLED=true, bypass OTP for all accounts during testing
    if (process.env.QA_OTP_BYPASS_ENABLED !== 'true') return false;
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    return cleanPhone.length === 10;
  }

  /**
   * Directly issue a verified JWT session for authorized QA testing without OTP.
   * Records audit trail with QA_OTP_BYPASSED action.
   */
  async createBypassedQaSession(phone) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const userType = await this._detectUserType(cleanPhone);
    const token = this._generateToken(cleanPhone, userType);

    await this._auditLog(cleanPhone, 'QA_OTP_BYPASSED', {
      userType,
      environment: process.env.NODE_ENV || 'qa',
      timestamp: new Date().toISOString()
    }).catch(() => {});

    return {
      success: true,
      bypassed: true,
      token,
      userType,
      phoneMasked: maskPhone(cleanPhone)
    };
  }

  /**
   * Request OTP for a phone number.
   * Returns { otp } (plain) for the caller to dispatch via Gallabox,
   * but stores only the hash. OTP must NEVER be returned in HTTP responses.
   */
  requestOtp(phone) {
    const whitelistedOtp = WHITELIST_OTPS.get(phone);

    // 1. Rate limit check (bypassed for whitelisted QA numbers)
    if (!whitelistedOtp) {
      const rateCheck = checkRateLimit(phone);
      if (!rateCheck.allowed) {
        return {
          success: false,
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many OTP requests. Try again in ${rateCheck.retryAfterSeconds} seconds.`,
          retryAfterSeconds: rateCheck.retryAfterSeconds
        };
      }

      // 2. Resend cooldown check
      const cooldownCheck = checkResendCooldown(phone);
      if (!cooldownCheck.allowed) {
        return {
          success: false,
          code: 'COOLDOWN_ACTIVE',
          message: `Please wait ${cooldownCheck.retryAfterSeconds} seconds before requesting a new OTP.`,
          retryAfterSeconds: cooldownCheck.retryAfterSeconds
        };
      }
    }

    // 3. Generate OTP (use whitelisted test OTP when configured)
    const otp = whitelistedOtp || generateSecureOtp();
    const otpHash = hashOtp(otp);
    const now = Date.now();

    // 4. Store hashed OTP
    otpStore.set(phone, {
      otpHash,
      expiresAt: now + OTP_TTL_MS,
      attempts: 0,
      createdAt: now
    });

    // 5. Record rate limit hit
    if (!whitelistedOtp) {
      recordRateLimitHit(phone);
    }

    // 6. Audit log (async, non-blocking, no raw OTP)
    this._auditLog(phone, 'OTP_REQUESTED', { channel: 'WHATSAPP' }).catch(() => {});

    return {
      success: true,
      otp, // Caller uses this to dispatch via Gallabox — NEVER send in HTTP response
      expiresIn: Math.round(OTP_TTL_MS / 1000),
      phoneMasked: maskPhone(phone)
    };
  }

  /**
   * Roll back stored OTP if WhatsApp delivery fails so user isn't locked in cooldown.
   */
  invalidateOtp(phone) {
    otpStore.delete(phone);
  }

  /**
   * Verify OTP for a phone number.
   * Returns JWT token and user type on success.
   */
  async verifyOtp(phone, otpInput) {
    const whitelistedOtp = WHITELIST_OTPS.get(phone);
    if ((whitelistedOtp && String(otpInput) === whitelistedOtp) || (process.env.QA_OTP_BYPASS_ENABLED === 'true')) {
      otpStore.delete(phone);
      const userType = await this._detectUserType(phone);
      const token = this._generateToken(phone, userType);
      this._auditLog(phone, 'OTP_VERIFIED_QA_BYPASS', { userType }).catch(() => {});
      return {
        success: true,
        token,
        userType,
        phoneMasked: maskPhone(phone)
      };
    }

    const entry = otpStore.get(phone);

    // 1. No OTP requested for this phone
    if (!entry) {
      return {
        success: false,
        code: 'NO_OTP_FOUND',
        message: 'No OTP was requested for this number. Please request a new one.'
      };
    }

    // 2. Max attempts exceeded
    if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
      otpStore.delete(phone); // Invalidate
      return {
        success: false,
        code: 'MAX_ATTEMPTS_EXCEEDED',
        message: 'Maximum verification attempts reached. Please request a new OTP.'
      };
    }

    // 3. OTP expired
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(phone);
      return {
        success: false,
        code: 'OTP_EXPIRED',
        message: 'OTP has expired. Please request a new one.'
      };
    }

    // 4. Increment attempt count
    entry.attempts += 1;

    // 5. Verify hash
    const inputHash = hashOtp(otpInput);
    if (inputHash !== entry.otpHash) {
      const remaining = MAX_VERIFY_ATTEMPTS - entry.attempts;
      return {
        success: false,
        code: 'INVALID_OTP',
        message: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
        attemptsRemaining: remaining
      };
    }

    // 6. OTP verified — invalidate it immediately (single use)
    otpStore.delete(phone);

    // 7. Determine user type (new vs existing)
    const userType = await this._detectUserType(phone);

    // 8. Generate JWT
    const token = this._generateToken(phone, userType);

    // 9. Audit log
    this._auditLog(phone, 'OTP_VERIFIED', { userType }).catch(() => {});

    return {
      success: true,
      token,
      userType, // 'new' or 'existing'
      phoneMasked: maskPhone(phone)
    };
  }

  /**
   * Check if a user exists in Neon DB.
   * Falls back to 'new' if DB is unreachable.
   */
  async _detectUserType(phone) {
    try {
      const result = await query(
        'SELECT id, student_uid, full_name FROM students WHERE phone = $1 LIMIT 1',
        [phone]
      );
      if (result.rows.length > 0) {
        return 'existing';
      }
      return 'new';
    } catch (err) {
      // DB unavailable — treat as new user (safe default)
      console.warn('[AuthService] DB lookup failed, defaulting to new user:', err.message);
      return 'new';
    }
  }

  /**
   * Generate a signed JWT token.
   */
  _generateToken(phone, userType) {
    return jwt.sign(
      {
        phone,
        userType,
        iat: Math.floor(Date.now() / 1000)
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
    );
  }

  /**
   * Verify and decode a JWT token (for protected endpoints).
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return null;
    }
  }

  /**
   * Write audit log to Neon (non-blocking).
   */
  async _auditLog(phone, action, metadata = {}) {
    try {
      await query(
        `INSERT INTO audit_logs (entity_name, entity_id, action, performed_by, ip_address, changes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['AUTH', maskPhone(phone), action, 'SYSTEM_AUTH', '0.0.0.0', JSON.stringify(metadata)]
      );
    } catch (err) {
      // Non-critical — log and move on
      console.warn('[AuthService] Audit log write failed:', err.message);
    }
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../server/authService.js';

const auth = new AuthService();

test('AuthService generates 6-digit OTP, enforces cooldown & rate limit, verifies and issues JWT', async () => {
  const phone = '919999000001';

  // 1. Request OTP
  const req1 = auth.requestOtp(phone);
  assert.equal(req1.success, true);
  assert.match(String(req1.otp), /^\d{6}$/);
  assert.equal(req1.expiresIn, 300);

  // 2. Resend cooldown (30s)
  const reqCooldown = auth.requestOtp(phone);
  assert.equal(reqCooldown.success, false);
  assert.equal(reqCooldown.code, 'COOLDOWN_ACTIVE');

  // 3. Invalid OTP decrements remaining attempts
  const badVerify = await auth.verifyOtp(phone, '000000');
  assert.equal(badVerify.success, false);
  assert.equal(badVerify.code, 'INVALID_OTP');
  assert.equal(badVerify.attemptsRemaining, 4);

  // 4. Correct OTP succeeds and returns valid JWT
  const goodVerify = await auth.verifyOtp(phone, String(req1.otp));
  assert.equal(goodVerify.success, true);
  assert.ok(goodVerify.token);
  const decoded = auth.verifyToken(goodVerify.token);
  assert.equal(decoded.phone, phone);

  // 5. Replay of same OTP fails (single-use)
  const replay = await auth.verifyOtp(phone, String(req1.otp));
  assert.equal(replay.success, false);
  assert.equal(replay.code, 'NO_OTP_FOUND');
});

test('AuthService enforces max 5 verification attempts', async () => {
  const phone = '919999000002';
  const req = auth.requestOtp(phone);
  assert.equal(req.success, true);

  for (let i = 0; i < 5; i++) {
    const res = await auth.verifyOtp(phone, '111111');
    assert.equal(res.success, false);
  }

  const locked = await auth.verifyOtp(phone, String(req.otp));
  assert.equal(locked.success, false);
  assert.equal(locked.code, 'MAX_ATTEMPTS_EXCEEDED');
});

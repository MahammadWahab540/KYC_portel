import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const BASE = 'http://localhost:5000';
const SECRET = process.env.JWT_SECRET || 'nxtwave_kyc_fallback_secret';

test('E2E: Unauthenticated access to protected journey & documents is rejected (401)', async () => {
  const r1 = await fetch(`${BASE}/api/v1/applications/current`);
  assert.equal(r1.status, 401);

  const r2 = await fetch(`${BASE}/api/v1/documents`);
  assert.equal(r2.status, 401);
});

test('E2E: Journey persistence, resume across logins, real document upload, password PDF check & isolation', async () => {
  // 1. Authenticate as 9100886544 using whitelisted QA OTP 000000
  const authRes = await fetch(`${BASE}/api/v1/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode: '+91', phone: '9100886544', otp: '000000' })
  });
  assert.equal(authRes.status, 200);
  const authData = await authRes.json();
  assert.ok(authData.token);
  assert.ok(authData.application?.id);

  const token = authData.token;
  const appId = authData.application.id;

  // 2. Transition stage and persist form updates to Neon
  const trRes = await fetch(`${BASE}/api/v1/applications/transition`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      targetStage: 'panUpload',
      appStateUpdates: { method: 'emi', emi: '24', relation: 'Father', coPhone: '9876500001' }
    })
  });
  assert.equal(trRes.status, 200);
  const trData = await trRes.json();
  assert.equal(trData.application.current_stage, 'panUpload');

  // 3. Upload a real document (> 1KB PNG buffer)
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(600, 350);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 600, 350);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('INCOME TAX DEPARTMENT GOVT OF INDIA', 30, 50);
  ctx.font = '18px sans-serif';
  ctx.fillText('Permanent Account Number Card', 30, 90);
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('BZCPK8921L', 30, 150);
  ctx.font = '18px sans-serif';
  ctx.fillText('Name: ANITA DESHMUKH', 30, 200);
  ctx.fillText('DOB: 22/08/1995', 30, 240);
  const fakePngBuffer = canvas.toBuffer('image/png');
  const upRes = await fetch(`${BASE}/api/v1/documents/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      applicationId: appId,
      documentType: 'PAN',
      fileName: 'father_pan.png',
      mimeType: 'image/png',
      fileBase64: fakePngBuffer.toString('base64')
    })
  });
  assert.equal(upRes.status, 200);
  const upData = await upRes.json();
  assert.equal(upData.success, true);
  assert.ok(upData.document.id);
  const docId = upData.document.id;

  // 4. Password-protected PDF without password returns 422 PASSWORD_REQUIRED
  const encryptedPdf = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n'),
    Buffer.alloc(2000, 'A')
  ]);
  const pwdRes = await fetch(`${BASE}/api/v1/documents/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      applicationId: appId,
      documentType: 'CIBIL_REPORT',
      fileName: 'cibil.pdf',
      mimeType: 'application/pdf',
      fileBase64: encryptedPdf.toString('base64')
    })
  });
  assert.equal(pwdRes.status, 422);
  const pwdData = await pwdRes.json();
  assert.equal(pwdData.code, 'PASSWORD_REQUIRED');

  // 5. Cross-user isolation: a different user cannot delete or download this document
  const otherToken = jwt.sign({ phone: '9999999999', userType: 'new' }, SECRET, { expiresIn: '1h' });
  const crossDel = await fetch(`${BASE}/api/v1/documents/${docId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${otherToken}` }
  });
  assert.equal(crossDel.status, 404);

  const crossFile = await fetch(`${BASE}/api/v1/documents/${docId}/file`, {
    headers: { Authorization: `Bearer ${otherToken}` }
  });
  assert.equal(crossFile.status, 404);

  // 6. Simulate re-login from another browser/device -> resumes at panUpload with saved state & docs
  const resumeRes = await fetch(`${BASE}/api/v1/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ countryCode: '+91', phone: '9100886544', otp: '000000' })
  });
  assert.equal(resumeRes.status, 200);
  const resumeData = await resumeRes.json();
  assert.equal(resumeData.isResumed, true);
  assert.equal(resumeData.application.current_stage, 'panUpload');
  assert.equal(resumeData.application.statePayload.emi, '24');
  assert.ok(resumeData.documents.some(d => d.id === docId));

  // 7. Owner can preview and delete their document
  const ownerFile = await fetch(`${BASE}/api/v1/documents/${docId}/file`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(ownerFile.status, 200);

  const delRes = await fetch(`${BASE}/api/v1/documents/${docId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(delRes.status, 200);
});

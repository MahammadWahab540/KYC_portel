import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentService } from '../server/documentService.js';
import { query, pool } from '../server/db.js';

test.after(async () => {
  await pool.end();
});

test('Document Upload Service: rejects invalid document with HTTP 422 and mandated message', async () => {
  const docService = new DocumentService();

  // Test setup: create test application context if not present
  const testPhone = '9999999999';
  const appRes = await query('SELECT id FROM applications WHERE student_phone = $1 LIMIT 1', [testPhone]);
  let testAppId = appRes.rows[0]?.id;
  if (!testAppId) {
    const newApp = await query(
      `INSERT INTO applications (student_phone, application_number, current_stage, current_state)
       VALUES ($1, 'APP-TEST-VALIDATION', 'panUpload', 'IN_PROGRESS')
       RETURNING id`,
      [testPhone]
    );
    testAppId = newApp.rows[0].id;
  }

  // 1. Upload electricity bill to PAN slot -> MUST FAIL with 422 and exact PAN error message
  const electricityBillText = `
    ELECTRICITY CONSUMER BILL - NORTHERN DISCOM
    Consumer: Rajesh Kumar
    Bill Amount: Rs 1,840
    Due Date: 20/12/2026
    Meter Reading: 12495 kWh Units Consumed: 340
    Subdivision Office: Hyderabad Central Circle
  `.padEnd(1200, ' ');

  const panFailResult = await docService.uploadDocument({
    phone: testPhone,
    applicationId: testAppId,
    documentType: 'PAN',
    fileName: 'bill.pdf',
    mimeType: 'application/pdf',
    fileBase64: Buffer.from(electricityBillText).toString('base64')
  });

  assert.equal(panFailResult.success, false);
  assert.equal(panFailResult.status, 422);
  assert.equal(panFailResult.error, 'Invalid document. Please upload a valid PAN card.');

  // 2. Upload PAN to Aadhaar Front slot -> MUST FAIL with 422 and exact Aadhaar Front error
  const panText = `
    INCOME TAX DEPARTMENT GOVT OF INDIA
    Permanent Account Number
    BZCPK8921L
    Name: ANITA DESHMUKH
    Father's Name: DINESH DESHMUKH
    Date of Birth: 22/08/1995
  `.padEnd(1200, ' ');

  const aadhaarFrontFail = await docService.uploadDocument({
    phone: testPhone,
    applicationId: testAppId,
    documentType: 'AADHAAR_FRONT',
    fileName: 'pan.pdf',
    mimeType: 'application/pdf',
    fileBase64: Buffer.from(panText).toString('base64')
  });

  assert.equal(aadhaarFrontFail.success, false);
  assert.equal(aadhaarFrontFail.status, 422);
  assert.equal(aadhaarFrontFail.error, 'Invalid document. Please upload the front side of your Aadhaar card.');

  // 3. Upload random document to CIBIL slot -> MUST FAIL with 422 and exact CIBIL error
  const randomDocText = 'some random document with no credit bureau or score information at all'.padEnd(1200, ' ');
  const cibilFail = await docService.uploadDocument({
    phone: testPhone,
    applicationId: testAppId,
    documentType: 'CIBIL',
    fileName: 'unknown.pdf',
    mimeType: 'application/pdf',
    fileBase64: Buffer.from(randomDocText).toString('base64')
  });

  assert.equal(cibilFail.success, false);
  assert.equal(cibilFail.status, 422);
  assert.equal(cibilFail.error, 'Invalid document. Please upload a valid CIBIL report.');

  // 4. Upload valid PAN -> MUST SUCCEED with 200
  const validPanResult = await docService.uploadDocument({
    phone: testPhone,
    applicationId: testAppId,
    documentType: 'PAN',
    fileName: 'pan.pdf',
    mimeType: 'application/pdf',
    fileBase64: Buffer.from(panText).toString('base64')
  });

  assert.equal(validPanResult.success, true);
  assert.equal(validPanResult.document.document_type, 'PAN');
  assert.equal(validPanResult.ocr.extractedFields.panNumber, 'BZCPK8921L');
});

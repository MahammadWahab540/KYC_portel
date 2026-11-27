import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDocument, validateExpectedDocument, EXPECTED_DOC_ERRORS } from '../server/documentDetector.js';

test('Document Detection: correctly identifies PAN Card', () => {
  const panText = `
    INCOME TAX DEPARTMENT GOVT OF INDIA
    Permanent Account Number
    BZCPK8921L
    Name: ANITA DESHMUKH
    Father's Name: DINESH DESHMUKH
    Date of Birth: 22/08/1995
  `;
  const detection = classifyDocument(panText);
  assert.equal(detection.detectedType, 'PAN');
  assert.ok(detection.confidence >= 80);

  const validation = validateExpectedDocument('PAN', panText);
  assert.equal(validation.isValid, true);
  assert.equal(validation.error, null);
});

test('Document Detection: correctly identifies Aadhaar Front', () => {
  const aadhaarFrontText = `
    GOVERNMENT OF INDIA
    Unique Identification Authority of India
    Mera Aadhaar, Meri Pehchan
    Suresh Kumar Varma
    DOB: 14/05/1974
    Gender: Male
    9812 4310 4589
  `;
  const detection = classifyDocument(aadhaarFrontText);
  assert.equal(detection.detectedType, 'AADHAAR_FRONT');

  const validation = validateExpectedDocument('AADHAAR_FRONT', aadhaarFrontText);
  assert.equal(validation.isValid, true);
  assert.equal(validation.error, null);
});

test('Document Detection: correctly identifies Aadhaar Back', () => {
  const aadhaarBackText = `
    Unique Identification Authority of India
    Address:
    S/O Venkateswarlu Varma, Flat 402 Sai Residency,
    Road No 3 Madhapur,
    Hyderabad, Telangana - 500081
    Help: 1947 help@uidai.gov.in
  `;
  const detection = classifyDocument(aadhaarBackText);
  assert.equal(detection.detectedType, 'AADHAAR_BACK');

  const validation = validateExpectedDocument('AADHAAR_BACK', aadhaarBackText);
  assert.equal(validation.isValid, true);
  assert.equal(validation.error, null);
});

test('Document Detection: correctly identifies CIBIL / Credit Report', () => {
  const cibilText = `
    TRANSUNION CIBIL CREDIT REPORT
    CONSUMER NAME: VIKRAM SHARMA
    CONTROL NUMBER: 9028384912
    CIBIL SCORE: 745
    DATE OF REPORT: 24/11/2026
  `;
  const detection = classifyDocument(cibilText);
  assert.equal(detection.detectedType, 'CIBIL');

  const validation = validateExpectedDocument('CIBIL', cibilText);
  assert.equal(validation.isValid, true);
  assert.equal(validation.error, null);
});

test('Document Validation: rejects wrong document with exact user-mandated error message', () => {
  const electricityBillText = `
    TELANGANA STATE SOUTHERN POWER DISTRIBUTION COMPANY
    ELECTRICITY CONSUMER BILL
    Consumer No: 09823412
    Amount Due: Rs 2,450
    Due Date: 15/12/2026
  `;

  // PAN slot rejection
  const panVal = validateExpectedDocument('PAN', electricityBillText);
  assert.equal(panVal.isValid, false);
  assert.equal(panVal.error, 'Invalid document. Please upload a valid PAN card.');

  // Aadhaar Front slot rejection
  const aadhFrontVal = validateExpectedDocument('AADHAAR_FRONT', electricityBillText);
  assert.equal(aadhFrontVal.isValid, false);
  assert.equal(aadhFrontVal.error, 'Invalid document. Please upload the front side of your Aadhaar card.');

  // Aadhaar Back slot rejection (when uploading front side or random bill)
  const aadhBackVal = validateExpectedDocument('AADHAAR_BACK', electricityBillText);
  assert.equal(aadhBackVal.isValid, false);
  assert.equal(aadhBackVal.error, 'Invalid document. Please upload the back side of your Aadhaar card.');

  // CIBIL slot rejection
  const cibilVal = validateExpectedDocument('CIBIL', electricityBillText);
  assert.equal(cibilVal.isValid, false);
  assert.equal(cibilVal.error, 'Invalid document. Please upload a valid CIBIL report.');
});

test('Document Validation: cross-mismatches are strictly rejected with mandated messages', () => {
  const panText = `
    INCOME TAX DEPARTMENT GOVT OF INDIA
    Permanent Account Number: BZCPK8921L
    Name: ANITA DESHMUKH
    Date of Birth: 22/08/1995
  `;
  const aadhaarFrontText = `
    GOVERNMENT OF INDIA
    Unique Identification Authority of India
    Suresh Kumar Varma
    DOB: 14/05/1974
    Gender: Male
    9812 4310 4589
  `;
  const aadhaarBackText = `
    Address: S/O Venkateswarlu, Road 3, Hyderabad, Telangana - 500081
  `;

  // Uploading PAN when Aadhaar Front is expected
  const r1 = validateExpectedDocument('AADHAAR_FRONT', panText);
  assert.equal(r1.isValid, false);
  assert.equal(r1.error, 'Invalid document. Please upload the front side of your Aadhaar card.');

  // Uploading Aadhaar Front when Aadhaar Back is expected
  const r2 = validateExpectedDocument('AADHAAR_BACK', aadhaarFrontText);
  assert.equal(r2.isValid, false);
  assert.equal(r2.error, 'Invalid document. Please upload the back side of your Aadhaar card.');

  // Uploading Aadhaar Back when Aadhaar Front is expected
  const r3 = validateExpectedDocument('AADHAAR_FRONT', aadhaarBackText);
  assert.equal(r3.isValid, false);
  assert.equal(r3.error, 'Invalid document. Please upload the front side of your Aadhaar card.');

  // Uploading Aadhaar when PAN is expected
  const r4 = validateExpectedDocument('PAN', aadhaarFrontText);
  assert.equal(r4.isValid, false);
  assert.equal(r4.error, 'Invalid document. Please upload a valid PAN card.');
});

test('Document Detection: e-Aadhaar full letter sheet satisfies Aadhaar Front and Back', () => {
  const eAadhaarText = `
    Government of India
    Unique Identification Authority of India
    Enrolment No: 0000/00730/31588
    To: Aanitha K
    Address: Eraiyur, Perambalur, Tamil Nadu - 621212
    Your Aadhaar No: 2795 0437 1520
    INFORMATION
    Aadhaar is a proof of identity, not of citizenship.
    This is electronically generated letter.
    DOB: 05/09/2001 Gender: Female
    2795 0437 1520
  `;
  const detection = classifyDocument(eAadhaarText);
  assert.equal(detection.detectedType, 'AADHAAR_COMBINED');

  // e-Aadhaar full letter satisfies Aadhaar Front slot
  const valFront = validateExpectedDocument('AADHAAR_FRONT', eAadhaarText);
  assert.equal(valFront.isValid, true);
  assert.equal(valFront.error, null);

  // e-Aadhaar full letter satisfies Aadhaar Back slot
  const valBack = validateExpectedDocument('AADHAAR_BACK', eAadhaarText);
  assert.equal(valBack.isValid, true);
  assert.equal(valBack.error, null);
});

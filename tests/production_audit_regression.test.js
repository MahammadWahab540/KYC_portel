import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentIntelligenceService } from '../server/ocrService.js';
import { GallaboxService } from '../server/gallaboxService.js';
import { INITIAL_APPLICATION_STATE } from '../src/types.ts';

test('REGRESSION TEST: CIBIL Report extraction extracts actual score from text without mock fallback', async () => {
  const ocr = new DocumentIntelligenceService();

  // Test 1: Real TransUnion CIBIL report text with score 745
  const sampleCibilText = `
    TRANSUNION CIBIL CREDIT REPORT
    CONSUMER NAME: VIKRAM SHARMA
    DATE OF REPORT: 24/11/2026
    CONTROL NUMBER: 9028384912
    CIBIL SCORE: 745
    SUMMARY OF ACCOUNTS: 4 ACCOUNTS ACTIVE
  `;
  const res1 = ocr.parseCibilReport(sampleCibilText);
  assert.equal(res1.success, true);
  assert.equal(res1.cibilScore, '745');
  assert.equal(res1.numericScore, 745);
  assert.equal(res1.isEligible, true);

  // Test 2: Experian Credit Score
  const experianText = `
    EXPERIAN CREDIT REPORT
    NAME: ROHIT VERMA
    EXPERIAN CREDIT SCORE: 680
    REPORT DATE: 12/11/2026
  `;
  const resExp = ocr.parseCibilReport(experianText);
  assert.equal(resExp.success, true);
  assert.equal(resExp.bureau, 'EXPERIAN');
  assert.equal(resExp.cibilScore, '680');
  assert.equal(resExp.numericScore, 680);

  // Test 3: CIBIL report with NH (No History)
  const nhCibilText = `
    TRANSUNION CIBIL REPORT
    CONSUMER NAME: PRIYA REDDY
    DATE OF REPORT: 10/11/2026
    CIBIL SCORE: NH
    NO CREDIT HISTORY FOUND
  `;
  const resNh = ocr.parseCibilReport(nhCibilText);
  assert.equal(resNh.success, true);
  assert.equal(resNh.isNoHistory, true);
  assert.equal(resNh.cibilScore, 'NH');
  assert.equal(resNh.numericScore, null);

  // Test 4: Unrelated non-CIBIL document must fail and NOT return 782
  const unrelatedText = `
    ELECTRICITY BILL
    Consumer: Rajesh Gupta
    Amount Due: Rs 1,450
    Due Date: 15/12/2026
  `;
  const resFail = ocr.parseCibilReport(unrelatedText);
  assert.equal(resFail.success, false);
  assert.notEqual(resFail.cibilScore, '782');
});

test('REGRESSION TEST: PAN Card extraction does not fall back to mock SURESH KUMAR VARMA', () => {
  const ocr = new DocumentIntelligenceService();

  // Real PAN text with different applicant
  const panText = `
    INCOME TAX DEPARTMENT GOVT OF INDIA
    Permanent Account Number: BZCPK8921L
    Name: ANITA DESHMUKH
    Father's Name: DINESH DESHMUKH
    Date of Birth: 22/08/1995
  `;
  const res = ocr.parsePanDocument(panText);
  assert.equal(res.success, true);
  assert.equal(res.extractedFields.panNumber, 'BZCPK8921L');
  assert.equal(res.extractedFields.fullName, 'ANITA DESHMUKH');
  assert.notEqual(res.extractedFields.fullName, 'SURESH KUMAR VARMA');
  assert.notEqual(res.extractedFields.panNumber, 'ABCDE1234F');

  // Blank/garbled text must fail and NOT return mock PAN
  const badText = 'some blurred unreadable text 1234';
  const badRes = ocr.parsePanDocument(badText);
  assert.equal(badRes.success, false);
});

test('REGRESSION TEST: Bank Statement extracts real account & IFSC without mock defaults', () => {
  const ocr = new DocumentIntelligenceService();

  const bankText = `
    HDFC BANK STATEMENT
    Account Holder Name: KAVITA PATEL
    Account Number: 50100293847561
    IFSC: HDFC0001234
    Statement Period: 01/10/2026 to 31/10/2026
    Branch: KORAMANGALA, BANGALORE
  `;
  const res = ocr.parseBankProof(bankText);
  assert.equal(res.success, true);
  assert.equal(res.extractedFields.accountNumber, '50100293847561');
  assert.equal(res.extractedFields.ifsc, 'HDFC0001234');
  assert.notEqual(res.extractedFields.accountNumber, '381920491823');
  assert.notEqual(res.extractedFields.ifsc, 'SBIN0012345');

  // Garbled text with no account or IFSC must fail
  const badBank = 'random receipt with no bank information';
  const badRes = ocr.parseBankProof(badBank);
  assert.equal(badRes.success, false);
});

test('REGRESSION TEST: Initial application state has zero mock values in production', () => {
  assert.equal(INITIAL_APPLICATION_STATE.pan, '');
  assert.equal(INITIAL_APPLICATION_STATE.panName, '');
  assert.equal(INITIAL_APPLICATION_STATE.demoScore, '');
  assert.equal(INITIAL_APPLICATION_STATE.dob, '');
  assert.equal(INITIAL_APPLICATION_STATE.aadhaarName, '');
  assert.equal(INITIAL_APPLICATION_STATE.aadhaarLast4, '');
  assert.equal(INITIAL_APPLICATION_STATE.bankName, '');
  assert.equal(INITIAL_APPLICATION_STATE.holderName, '');
  assert.equal(INITIAL_APPLICATION_STATE.accountNumber, '');
  assert.equal(INITIAL_APPLICATION_STATE.ifsc, '');
  assert.equal(INITIAL_APPLICATION_STATE.coOtp, '');
});

test('REGRESSION TEST: Gallabox Service targets correct messages/whatsapp endpoint', () => {
  const gallabox = new GallaboxService();
  assert.ok(!gallabox.baseUrl.includes('/accounts/'));
  assert.ok(process.env.GALLABOX_API_URL.includes('/messages/whatsapp'));
});

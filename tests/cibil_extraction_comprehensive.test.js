import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentIntelligenceService } from '../server/ocrService.js';
import { validateExpectedDocument } from '../server/documentDetector.js';

test('CIBIL Comprehensive: TransUnion CIBIL score parsed accurately', () => {
  const ocr = new DocumentIntelligenceService();
  const text = `
    TRANSUNION CIBIL CREDIT REPORT
    NAME: RAHUL MENON
    CONTROL NUMBER: 8901234567
    CIBIL SCORE: 765
    REPORT DATE: 15/10/2026
  `;
  const val = validateExpectedDocument('CIBIL', text);
  assert.equal(val.isValid, true);

  const res = ocr.parseCibilReport(text);
  assert.equal(res.success, true);
  assert.equal(res.cibilScore, '765');
  assert.equal(res.numericScore, 765);
  assert.equal(res.isEligible, true);
  assert.equal(res.isNoHistory, false);
});

test('CIBIL Comprehensive: Experian and Equifax scores extracted', () => {
  const ocr = new DocumentIntelligenceService();
  
  const experianText = `
    EXPERIAN INDIA CREDIT REPORT
    CONSUMER: SNEHA KULKARNI
    EXPERIAN SCORE: 710
    DATE: 20/09/2026
  `;
  const resExp = ocr.parseCibilReport(experianText);
  assert.equal(resExp.success, true);
  assert.equal(resExp.cibilScore, '710');
  assert.equal(resExp.numericScore, 710);
  assert.equal(resExp.isEligible, true);

  const equifaxText = `
    EQUIFAX CREDIT INFORMATION REPORT
    CONSUMER: ARJUN NAIR
    EQUIFAX SCORE: 630
    DATE: 01/11/2026
  `;
  const resEq = ocr.parseCibilReport(equifaxText);
  assert.equal(resEq.success, true);
  assert.equal(resEq.cibilScore, '630');
  assert.equal(resEq.numericScore, 630);
  assert.equal(resEq.isEligible, false); // < 650
});

test('CIBIL Comprehensive: CRIF High Mark score extracted', () => {
  const ocr = new DocumentIntelligenceService();
  const crifText = `
    CRIF HIGH MARK CREDIT REPORT
    NAME: MANOJ TIWARI
    CRIF SCORE: 785
    DATE: 05/11/2026
  `;
  const resCrif = ocr.parseCibilReport(crifText);
  assert.equal(resCrif.success, true);
  assert.equal(resCrif.cibilScore, '785');
  assert.equal(resCrif.numericScore, 785);
});

test('CIBIL Comprehensive: Handles NH and NA without assuming score', () => {
  const ocr = new DocumentIntelligenceService();
  const nhText = `
    TRANSUNION CIBIL REPORT
    CONSUMER: SUNITA DEVI
    CIBIL SCORE: NH
    NO CREDIT HISTORY FOUND
  `;
  const val = validateExpectedDocument('CIBIL', nhText);
  assert.equal(val.isValid, true);

  const res = ocr.parseCibilReport(nhText);
  assert.equal(res.success, true);
  assert.equal(res.isNoHistory, true);
  assert.equal(res.cibilScore, 'NH');
  assert.equal(res.numericScore, null);
  assert.equal(res.isEligible, false);
});

test('CIBIL Comprehensive: Non-CIBIL document rejected with mandated error message', () => {
  const salarySlipText = `
    SALARY STATEMENT / PAYSLIP
    Company: Tech Corp India Pvt Ltd
    Employee: Sandeep Roy
    Net Salary: Rs 65,000
    Month: October 2026
  `;
  const val = validateExpectedDocument('CIBIL', salarySlipText);
  assert.equal(val.isValid, false);
  assert.equal(val.error, 'Invalid document. Please upload a valid CIBIL report.');

  const ocr = new DocumentIntelligenceService();
  const res = ocr.parseCibilReport(salarySlipText);
  assert.equal(res.success, false);
  assert.notEqual(res.cibilScore, '782');
});

test('CIBIL Comprehensive: Mobile screenshots (Google Pay, PhonePe, OneScore) are accepted and score extracted', () => {
  const ocr = new DocumentIntelligenceService();

  // Google Pay CIBIL screenshot
  const gpayText = `
    Check your CIBIL score for free
    Your CIBIL Score is 750
    Excellent
    Powered by TransUnion CIBIL
    Updated 2 days ago
  `;
  const valGpay = validateExpectedDocument('CIBIL_REPORT', gpayText);
  assert.equal(valGpay.isValid, true);
  const resGpay = ocr.parseCibilReport(gpayText);
  assert.equal(resGpay.success, true);
  assert.equal(resGpay.cibilScore, '750');
  assert.equal(resGpay.isEligible, true);

  // PhonePe Experian screenshot
  const phonepeText = `
    PhonePe Credit Health
    Score: 780
    Out of 900
    Powered by Experian
  `;
  const valPe = validateExpectedDocument('CIBIL_REPORT', phonepeText);
  assert.equal(valPe.isValid, true);
  const resPe = ocr.parseCibilReport(phonepeText);
  assert.equal(resPe.success, true);
  assert.equal(resPe.cibilScore, '780');

  // Full CIBIL report containing applicant Aadhaar and PAN numbers
  const cibilWithAadhaar = `
    TRANSUNION CIBIL CONSUMER CREDIT REPORT
    Control Number: 10928374
    CIBIL Score: 782
    Applicant Name: RAMESH KUMAR
    PAN: ABCDE1234F
    Aadhaar Number: 2795 0437 1520
    Address: Road 1, Hyderabad 500081
  `;
  const valFull = validateExpectedDocument('CIBIL_REPORT', cibilWithAadhaar);
  assert.equal(valFull.isValid, true);
  const resFull = ocr.parseCibilReport(cibilWithAadhaar);
  assert.equal(resFull.success, true);
  assert.equal(resFull.cibilScore, '782');
});

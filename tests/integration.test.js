import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentIntelligenceService } from '../server/ocrService.js';
import { NbfcEngine } from '../server/nbfcEngine.js';
import { validateTransition } from '../server/workflowEngine.js';
import { query, pool } from '../server/db.js';

test('Case 1: Neon Database Integration & Seed Rules Query', async () => {
  const res = await query('SELECT nbfc_code, nbfc_name, min_cibil_score FROM nbfc_rules ORDER BY min_cibil_score ASC;');
  assert.ok(res.rows.length >= 4, 'Should retrieve at least 4 active NBFC lenders from Neon');
  assert.equal(res.rows[0].nbfc_code, 'FIBE');
  assert.equal(res.rows[0].min_cibil_score, 650);
});

test('Case 2: Google OCR Extraction on PAN Card', async () => {
  const ocr = new DocumentIntelligenceService();
  const panSampleText = `
    INCOME TAX DEPARTMENT
    GOVT. OF INDIA
    Permanent Account Number
    ABCDE1234F
    Name: SURESH KUMAR VARMA
    Father's Name: VENKATESWARLU VARMA
    Date of Birth: 14/05/1974
  `;
  const result = ocr.parsePanDocument(panSampleText);

  assert.equal(result.success, true);
  assert.equal(result.fields.pan.value, 'ABCDE1234F');
  assert.equal(result.fields.panName.value, 'SURESH KUMAR VARMA');
  assert.equal(result.fields.dob.value, '14/05/1974');
  assert.ok(result.fields.pan.confidence >= 95.0);
});

test('Case 3: Google OCR Aadhaar Extraction with Automatic Masking & PIN Validation', async () => {
  const ocr = new DocumentIntelligenceService();
  const aadhaarSampleText = `
    Government of India
    Unique Identification Authority of India
    To: SURESH KUMAR VARMA
    Flat 402, Sai Residency, Road No 3, Madhapur, Hyderabad, Telangana - 500081
    DOB: 14/05/1974
    Gender: Male
    9812 4310 4589
  `;
  const result = ocr.parseAadhaarDocument(aadhaarSampleText);

  assert.equal(result.success, true);
  assert.equal(result.fields.pincode.value, '500081');
  assert.equal(result.fields.aadhaarLast4.masked, 'XXXX-XXXX-4589');
  assert.equal(result.fields.gender.value, 'Male');
});

test('Case 4: Google OCR Bank Proof & IFSC Extraction', async () => {
  const ocr = new DocumentIntelligenceService();
  const bankSampleText = `
    STATE BANK OF INDIA
    MADHAPUR BRANCH, HYDERABAD
    IFSC: SBIN0012345
    Account No: 381920491823
    Customer Name: MR SURESH KUMAR VARMA
  `;
  const result = ocr.parseBankProof(bankSampleText);

  assert.equal(result.success, true);
  assert.equal(result.fields.ifsc.value, 'SBIN0012345');
  assert.equal(result.fields.accountNumber.value, '381920491823');
  assert.ok(result.fields.ifsc.confidence >= 95.0);
});

test('Case 5: NBFC Engine - High Credit Profile (780 CIBIL, ₹45,000 Income)', () => {
  const engine = new NbfcEngine();
  const decision = engine.evaluateEligibility({
    cibilScore: 780,
    income: 45000,
    relation: 'Father'
  });

  assert.equal(decision.hasEligibleLenders, true);
  assert.equal(decision.eligibleCount, 4, 'Should be eligible for all 4 lenders');
  assert.equal(decision.ineligible.length, 0);
});

test('Case 6: NBFC Engine - Borderline Credit Profile (670 CIBIL)', () => {
  const engine = new NbfcEngine();
  const decision = engine.evaluateEligibility({
    cibilScore: 670,
    income: 30000,
    relation: 'Father'
  });

  assert.equal(decision.hasEligibleLenders, true);
  // Only Fibe allows >= 650
  const fibe = decision.eligible.find(l => l.code === 'FIBE');
  assert.ok(fibe, 'Fibe should qualify 670 CIBIL');

  // Propelld (680) and LiquiLoans (700) should be ineligible
  const propelld = decision.ineligible.find(l => l.code === 'PROPELLED');
  assert.ok(propelld, 'Propelld should reject < 680');
});

test('Case 7: State Machine Invariant Violation Prevention', () => {
  // An unauthenticated user cannot jump straight into loan sanction or class access
  assert.equal(validateTransition('auth', 'classAccess'), false);
  assert.equal(validateTransition('auth', 'nbfc'), false);
  assert.equal(validateTransition('cibilLow', 'classAccess'), false);

  // Valid path must be preserved
  assert.equal(validateTransition('auth', 'authOtp'), true);
  assert.equal(validateTransition('authOtp', 'payment'), true);
  assert.equal(validateTransition('payment', 'emi'), true);
});

test('Case 8: API Endpoint Simulation (POST /api/v1/nbfc/evaluate)', async () => {
  const res = await fetch('http://127.0.0.1:5000/api/v1/nbfc/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cibilScore: 750, income: 40000, relation: 'Father' })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.hasEligibleLenders);
  assert.ok(data.eligibleCount >= 3);
});

// Close DB pool after all tests
test('Teardown: Close DB connections', async () => {
  await pool.end();
});

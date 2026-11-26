import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTransition, WORKFLOW_STAGES } from '../server/workflowEngine.js';
import { DocumentIntelligenceService } from '../server/ocrService.js';
import { NbfcEngine } from '../server/nbfcEngine.js';

test('Workflow State Engine verifies 25 discrete stages', () => {
  assert.equal(WORKFLOW_STAGES.length, 25);
});

test('Workflow enforces strict permitted state transitions', () => {
  assert.equal(validateTransition('auth', 'authOtp'), true);
  assert.equal(validateTransition('authOtp', 'payment'), true);
  assert.equal(validateTransition('payment', 'emi'), true);
  assert.equal(validateTransition('payment', 'checkout'), true);
  
  // Clients cannot jump arbitrarily from auth to classAccess or kyc
  assert.equal(validateTransition('auth', 'classAccess'), false);
  assert.equal(validateTransition('auth', 'panUpload'), false);
});

test('Document Intelligence assesses blur and extracts high-confidence PAN', async () => {
  const ocr = new DocumentIntelligenceService('GOOGLE_DOC_AI');
  const sampleBuffer = Buffer.alloc(50000, 'sample_image_data');
  const res = await ocr.extractDocumentFields('PAN', sampleBuffer, 'pan_card.jpg');
  
  assert.equal(res.success, true);
  assert.equal(res.documentType, 'PAN');
  assert.equal(res.fields.pan.value, 'ABCDE1234F');
  assert.ok(res.fields.pan.confidence >= 95.0);
});

test('NBFC Centralized Rule Engine matches qualified lenders based on CIBIL and income', () => {
  const engine = new NbfcEngine();
  const res = engine.evaluateEligibility({
    cibilScore: 780,
    relation: 'Father',
    income: 45000
  });

  assert.equal(res.hasEligibleLenders, true);
  assert.ok(res.eligibleCount >= 3);
  const propelld = res.eligible.find(l => l.code === 'PROPELLED');
  assert.ok(propelld);
});

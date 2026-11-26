import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNbfcStatus, resolveActiveLenderName, getCadenceStages } from '../server/nbfcStatusEngine.js';

test('NBFC Status Engine resolves active lender name from parent or child record', () => {
  assert.equal(
    resolveActiveLenderName({ Disbursed_NBFC_Name__c: 'Northern Arc' }),
    'Northern Arc'
  );
  assert.equal(
    resolveActiveLenderName({ Choose_NBFC_PRE__c: 'Propelld' }),
    'Propelld'
  );
  assert.equal(
    resolveActiveLenderName(null, { other_NBFC_PRE__c: 'Auxilo' }),
    'Auxilo'
  );
  assert.equal(
    resolveActiveLenderName(null, null),
    'Finance partner is being assigned'
  );
});

test('NBFC Status Engine maps DISBURSED status and unlocks class access CTA', () => {
  const result = normalizeNbfcStatus({
    Choose_NBFC_PRE__c: 'Northern Arc',
    Onboarding_Status__c: 'Disbursed'
  });

  assert.equal(result.statusCode, 'DISBURSED');
  assert.equal(result.cadenceStep, 5);
  assert.equal(result.callToAction.action, 'GO_TO_CLASS_ACCESS');
  assert.equal(result.cadenceStages[4].isCompleted, true);
});

test('NBFC Status Engine maps EMI_SETUP_PENDING and provides auto-debit CTA', () => {
  const result = normalizeNbfcStatus({
    Choose_NBFC_PRE__c: 'Fibe',
    Fibe_Overall_Stages__c: 'NACH_PENDING'
  });

  assert.equal(result.statusCode, 'EMI_SETUP_PENDING');
  assert.equal(result.cadenceStep, 4);
  assert.equal(result.callToAction.action, 'SETUP_EMI');
});

test('NBFC Status Engine maps REJECTED status with Change Co-Applicant guidance on CIBIL reject', () => {
  const result = normalizeNbfcStatus({
    Choose_NBFC_PRE__c: 'Northern Arc',
    Northern_Arc_Overall_Stages__c: 'Rejected - Low CIBIL Score'
  });

  assert.equal(result.statusCode, 'REJECTED');
  assert.equal(result.callToAction.action, 'CHANGE_CO_APPLICANT');
  assert.ok(result.guidanceMessage.includes('co-applicant'));
});

test('NBFC Status Engine defaults to APPLICATION_CREATED for new applications', () => {
  const result = normalizeNbfcStatus({
    Choose_NBFC_PRE__c: 'Gyandhan',
    Gyandhan_Overall_Stages__c: 'LEAD_SUBMITTED'
  });

  assert.equal(result.statusCode, 'APPLICATION_CREATED');
  assert.equal(result.cadenceStep, 1);
  assert.equal(result.cadenceStages[0].isCurrent, true);
});

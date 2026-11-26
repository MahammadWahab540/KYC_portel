/**
 * NxtWave KYC - Backend-Driven Workflow State Machine
 * Enforces valid state transitions and guarantees clients cannot skip steps.
 */

export const WORKFLOW_STAGES = [
  { id: 'auth', title: 'Mobile sign-in', group: 'Access' },
  { id: 'authOtp', title: 'Student OTP', group: 'Access' },
  { id: 'payment', title: 'Payment selection', group: 'Payment' },
  { id: 'emi', title: 'EMI selection', group: 'Payment' },
  { id: 'checkout', title: 'Full/card checkout', group: 'Payment' },
  { id: 'payer', title: 'Choose fee supporter', group: 'CIBIL' },
  { id: 'contact', title: 'Supporter details', group: 'CIBIL' },
  { id: 'cibilLearn', title: 'Understand CIBIL', group: 'CIBIL' },
  { id: 'cibilUpload', title: 'CIBIL report + guide', group: 'CIBIL' },
  { id: 'cibilResult', title: 'CIBIL assessment', group: 'CIBIL' },
  { id: 'cibilLow', title: 'Try another supporter', group: 'CIBIL' },
  { id: 'noSupport', title: 'No alternate supporter', group: 'CIBIL' },
  { id: 'payerConfirmed', title: 'Supporter selected', group: 'CIBIL' },
  { id: 'kycIntro', title: 'Start KYC', group: 'KYC' },
  { id: 'panUpload', title: 'PAN upload + visual guide', group: 'KYC' },
  { id: 'panPreview', title: 'PAN field preview', group: 'KYC' },
  { id: 'aadhaarUpload', title: 'Aadhaar upload + visual guide', group: 'KYC' },
  { id: 'aadhaarPreview', title: 'Aadhaar field preview', group: 'KYC' },
  { id: 'bankUpload', title: 'Bank proof choice', group: 'KYC' },
  { id: 'bankPreview', title: 'Bank details + manual reconfirm', group: 'KYC' },
  { id: 'optionalIntro', title: 'Optional details benefit', group: 'Profile' },
  { id: 'optionalDetails', title: 'Additional personal details', group: 'Profile' },
  { id: 'optionalWork', title: 'Employment + workplace', group: 'Profile' },
  { id: 'nbfc', title: 'NBFC status', group: 'Lender' },
  { id: 'classAccess', title: 'Class access states', group: 'Access' }
];

export const ALLOWED_TRANSITIONS = {
  auth: ['authOtp'],
  authOtp: ['payment'],
  payment: ['emi', 'checkout'],
  emi: ['payer'],
  checkout: ['classAccess'], // When full payment is completed
  payer: ['contact'],
  contact: ['cibilLearn'],
  cibilLearn: ['cibilUpload'],
  cibilUpload: ['cibilResult'],
  cibilResult: ['payerConfirmed', 'cibilLow'],
  cibilLow: ['payer', 'noSupport'],
  noSupport: ['payment'],
  payerConfirmed: ['kycIntro'],
  kycIntro: ['panUpload'],
  panUpload: ['panPreview'],
  panPreview: ['aadhaarUpload'],
  aadhaarUpload: ['aadhaarPreview'],
  aadhaarPreview: ['bankUpload'],
  bankUpload: ['bankPreview'],
  bankPreview: ['optionalIntro', 'nbfc'],
  optionalIntro: ['optionalDetails', 'nbfc'],
  optionalDetails: ['optionalWork', 'nbfc'],
  optionalWork: ['nbfc'],
  nbfc: ['classAccess'],
  classAccess: []
};

export function validateTransition(currentStage, nextStage) {
  const allowed = ALLOWED_TRANSITIONS[currentStage] || [];
  return allowed.includes(nextStage);
}

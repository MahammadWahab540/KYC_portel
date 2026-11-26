/**
 * Salesforce-Driven NBFC Status Normalization Engine
 *
 * Reusable domain logic ported from PRE-Onboading-jorney-V2:
 * Maps heterogeneous lender stages (Northern Arc, Fibe, Finz, Gyandhan, Jodo, Auxilo, Techfino, Bajaj, etc.)
 * into canonical status, 5-stage cadence tracking, contextual CTA, and user messaging.
 */

export const FALLBACK_LENDER_NAME = 'Finance partner is being assigned';

export function getCadenceStages(activeStep, isRejected = false) {
  return [
    {
      step: 1,
      name: 'Application & Consent',
      description: 'Educational EMI application initiated & consent link sent to co-applicant',
      isCompleted: activeStep > 1 && !isRejected,
      isCurrent: activeStep === 1 && !isRejected,
    },
    {
      step: 2,
      name: 'Document & Credit Review',
      description: 'Lender underwriting team reviews KYC, income details & credit bureau score',
      isCompleted: activeStep > 2 && !isRejected,
      isCurrent: activeStep === 2 && !isRejected,
    },
    {
      step: 3,
      name: 'Sanction & Video KYC',
      description: 'Loan sanctioned, digital agreement signing & quick Video KYC (if applicable)',
      isCompleted: activeStep > 3 && !isRejected,
      isCurrent: activeStep === 3 && !isRejected,
    },
    {
      step: 4,
      name: 'Auto-Debit (e-NACH) Setup',
      description: 'Our NBFC partner will connect with you to register monthly auto-debit (0% interest)',
      isCompleted: activeStep > 4 && !isRejected,
      isCurrent: activeStep === 4 && !isRejected,
    },
    {
      step: 5,
      name: 'Disbursement & Class Access',
      description: 'Facility disbursed directly to NxtWave and Genius LMS portal unlocked',
      isCompleted: activeStep === 5,
      isCurrent: activeStep === 5,
    },
  ];
}

export function resolveActiveLenderName(record = null, childRecord = null) {
  if (!record && !childRecord) return FALLBACK_LENDER_NAME;

  const disbursed = String(record?.Disbursed_NBFC_Name__c || '').trim();
  if (disbursed && disbursed.toLowerCase() !== 'null' && disbursed.toLowerCase() !== 'undefined') {
    return disbursed;
  }

  const childName = String(childRecord?.Name || childRecord?.Choose_NBFC_PRE__c || childRecord?.other_NBFC_PRE__c || '').trim();
  if (childName && childName.toLowerCase() !== 'null' && childName.toLowerCase() !== 'undefined') {
    return childName;
  }

  const chosen = String(record?.Choose_NBFC_PRE__c || '').trim();
  if (chosen && chosen.toLowerCase() !== 'null' && chosen.toLowerCase() !== 'undefined') {
    return chosen;
  }

  return FALLBACK_LENDER_NAME;
}

/**
 * Normalizes heterogeneous Salesforce records into canonical status response
 */
export function normalizeNbfcStatus(record = null, childRecord = null) {
  const activeLender = resolveActiveLenderName(record, childRecord);
  const lastUpdated = record?.LastModifiedDate || childRecord?.LastModifiedDate || new Date().toISOString();

  // Combine parent and child record fields to inspect
  const rawParts = [
    record?.Onboarding_Status__c,
    record?.NBFC_Status__c,
    record?.Status_Of_Decision_in_NBFC_PRE__c,
    record?.Northern_Arc_Overall_Stages__c,
    record?.Fibe_Overall_Stages__c,
    record?.Fibe_Overall_Loan_Status__c,
    record?.Finz_Overall_Stages__c,
    record?.Gyandhan_Overall_Stages__c,
    record?.JODO_NBFC_Status__c,
    childRecord?.other_NBFC_PRE__c,
    childRecord?.Northern_Arc_Overall_Stages__c,
    childRecord?.Northern_Arc_Remarks__c,
    childRecord?.Gyandhan_Overall_Stages__c,
    childRecord?.Gyandhan_Sub_Status__c,
    childRecord?.Fibe_Overall_Stages__c,
    childRecord?.Fibe_Overall_Loan_Status__c,
    childRecord?.Auxilo_Overall_Stages__c,
    childRecord?.Techfino_Overall_Status__c,
    childRecord?.Bajaj_Overall_Status_Presa__c,
    childRecord?.NBFC_Stage_of_Reps__c,
    childRecord?.Application_Status_PRE__c,
    childRecord?.Post_Approval_Status_Pre__c,
  ].filter(Boolean);

  const rawStatus = rawParts.join(' | ').trim();
  const s = rawStatus.toLowerCase();

  // 1. DISBURSED
  if (
    s.includes('disbursed') ||
    s.includes('disbursal done') ||
    s.includes('disbursement complete') ||
    record?.Provide_Class_Access__c === true ||
    childRecord?.Provide_Class_Access__c === true
  ) {
    return {
      statusCode: 'DISBURSED',
      statusLabel: 'Loan Disbursed',
      activeLender,
      userMessage: 'Your loan has been successfully disbursed to NxtWave.',
      guidanceMessage: 'LMS credentials have been dispatched. Your batch is ready for learning activation.',
      cadenceStep: 5,
      cadenceStages: getCadenceStages(5, false),
      callToAction: {
        label: 'Activate Class Access',
        action: 'GO_TO_CLASS_ACCESS',
        primary: true,
      },
      classAccessEta: 'Instant Access Available',
      lastUpdated,
      rawStatus,
      appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || record?.Applied_Loan_Amount_PRE__c || childRecord?.Master_Applied_Loan_Amount__c || 0),
      approvedLoanAmount: Number(childRecord?.Effective_Approved_Amount__c || childRecord?.Master_Approved_Loan_Amount__c || 0),
      applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
    };
  }

  // 2. DISBURSEMENT PENDING
  if (
    s.includes('disbursement initiated') ||
    s.includes('disbursement pending') ||
    s.includes('ready for disbursal')
  ) {
    return {
      statusCode: 'DISBURSEMENT_PENDING',
      statusLabel: 'Disbursement In Progress',
      activeLender,
      userMessage: 'Your loan is approved and being processed for final disbursement.',
      guidanceMessage: 'The NBFC is clearing the transaction with our accounts desk. No action needed from your side.',
      cadenceStep: 5,
      cadenceStages: getCadenceStages(4, false),
      callToAction: {
        label: 'Check Status',
        action: 'REFRESH',
        primary: false,
      },
      classAccessEta: 'Estimated within 2–4 hours',
      lastUpdated,
      rawStatus,
      appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || 0),
      approvedLoanAmount: Number(childRecord?.Effective_Approved_Amount__c || 0),
      applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
    };
  }

  // 3. EMI SETUP COMPLETED
  if (
    s.includes('emi setup done') ||
    s.includes('mandate success') ||
    s.includes('nach completed') ||
    s.includes('enach registered')
  ) {
    return {
      statusCode: 'EMI_SETUP_COMPLETED',
      statusLabel: 'Auto-Debit Configured',
      activeLender,
      userMessage: 'Your monthly auto-debit mandate (0% interest) is successfully registered.',
      guidanceMessage: 'We are completing the final disbursement formalities with the lender.',
      cadenceStep: 4,
      cadenceStages: getCadenceStages(4, false),
      callToAction: {
        label: 'Refresh Status',
        action: 'REFRESH',
        primary: false,
      },
      classAccessEta: 'Expected today',
      lastUpdated,
      rawStatus,
      appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || 0),
      approvedLoanAmount: Number(childRecord?.Effective_Approved_Amount__c || 0),
      applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
    };
  }

  // 4. EMI SETUP PENDING
  if (
    s.includes('emi setup pending') ||
    s.includes('emi_setup_pending') ||
    s.includes('mandate pending') ||
    s.includes('mandate_pending') ||
    s.includes('nach pending') ||
    s.includes('nach_pending') ||
    s.includes('enach pending') ||
    s.includes('enach_pending')
  ) {
    return {
      statusCode: 'EMI_SETUP_PENDING',
      statusLabel: 'Auto-Debit Registration Required',
      activeLender,
      userMessage: 'Your loan is sanctioned. Auto-debit setup is required to disburse the loan.',
      guidanceMessage: 'Our financing partner will connect with you to complete 0% EMI auto-debit registration.',
      cadenceStep: 4,
      cadenceStages: getCadenceStages(4, false),
      callToAction: {
        label: 'Connect with PRE Advisor',
        action: 'SETUP_EMI',
        primary: true,
      },
      classAccessEta: 'Pending Mandate Setup',
      lastUpdated,
      rawStatus,
      appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || 0),
      approvedLoanAmount: Number(childRecord?.Effective_Approved_Amount__c || 0),
      applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
    };
  }

  // 5. REJECTED / DECLINED
  if (
    s.includes('rejected') ||
    s.includes('declined') ||
    s.includes('cibil reject') ||
    s.includes('negative profile')
  ) {
    const isIncomeReject = s.includes('income') || s.includes('salary');
    const isCibilReject = s.includes('cibil') || s.includes('score');

    return {
      statusCode: 'REJECTED',
      statusLabel: 'Application Could Not Be Approved',
      activeLender,
      userMessage: 'The NBFC underwriting team could not approve the loan application with the current details.',
      guidanceMessage: isCibilReject
        ? 'Credit bureau requirements were not met. We recommend applying with an alternate earning family member as co-applicant.'
        : 'You can switch to an alternate education finance partner or direct payment without losing your scholarship.',
      cadenceStep: 2,
      cadenceStages: getCadenceStages(2, true),
      callToAction: {
        label: isCibilReject ? 'Change Co-Applicant' : 'Explore Alternate NBFC',
        action: isCibilReject ? 'CHANGE_CO_APPLICANT' : 'RETRY_DOCUMENTS',
        primary: true,
      },
      classAccessEta: null,
      lastUpdated,
      rawStatus,
      appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || 0),
      approvedLoanAmount: 0,
      applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
    };
  }

  // 6. APPROVED / SANCTIONED
  if (
    s.includes('approved') ||
    s.includes('sanctioned') ||
    s.includes('offer accepted') ||
    s.includes('pre-approved')
  ) {
    return {
      statusCode: 'APPROVED',
      statusLabel: 'Loan Approved & Sanctioned',
      activeLender,
      userMessage: `Congratulations! Your loan has been approved by ${activeLender}.`,
      guidanceMessage: 'Complete the digital e-sign agreement and mandate registration to unlock class access.',
      cadenceStep: 3,
      cadenceStages: getCadenceStages(3, false),
      callToAction: {
        label: 'View Next Steps',
        action: 'SETUP_EMI',
        primary: true,
      },
      classAccessEta: '1–2 days after mandate',
      lastUpdated,
      rawStatus,
      appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || 0),
      approvedLoanAmount: Number(childRecord?.Effective_Approved_Amount__c || childRecord?.Master_Approved_Loan_Amount__c || 0),
      applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
    };
  }

  // 7. DOCUMENTS REQUIRED
  if (
    s.includes('docs pending') ||
    s.includes('documents required') ||
    s.includes('re-upload') ||
    s.includes('invalid docs')
  ) {
    return {
      statusCode: 'DOCUMENTS_REQUIRED',
      statusLabel: 'Additional Documents Required',
      activeLender,
      userMessage: 'The lender has requested additional or clearer document proofs.',
      guidanceMessage: 'Please review and re-upload the requested documents or connect with our support desk.',
      cadenceStep: 2,
      cadenceStages: getCadenceStages(2, false),
      callToAction: {
        label: 'Re-Upload Documents',
        action: 'RETRY_DOCUMENTS',
        primary: true,
      },
      classAccessEta: 'Under Review',
      lastUpdated,
      rawStatus,
      appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || 0),
      approvedLoanAmount: 0,
      applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
    };
  }

  // 8. UNDER REVIEW / CREDIT CHECK
  if (
    s.includes('under review') ||
    s.includes('in progress') ||
    s.includes('underwriting') ||
    s.includes('credit evaluation') ||
    s.includes('application in nbfc') ||
    s.includes('kyc submitted')
  ) {
    return {
      statusCode: 'UNDER_REVIEW',
      statusLabel: 'Under Lender Verification',
      activeLender,
      userMessage: `Your documents and credit profile are currently being reviewed by ${activeLender}.`,
      guidanceMessage: 'Lender underwriting typically takes 2–6 working hours. No action required.',
      cadenceStep: 2,
      cadenceStages: getCadenceStages(2, false),
      callToAction: {
        label: 'Refresh Status',
        action: 'REFRESH',
        primary: false,
      },
      classAccessEta: 'Estimated 4–6 hours',
      lastUpdated,
      rawStatus,
      appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || 0),
      approvedLoanAmount: 0,
      applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
    };
  }

  // 9. APPLICATION CREATED (Default known)
  return {
    statusCode: 'APPLICATION_CREATED',
    statusLabel: 'Application Initiated',
    activeLender,
    userMessage: 'Your financing application has been initiated with our education finance partner.',
    guidanceMessage: 'We are transferring your verified KYC files to the lender for underwriting.',
    cadenceStep: 1,
    cadenceStages: getCadenceStages(1, false),
    callToAction: {
      label: 'Check Status',
      action: 'REFRESH',
      primary: false,
    },
    classAccessEta: 'Processing',
    lastUpdated,
    rawStatus: rawStatus || 'APPLICATION_CREATED',
    appliedLoanAmount: Number(childRecord?.Applied_Loan_Amount_PRE__c || 0),
    approvedLoanAmount: 0,
    applicationReferenceId: childRecord?.NBFC_Application_Reference_Number_PRE__c || childRecord?.Loan_Id__c || childRecord?.Name || null
  };
}

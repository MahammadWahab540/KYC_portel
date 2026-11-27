/**
 * Document Detection & Validation Engine
 * 
 * Inspects document text and layout characteristics to classify:
 * - PAN Card
 * - Aadhaar Front
 * - Aadhaar Back
 * - CIBIL / Credit Bureau Report
 * - Bank Statement / Passbook
 * 
 * Rejects corrupt, mismatched, unreadable, or invalid documents with
 * exact user-mandated error messages.
 */

export const EXPECTED_DOC_ERRORS = {
  PAN: 'Invalid document. Please upload a valid PAN card.',
  AADHAAR_FRONT: 'Invalid document. Please upload the front side of your Aadhaar card.',
  AADHAAR_BACK: 'Invalid document. Please upload the back side of your Aadhaar card.',
  AADHAAR: 'Invalid document. Please upload the front side of your Aadhaar card.',
  CIBIL: 'Invalid document. Please upload a valid CIBIL report.',
  CIBIL_REPORT: 'Invalid document. Please upload a valid CIBIL report.',
  BANK_STATEMENT: 'Invalid document. Please upload a valid Bank Statement or Passbook.',
  BANK_PASSBOOK: 'Invalid document. Please upload a valid Bank Statement or Passbook.',
  BANK_PROOF: 'Invalid document. Please upload a valid Bank Statement or Passbook.'
};

/**
 * Classify document type based on structural and contextual text markers
 */
export function classifyDocument(rawText = '', metadata = {}) {
  const text = String(rawText || '').trim();
  if (!text || text.length < 15) {
    return {
      detectedType: 'UNKNOWN',
      confidence: 0,
      reason: 'EMPTY_OR_UNREADABLE'
    };
  }

  const clean = text.toLowerCase();

  // 1. Check for CIBIL / Credit Bureau Report & Score Screenshots
  const isCibil = /(?:transunion|cibil|c1bil|experian|equifax|crif|credit\s*report|cibil\s*score|credit\s*score|score\s*summary|control\s*number|credit\s*history|credit\s*information|credit\s*health|credit\s*rating|credit\s*profile|credit\s*bureau|bureau\s*score|credit\s*insights|your\s*score|credit\s*check|onescore|paisabazaar|cir\b|out\s*of\s*900|payment\s*history|credit\s*summary)/i.test(text);
  if (isCibil) {
    const hasScoreOrNh = /\b([3-8][0-9]{2}|900)\b/.test(text) || /\b(nh|na|-1|no\s*credit\s*history)\b/i.test(text);
    if (hasScoreOrNh) {
      return { detectedType: 'CIBIL', confidence: 95 };
    }
  }

  // 2. Check for PAN Card
  const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/;
  const hasPanPattern = panRegex.test(text);
  const isPanDoc = /(income\s*tax\s*department|permanent\s*account\s*number|govt\s*of\s*india|incometax|father'?s?\s*name)/i.test(text);

  if (hasPanPattern && (isPanDoc || !clean.includes('aadhaar'))) {
    return { detectedType: 'PAN', confidence: 95 };
  }

  // 3. Check for Aadhaar Front vs Back vs Combined e-Aadhaar Letter
  const aadhaarMatches = text.match(/\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/g) || text.match(/\b[xX]{4}[\s\-][xX]{4}[\s\-][0-9]{4}\b/g) || [];
  const hasAadhaarNumber = aadhaarMatches.length > 0;
  const isAadhaarDoc = /(unique\s*identification\s*authority|uidai|aadhaar|ardm+aar|anmann|mera\s*aadhaar|meri\s*pehchan|government\s*of\s*india|gov[a-z]*\s*of|your\s*aa[a-z]*\s*no)/i.test(text);
  const hasAddressBlock = /(address:?|s\/o|d\/o|w\/o|c\/o|pincode|road\s*no|flat\s*no|street|lane|nagar|colony)/i.test(text) && /\b[1-9][0-9]{5}\b/.test(text);
  const hasFrontMarkers = /(gender|male|female|dob|date\s*of\s*birth|year\s*of\s*birth)/i.test(text);
  const isEaadhaarSheet = (
    aadhaarMatches.length >= 2 ||
    ((isAadhaarDoc || hasAadhaarNumber) && /enrolment|electronically|proof\s*of\s*identity|information|orma\s*tion|mpor\s*ma\s*tion|download|your\s*aa|vid/i.test(text)) ||
    (hasAadhaarNumber && hasFrontMarkers && hasAddressBlock)
  );

  if (isAadhaarDoc || hasAadhaarNumber || (hasAddressBlock && /\b[1-9][0-9]{5}\b/.test(text))) {
    // If it's an e-Aadhaar letter or dual card sheet containing front details/Aadhaar number and address/cutouts
    if (isEaadhaarSheet || aadhaarMatches.length >= 2 || (hasAadhaarNumber && hasFrontMarkers && hasAddressBlock)) {
      return { detectedType: 'AADHAAR_COMBINED', confidence: 95 };
    }

    // Standalone Back card: has address block and 6-digit pin code, and does NOT have gender/front markers
    if (hasAddressBlock && !hasFrontMarkers) {
      return { detectedType: 'AADHAAR_BACK', confidence: 90 };
    }

    // Standalone Front card: has front markers or Aadhaar number without an address block
    if (hasFrontMarkers || (hasAadhaarNumber && !hasAddressBlock)) {
      return { detectedType: 'AADHAAR_FRONT', confidence: 92 };
    }

    // If both address and front markers exist without full letter markers
    if (hasAddressBlock) {
      return { detectedType: 'AADHAAR_BACK', confidence: 80 };
    }

    if (hasAadhaarNumber || isAadhaarDoc) {
      return { detectedType: 'AADHAAR_FRONT', confidence: 85 };
    }
  }

  // 4. Check for Bank Statement / Passbook
  const isBankDoc = /(bank|account\s*number|ifsc|branch|savings\s*account|current\s*account|passbook|statement\s*period)/i.test(text);
  const hasIfscOrAcc = /\b[A-Z]{4}0[A-Z0-9]{6}\b/.test(text) || /\b\d{9,18}\b/.test(text);
  if (isBankDoc && hasIfscOrAcc) {
    return { detectedType: 'BANK_STATEMENT', confidence: 85 };
  }

  return {
    detectedType: 'UNKNOWN',
    confidence: 10,
    reason: 'DOCUMENT_TYPE_NOT_RECOGNIZED'
  };
}

/**
 * Validate that an uploaded document matches the expected document slot
 * Returns exact user-mandated error message if invalid.
 */
export function validateExpectedDocument(expectedType, rawText = '', metadata = {}) {
  const normExpected = String(expectedType || '').toUpperCase().trim();
  const detection = classifyDocument(rawText, metadata);
  const detectedType = detection.detectedType;

  const mappedExpected =
    normExpected === 'CIBIL_REPORT' ? 'CIBIL' :
    normExpected === 'AADHAAR' ? 'AADHAAR_FRONT' :
    normExpected === 'BANK_PROOF' || normExpected === 'BANK_PASSBOOK' ? 'BANK_STATEMENT' :
    normExpected;

  // Strict Type Matching (Combined e-Aadhaar letters with front+back portions satisfy both slots)
  let isTypeMatch = false;

  if (mappedExpected === 'PAN' && detectedType === 'PAN') {
    isTypeMatch = true;
  } else if (mappedExpected === 'AADHAAR_FRONT' && (detectedType === 'AADHAAR_FRONT' || detectedType === 'AADHAAR_COMBINED')) {
    isTypeMatch = true;
  } else if (mappedExpected === 'AADHAAR_BACK' && (detectedType === 'AADHAAR_BACK' || detectedType === 'AADHAAR_COMBINED')) {
    isTypeMatch = true;
  } else if (mappedExpected === 'CIBIL' && detectedType === 'CIBIL') {
    isTypeMatch = true;
  } else if (mappedExpected === 'CIBIL') {
    // If a valid CIBIL/Credit report contains applicant KYC (Aadhaar/PAN) or is a score screenshot
    const hasScore = /\b([3-8][0-9]{2}|900)\b/.test(rawText) || /\b(nh|na|-1|no\s*credit\s*history)\b/i.test(rawText);
    const hasCreditKw = /(?:transunion|cibil|c1bil|experian|equifax|crif|credit|bureau|score|onescore|paisabazaar|cir\b)/i.test(rawText);
    if (hasScore && hasCreditKw) {
      isTypeMatch = true;
    }
  } else if (mappedExpected === 'BANK_STATEMENT' && detectedType === 'BANK_STATEMENT') {
    isTypeMatch = true;
  }

  if (!isTypeMatch) {
    const errorMsg = EXPECTED_DOC_ERRORS[normExpected] || EXPECTED_DOC_ERRORS[mappedExpected] || 'Invalid document uploaded.';
    return {
      isValid: false,
      expectedType: normExpected,
      detectedType,
      error: errorMsg,
      code: 'INVALID_DOCUMENT_TYPE'
    };
  }

  // Field Integrity Check for verified document types
  if (mappedExpected === 'PAN') {
    const panRegex = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/;
    if (!panRegex.test(rawText)) {
      return {
        isValid: false,
        expectedType: normExpected,
        detectedType,
        error: EXPECTED_DOC_ERRORS.PAN,
        code: 'PAN_NUMBER_MISSING'
      };
    }
  }

  if (mappedExpected === 'AADHAAR_FRONT') {
    const hasNum = /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/.test(rawText) || /\b[xX]{4}[\s\-][xX]{4}[\s\-][0-9]{4}\b/.test(rawText);
    if (!hasNum) {
      return {
        isValid: false,
        expectedType: normExpected,
        detectedType,
        error: EXPECTED_DOC_ERRORS.AADHAAR_FRONT,
        code: 'AADHAAR_NUMBER_MISSING'
      };
    }
  }

  if (mappedExpected === 'AADHAAR_BACK') {
    const hasPin = /\b[1-9][0-9]{5}\b/.test(rawText);
    const hasNum = /\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b/.test(rawText) || /\b[xX]{4}[\s\-][xX]{4}[\s\-][0-9]{4}\b/.test(rawText);
    const isCombinedAadhaar = detectedType === 'AADHAAR_COMBINED' && hasNum;
    if (!hasPin && !isCombinedAadhaar) {
      return {
        isValid: false,
        expectedType: normExpected,
        detectedType,
        error: EXPECTED_DOC_ERRORS.AADHAAR_BACK,
        code: 'PINCODE_MISSING'
      };
    }
  }

  if (mappedExpected === 'CIBIL') {
    const hasScore = /\b([3-8][0-9]{2}|900)\b/.test(rawText) || /\b(nh|na|-1|no\s*credit\s*history)\b/i.test(rawText);
    if (!hasScore) {
      return {
        isValid: false,
        expectedType: normExpected,
        detectedType,
        error: EXPECTED_DOC_ERRORS.CIBIL,
        code: 'CIBIL_SCORE_MISSING'
      };
    }
  }

  return {
    isValid: true,
    expectedType: normExpected,
    detectedType,
    error: null
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { DocumentIntelligenceService } from '../server/ocrService.js';

test('Aadhaar Front Side OCR extracts full 12-digit number, name, DOB, and gender without masking', () => {
  const ocr = new DocumentIntelligenceService();
  const frontText = `
    GOVERNMENT OF INDIA
    Unique Identification Authority of India
    Mera Aadhaar, Meri Pehchan
    Enrollment No: 1234/56789/01234
    Suresh Kumar Varma
    DOB: 14/05/1974
    Gender: Male
    9812 4310 4589
  `;
  const result = ocr.parseAadhaarDocument(frontText, 'AADHAAR_FRONT');

  assert.equal(result.success, true);
  assert.equal(result.documentType, 'AADHAAR_FRONT');
  assert.equal(result.extractedFields.aadhaarNumber, '981243104589');
  assert.equal(result.extractedFields.aadhaarLast4, '4589');
  assert.equal(result.extractedFields.fullName, 'Suresh Kumar Varma');
  assert.equal(result.extractedFields.dob, '14/05/1974');
  assert.equal(result.extractedFields.gender, 'Male');
});

test('Aadhaar Back Side OCR extracts street, city/district, state, pincode, and complete address', () => {
  const ocr = new DocumentIntelligenceService();
  const backText = `
    Unique Identification Authority of India
    Address:
    S/O Venkateswarlu Varma, Flat 402 Sai Residency,
    Road No 3 Madhapur,
    Near Metro Station,
    Hyderabad, Telangana - 500081
  `;
  const result = ocr.parseAadhaarDocument(backText, 'AADHAAR_BACK');

  assert.equal(result.success, true);
  assert.equal(result.documentType, 'AADHAAR_BACK');
  assert.equal(result.extractedFields.pincode, '500081');
  assert.equal(result.extractedFields.district, 'Hyderabad');
  assert.equal(result.extractedFields.state, 'Telangana');
  assert.ok(result.extractedFields.street && result.extractedFields.street.length > 0);
  assert.ok(result.extractedFields.completeAddress && result.extractedFields.completeAddress.includes('500081'));
});

test('Aadhaar OCR preserves pre-masked number when already masked on document without inventing digits', () => {
  const ocr = new DocumentIntelligenceService();
  const maskedText = `
    Government of India
    Suresh Kumar Varma
    DOB: 14/05/1974
    XXXX XXXX 4589
  `;
  const result = ocr.parseAadhaarDocument(maskedText, 'AADHAAR_FRONT');

  assert.equal(result.success, true);
  assert.equal(result.extractedFields.aadhaarNumber, 'XXXX-XXXX-4589');
  assert.equal(result.extractedFields.aadhaarLast4, '4589');
  assert.equal(result.extractedFields.isPreMasked, true);
});

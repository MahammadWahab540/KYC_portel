# Document Detection, Validation & OCR Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement pre-extraction document type detection, strict document validation with the exact mandated error messages, and verified OCR extraction across PAN, Aadhaar Front, Aadhaar Back, and CIBIL report uploads, completely preventing invalid or random documents from progressing.

**Architecture:** 
1. **Document Classifier & Validator (`server/documentDetector.js`)**: Inspects extracted document text, visual keywords, and layout markers to detect the actual document type (`PAN`, `AADHAAR_FRONT`, `AADHAAR_BACK`, `CIBIL_REPORT`, `BANK_STATEMENT`, or `UNKNOWN`).
2. **Backend Upload Gatekeeper (`server/documentService.js`)**: Validates the detected type against the expected section type before allowing document storage or progression. If mismatched, corrupt, or unreadable, immediately rejects the request with HTTP 422 and the exact user-specified error message.
3. **Frontend Guard (`src/App.tsx`)**: Halts stage advancement when an upload is rejected, displays the exact validation error, and requires a valid document to proceed.
4. **CIBIL Score Pipeline (`server/ocrService.js`)**: Strictly extracts actual credit scores (300–900) or flags "NH" (No History); completely disallows assumed, generated, or mock scores.

**Tech Stack:** Node.js (ESM), `pdf-parse`, `tesseract.js`, React, TypeScript, Tailwind CSS, Node Test Runner (`node:test`).

**Spec:** Mandated validation messages:
- **PAN Card**: `Invalid document. Please upload a valid PAN card.`
- **Aadhaar Front**: `Invalid document. Please upload the front side of your Aadhaar card.`
- **Aadhaar Back**: `Invalid document. Please upload the back side of your Aadhaar card.`
- **CIBIL Report**: `Invalid document. Please upload a valid CIBIL report.`

---

## Global Constraints

- Never accept an invalid or mismatched document.
- Never use mock data, hardcoded scores, or synthetic fallbacks.
- Never advance the user to the next screen if document validation or required field extraction fails.
- All validation must execute at the backend level and be reinforced on the frontend.
- Do not deploy to production until local testing is complete, test matrix is delivered, and user grants explicit approval.

---

## Tasks

### Task 1: Create Document Type Detection & Validation Engine

**Files:**
- Create: `server/documentDetector.js`
- Test: `tests/document_detector.test.js`

- [ ] **Step 1: Write failing tests for document type detection**
  - Test PAN detection (income tax, permanent account number, 10-char PAN regex).
  - Test Aadhaar Front detection (UIDAI, Government of India, 12-digit number / masked, DOB, Gender, absence of Address).
  - Test Aadhaar Back detection (Address, S/O, D/O, PIN code, absence of photo/DOB front markers).
  - Test CIBIL Report detection (TransUnion, CIBIL, Experian, Equifax, CRIF, Credit Report, Score).
  - Test Mismatch and Random Document detection (electricity bills, invoices, blank buffers, salary slips returning `UNKNOWN` and triggering exact error messages).
- [ ] **Step 2: Run tests and confirm they fail**
  - Run `node --test tests/document_detector.test.js`
- [ ] **Step 3: Implement `server/documentDetector.js`**
  - Implement `classifyDocument(text, metadata)` returning `{ detectedType, confidence, markers }`.
  - Implement `validateExpectedDocument(expectedType, detectedType, extractedFields)` returning `{ isValid, error, code }` with exact user-specified error messages.
- [ ] **Step 4: Run tests and verify they pass**
  - Run `node --test tests/document_detector.test.js`
- [ ] **Step 5: Commit**
  - `git add server/documentDetector.js tests/document_detector.test.js && git commit -m "feat(ocr): implement document classification and type validation engine"`

---

### Task 2: Integrate Document Validation into Backend Upload Service

**Files:**
- Modify: `server/documentService.js`
- Modify: `server/index.js`
- Test: `tests/document_upload_validation.test.js`

- [ ] **Step 1: Write failing tests for upload rejection on invalid documents**
  - Uploading random text or electricity bill to PAN endpoint must return HTTP 422 with `Invalid document. Please upload a valid PAN card.`
  - Uploading Aadhaar back to Aadhaar front endpoint must return HTTP 422 with `Invalid document. Please upload the front side of your Aadhaar card.`
  - Uploading Aadhaar front to Aadhaar back endpoint must return HTTP 422 with `Invalid document. Please upload the back side of your Aadhaar card.`
  - Uploading random doc to CIBIL endpoint must return HTTP 422 with `Invalid document. Please upload a valid CIBIL report.`
  - Documents rejected by validation must not be stored as active documents in the database.
- [ ] **Step 2: Run tests and confirm they fail**
  - Run `node --test tests/document_upload_validation.test.js`
- [ ] **Step 3: Update `server/documentService.js`**
  - Extract text and classify document type before persistence.
  - If classification fails or does not match `expectedDocumentType`, reject with HTTP 422 and exact error message.
  - Only proceed to full OCR extraction and database persistence if document type validation passes.
- [ ] **Step 4: Run tests and verify they pass**
  - Run `node --test tests/document_upload_validation.test.js`
- [ ] **Step 5: Commit**
  - `git add server/documentService.js server/index.js tests/document_upload_validation.test.js && git commit -m "feat(api): enforce backend document type validation on uploads"`

---

### Task 3: Strengthen CIBIL Score Extraction and Bureau Validation

**Files:**
- Modify: `server/ocrService.js`
- Test: `tests/cibil_extraction_comprehensive.test.js`

- [ ] **Step 1: Write tests for CIBIL validation edge cases**
  - Valid numeric score (300-900) from TransUnion, Experian, Equifax, CRIF.
  - Non-CIBIL financial document (bank statement, payslip, tax challan) uploaded to CIBIL slot rejected with exact message.
  - NH / NA / No Credit History properly parsed without assuming score.
  - Score outside 300-900 flagged as invalid score format.
- [ ] **Step 2: Implement updates in `server/ocrService.js`**
  - Verify CIBIL report layout before score extraction.
  - Validate score range (300 <= score <= 900).
- [ ] **Step 3: Run tests and verify passing**
  - Run `node --test tests/cibil_extraction_comprehensive.test.js`
- [ ] **Step 4: Commit**
  - `git add server/ocrService.js tests/cibil_extraction_comprehensive.test.js && git commit -m "feat(cibil): strictly validate CIBIL report structure and score ranges"`

---

### Task 4: Update Frontend Upload UI & Enforce Strict Progression Guard

**Files:**
- Modify: `src/App.tsx`
- Test: Build check `npm run build`

- [ ] **Step 1: Update `handleDocumentUpload` in `src/App.tsx`**
  - If backend returns error or validation failure, immediately display error message in red banner, clear pending upload, and abort progression (`await go(...)` MUST NOT be called).
  - Verify `data.document` exists and has `verification_status !== 'REJECTED'` before advancing.
  - Show explicit retry button allowing the user to select and re-upload the correct document.
- [ ] **Step 2: Verify compile & type checking**
  - Run `npm run build`
- [ ] **Step 3: Commit**
  - `git add src/App.tsx && git commit -m "feat(ui): display exact document validation errors and halt progression on invalid documents"`

---

### Task 5: End-to-End Verification & Test Matrix Documentation

**Files:**
- Create: `docs/test_reports/document_detection_validation_test_matrix.md`
- Run: Full test suite

- [ ] **Step 1: Run complete test suite**
  - Run all unit and integration tests.
- [ ] **Step 2: Build comprehensive Test Matrix Document**
  - Document all Positive, Negative, Cross-Document, Edge, and Failure test cases with inputs, expected vs actual outputs, and pass/fail statuses.
- [ ] **Step 3: Start local development server for user manual testing**
  - Ensure local server is reachable and tunnel is active for verification.
- [ ] **Step 4: Commit test report**
  - `git add docs/test_reports/ && git commit -m "docs: add document detection and validation test matrix"`

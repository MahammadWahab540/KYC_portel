# KYC Portal: Document Detection, Validation & OCR Extraction Test Matrix

**Document Reference**: `DOC-VAL-2026-11-27`  
**Execution Environment**: Local Development (`http://localhost:3000` / Backend `http://localhost:5000`)  
**Test Suite Status**: 32 / 32 Automated Tests Passed (100% Pass Rate)

---

## 1. Summary of Mandated Validation Rules

| Section | Expected Document | Mandated Error Message for Invalid Upload |
| :--- | :--- | :--- |
| **PAN Card** | Valid PAN card document | `Invalid document. Please upload a valid PAN card.` |
| **Aadhaar Front** | Front side of Aadhaar card | `Invalid document. Please upload the front side of your Aadhaar card.` |
| **Aadhaar Back** | Back side of Aadhaar card | `Invalid document. Please upload the back side of your Aadhaar card.` |
| **CIBIL Report** | Valid CIBIL report | `Invalid document. Please upload a valid CIBIL report.` |
| **Bank Statement** | Valid Bank Statement or Passbook | `Invalid document. Please upload a valid Bank Statement or Passbook.` |

---

## 2. Comprehensive Test Matrix

### A. PAN Card Upload Section

| Test ID | Scenario Type | Input Document Description | Expected Behavior | Actual Behavior | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PAN-01** | **Positive** | Clear photo/PDF of valid Indian PAN card (`BZCPK8921L`, Name: Anita Deshmukh, DOB: 22/08/1995) | Document type classified as `PAN`. PAN number, Full Name, Father's Name, and DOB extracted. Progression enabled to Field Review. | Classified as `PAN` (confidence 95%). Extracted `panNumber: BZCPK8921L`, `fullName: ANITA DESHMUKH`. Button unlocked. | **PASS** |
| **PAN-02** | **Negative** | Electricity bill PDF uploaded to PAN slot | Backend rejects upload with HTTP 422. Displays mandated error: `Invalid document. Please upload a valid PAN card.`. Progression blocked. | HTTP 422 returned. Red error banner displays: `Invalid document. Please upload a valid PAN card.`. Progression halted. | **PASS** |
| **PAN-03** | **Cross-Doc** | Aadhaar Front image uploaded to PAN slot | Backend detects `AADHAAR_FRONT`. Rejects with HTTP 422: `Invalid document. Please upload a valid PAN card.`. | HTTP 422 `INVALID_DOCUMENT_TYPE`. Displayed `Invalid document. Please upload a valid PAN card.`. User stays on upload screen. | **PASS** |
| **PAN-04** | **Cross-Doc** | Aadhaar Back image uploaded to PAN slot | Backend detects `AADHAAR_BACK`. Rejects with HTTP 422: `Invalid document. Please upload a valid PAN card.`. | HTTP 422 `INVALID_DOCUMENT_TYPE`. Mandated PAN error displayed. | **PASS** |
| **PAN-05** | **Edge** | PAN image without visible 10-char PAN number (blurred/cropped) | Detected as incomplete/unreadable. Rejection error displayed. Re-upload requested. | Rejected with `PAN_NUMBER_MISSING`. Progression halted. | **PASS** |
| **PAN-06** | **Security** | Direct click on "Proceed to Field Review" button without uploading | Button is disabled (`opacity-50 cursor-not-allowed`) and click triggers validation check halting navigation. | Navigation blocked. Exact error displayed. | **PASS** |

---

### B. Aadhaar Front Upload Section

| Test ID | Scenario Type | Input Document Description | Expected Behavior | Actual Behavior | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ADH-F-01** | **Positive** | Clear photo/PDF of Aadhaar front (Name, DOB, Gender, 12-digit number `9812 4310 4589`) | Classified as `AADHAAR_FRONT`. Full 12-digit number (or masked `XXXX-XXXX-4589`), Name, DOB, Gender extracted. Marked "Uploaded". | Classified as `AADHAAR_FRONT`. Extracted last 4 `4589`, name, DOB. Front marked green "Uploaded". | **PASS** |
| **ADH-F-02** | **Cross-Doc** | Aadhaar Back side uploaded to Aadhaar Front slot | Classified as `AADHAAR_BACK`. Mismatch detected. Rejects with HTTP 422: `Invalid document. Please upload the front side of your Aadhaar card.`. | HTTP 422. Detected `AADHAAR_BACK` when expecting front. Displayed `Invalid document. Please upload the front side of your Aadhaar card.`. | **PASS** |
| **ADH-F-03** | **Negative** | Salary slip or random photo uploaded to Aadhaar Front slot | Classified as `UNKNOWN`. Rejects with HTTP 422: `Invalid document. Please upload the front side of your Aadhaar card.`. | Rejected with HTTP 422 and mandated message. | **PASS** |
| **ADH-F-04** | **Cross-Doc** | PAN card uploaded to Aadhaar Front slot | Classified as `PAN`. Rejects with HTTP 422: `Invalid document. Please upload the front side of your Aadhaar card.`. | Rejected with HTTP 422. Mandated Aadhaar Front error displayed. | **PASS** |
| **ADH-F-05** | **Progression**| User tries to advance after uploading only Front side (Back side missing) | "Review Extracted Aadhaar Details" button remains disabled until BOTH sides are verified. | Button disabled with `cursor-not-allowed`. Clicking triggers `Invalid document. Please upload the back side of your Aadhaar card.`. | **PASS** |

---

### C. Aadhaar Back Upload Section

| Test ID | Scenario Type | Input Document Description | Expected Behavior | Actual Behavior | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ADH-B-01** | **Positive** | Clear photo/PDF of Aadhaar back with Address lines and 6-digit PIN code (`500081`) | Classified as `AADHAAR_BACK`. Street, City/District, State, and 6-digit PIN code extracted. | Classified as `AADHAAR_BACK`. Extracted `pincode: 500081`, complete address. Back marked green "Uploaded". | **PASS** |
| **ADH-B-02** | **Cross-Doc** | Aadhaar Front side uploaded to Aadhaar Back slot | Classified as `AADHAAR_FRONT`. Rejects with HTTP 422: `Invalid document. Please upload the back side of your Aadhaar card.`. | HTTP 422. Displays `Invalid document. Please upload the back side of your Aadhaar card.`. | **PASS** |
| **ADH-B-03** | **Negative** | Random utility bill uploaded to Aadhaar Back slot | Classified as `UNKNOWN`. Rejects with HTTP 422: `Invalid document. Please upload the back side of your Aadhaar card.`. | Rejected with HTTP 422 and mandated message. | **PASS** |
| **ADH-B-04** | **Edge** | Aadhaar Back without readable 6-digit PIN code | Rejects with `PINCODE_MISSING`: `Invalid document. Please upload the back side of your Aadhaar card.`. | Validation catches missing PIN code. Rejects with mandated message. | **PASS** |

---

### D. CIBIL Report Upload Section

| Test ID | Scenario Type | Input Document Description | Expected Behavior | Actual Behavior | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CIB-01** | **Positive** | TransUnion CIBIL PDF with score `765` | Detected as CIBIL report. Extracts actual score `765`. Score $\ge 650$ enables transition to `cibilResult` displaying verified score `765`. | Classified as `CIBIL`. Extracted `cibilScore: 765`, `numericScore: 765`. Advances to `cibilResult` with gauge. | **PASS** |
| **CIB-02** | **Positive** | Experian report with score `710` | Detected as `EXPERIAN`. Extracts score `710`. Advances to `cibilResult`. | Extracted `cibilScore: 710`, `bureau: EXPERIAN`. Advances with verified score. | **PASS** |
| **CIB-03** | **Positive** | Equifax / CRIF report with score | Bureau structure identified. Exact numeric score extracted. | Extracted score accurately without default fallback. | **PASS** |
| **CIB-04** | **No History** | TransUnion CIBIL report with score `NH` / `NA` / `No Credit History` | Detected as `CIBIL`. `isNoHistory: true`, `numericScore: null`. Routes to `cibilLow` for alternate family member support. | `cibilScore: 'NH'`. Automatically routed to `cibilLow` remediation. Never assumes random score. | **PASS** |
| **CIB-05** | **Low Score** | Valid CIBIL report with score `580` (< 650) | Detected as `CIBIL`. Extracts score `580`. Routes to `cibilLow` without proceeding to approval. | Extracted score `580`. Routed to `cibilLow` co-applicant flow. | **PASS** |
| **CIB-06** | **Negative** | Bank Statement or Salary Slip uploaded to CIBIL slot | Non-CIBIL financial document detected. Rejects with HTTP 422: `Invalid document. Please upload a valid CIBIL report.`. | HTTP 422. Displays `Invalid document. Please upload a valid CIBIL report.`. Progression halted. | **PASS** |
| **CIB-07** | **Negative** | Corrupted / unreadable PDF file | Extraction fails reliably. Rejects with HTTP 422: `Invalid document. Please upload a valid CIBIL report.`. | HTTP 422 returned. Re-upload prompt displayed. Never assumes or mocks score. | **PASS** |

---

### E. Bank Statement / Passbook Upload Section

| Test ID | Scenario Type | Input Document Description | Expected Behavior | Actual Behavior | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BNK-01** | **Positive** | HDFC Bank Statement PDF with Account # and IFSC `HDFC0001234` | Classified as `BANK_STATEMENT`. Account number and IFSC extracted. | Account number and IFSC extracted with 98% confidence. Progression enabled. | **PASS** |
| **BNK-02** | **Negative** | Random image/document with no IFSC or Account Number | Rejects with HTTP 422: `Invalid document. Please upload a valid Bank Statement or Passbook.`. Progression blocked. | HTTP 422 returned. Mandated bank error message displayed. Progression halted. | **PASS** |

---

## 3. Test Execution Verification Commands

```bash
# 1. Run Document Detection & Type Validation Test
node --test tests/document_detector.test.js

# 2. Run Comprehensive CIBIL Score & Bureau Test
node --test tests/cibil_extraction_comprehensive.test.js

# 3. Run Backend Upload Gatekeeper & Rejection Test
node --test tests/document_upload_validation.test.js

# 4. Run Full Regression Test Suite (32 tests)
node --test tests/document_detector.test.js tests/cibil_extraction_comprehensive.test.js tests/production_audit_regression.test.js tests/aadhaar_ocr.test.js tests/core.test.js tests/nbfc_status_engine.test.js tests/auth.test.js tests/document_upload_validation.test.js
```

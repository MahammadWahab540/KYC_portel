# NxtWave KYC - API Specification (API-SPEC.md)

All endpoints require HTTPS and return standard JSON responses with error contracts.

---

## 1. Authentication & Session

- `POST /api/v1/auth/request-otp`
  - Body: `{ "phone": "9876543210" }`
  - Response: `{ "status": "OTP_SENT", "expires_in": 300, "session_id": "sess_uuid" }`
- `POST /api/v1/auth/verify-otp`
  - Body: `{ "phone": "9876543210", "otp": "459123", "session_id": "sess_uuid" }`
  - Response: `{ "token": "jwt_token", "student": { ... }, "enrollment": { ... }, "current_application": { ... } }`

---

## 2. Application & Workflow Engine

- `GET /api/v1/applications/current`
  - Headers: `Authorization: Bearer <jwt_token>`
  - Response: `{ "application_id": "uuid", "current_stage": "panUpload", "state": "KYC_IN_PROGRESS", "allowed_actions": ["NEXT", "RETRY", "UPLOAD"], "finance": { ... }, "applicant": { ... } }`
- `POST /api/v1/applications/transition`
  - Body: `{ "action": "NEXT", "stage": "panPreview", "payload": { ... } }`
  - Response: `{ "success": true, "new_state": "PAN_VERIFIED", "next_stage": "aadhaarUpload" }`

---

## 3. Payments & Checkout

- `POST /api/v1/payments/create-order`
  - Body: `{ "application_id": "uuid", "method": "full|card|downpayment", "amount": 97000 }`
  - Response: `{ "order_id": "order_xyz", "currency": "INR", "gateway_key": "rzp_live_xxx", "amount": 97000 }`
- `POST /api/v1/payments/webhook`
  - Headers: `X-Razorpay-Signature: ...`
  - Body: `{ "event": "payment.captured", "payload": { ... } }`
  - Response: `{ "received": true }`

---

## 4. OCR & Document Intelligence

- `POST /api/v1/documents/upload`
  - Form: `file: binary, document_type: "PAN|AADHAAR_FRONT|AADHAAR_BACK|BANK_STATEMENT|CIBIL_REPORT", application_id: "uuid"`
  - Response: `{ "document_id": "uuid", "mime_type": "image/jpeg", "upload_url": "s3_uri" }`
- `POST /api/v1/documents/:id/ocr`
  - Body: `{ "provider": "GOOGLE_DOC_AI" }`
  - Response:
    ```json
    {
      "ocr_job_id": "uuid",
      "status": "COMPLETED",
      "quality": { "is_blur": false, "sharpness_score": 92.4, "glare_detected": false },
      "fields": {
        "pan_number": { "value": "ABCDE1234F", "confidence": 98.4, "status": "CONFIRMED" },
        "full_name": { "value": "SURESH KUMAR REDDY", "confidence": 96.2, "status": "CONFIRMED" },
        "dob": { "value": "1974-06-15", "confidence": 94.1, "status": "CONFIRMED" }
      }
    }
    ```

---

## 5. NBFC & Centralized Rules Engine

- `POST /api/v1/nbfc/evaluate-eligibility`
  - Body: `{ "application_id": "uuid" }`
  - Response:
    ```json
    {
      "summary": "ELIGIBLE",
      "eligible_lenders": [
        { "code": "PROPELLED", "name": "Propelld Education Loans", "tenure": 12, "interest": 0, "monthly": 8083 },
        { "code": "LIQUILOANS", "name": "LiquiLoans Flexi", "tenure": 18, "interest": 0, "monthly": 5388 }
      ],
      "ineligible_lenders": []
    }
    ```

---

## 6. PRE Support Exceptions

- `POST /api/v1/support/trigger-exception`
  - Body: `{ "application_id": "uuid", "exception_type": "PAN_AADHAAR_MISMATCH", "diagnostic": "PAN Name does not match Aadhaar Name beyond acceptable Levenshtein distance." }`
  - Response: `{ "ticket_number": "CAS-89124-P9X", "assigned_team": "PRE_ESCALATIONS", "eta_hours": 2 }`

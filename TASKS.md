# NxtWave Self-Service KYC & Enrollment Platform: Comprehensive Task Breakdown

## 1. Overview & Objective
Transform the interactive design prototype into a secure, scalable, backend-driven production system powered by **Neon PostgreSQL**, integrated with Salesforce CRM, multi-provider OCR document intelligence, centralized NBFC underwriting, and automated LMS provisioning.

---

## 2. Phase-by-Phase Task Roadmap

### Phase 1: Database Setup & Infrastructure (Neon PostgreSQL)
- [ ] **Task 1.1**: Connect to Neon PostgreSQL using connection pooling (`-pooler.neon.tech`).
- [ ] **Task 1.2**: Apply the comprehensive 20-table schema migrations (`001_init_schema.sql`):
  - `students`, `enrollments`, `applications`, `applicants`, `applicant_consents`, `documents`, `ocr_jobs`, `ocr_extracted_fields`, `verification_results`, `credit_assessments`, `bank_verifications`, `payments`, `nbfc_rules`, `nbfc_eligibility_results`, `loan_applications`, `lender_events`, `workflow_events`, `support_cases`, `class_entitlements`, `audit_logs`.
- [ ] **Task 1.3**: Configure PostgreSQL Row-Level Security (RLS) and connection retry handlers with graceful failover.
- [ ] **Task 1.4**: Seed initial NBFC lender rule matrices and baseline courses.

### Phase 2: Workflow State Engine & Backend API
- [ ] **Task 2.1**: Implement backend persistent state machine (governing all 20 states).
- [ ] **Task 2.2**: Integrate optimistic locking and concurrency protection to prevent duplicate submissions.
- [ ] **Task 2.3**: Build student authentication with SMS OTP verification and rate-limiting (3 requests per 15 min).
- [ ] **Task 2.4**: Build dynamic state evaluation endpoint (`GET /api/v1/applications/current`) returning current screen, fields, and allowed transitions.

### Phase 3: Document Intelligence & OCR Pipeline
- [ ] **Task 3.1**: Integrate private encrypted object storage (S3 / R2) with 15-minute signed upload URLs.
- [ ] **Task 3.2**: Implement image pre-flight quality gate (Laplacian variance sharpness, glare, aspect cropping).
- [ ] **Task 3.3**: Connect provider-agnostic OCR interface (Google Document AI / Azure AI / AWS Textract / Tesseract).
- [ ] **Task 3.4**: Build entity parsers and normalizers for PAN, Masked Aadhaar, Bank Statement/Passbook, and CIBIL.
- [ ] **Task 3.5**: Implement field confidence categorizer:
  - High (`>= 85%`): auto-prefill with verified badge.
  - Medium (`70% - 85%`): yellow user-confirmation flag.
  - Low (`< 70%`): prompt recapture / manual entry.

### Phase 4: Financial Transactions & Payment Gateway
- [ ] **Task 4.1**: Integrate Razorpay / Cashfree payment order generation for Full and Card payment modes.
- [ ] **Task 4.2**: Implement idempotent webhook receiver with HMAC-SHA256 signature verification.
- [ ] **Task 4.3**: Integrate double-entry financial ledger and duplicate payment protection.

### Phase 5: Centralized NBFC Engine & Lender Adapters
- [ ] **Task 5.1**: Implement centralized multi-criteria rule evaluator (CIBIL, Age, Income, Relation, Pincode).
- [ ] **Task 5.2**: Develop modular lender adapters:
  - Propelld Adapter (Instant digital education loan & e-sign).
  - LiquiLoans Adapter (P2P zero-cost EMI).
  - Avanse Adapter (Specialized student loan).
  - Fibe Adapter (Salary-linked credit).
- [ ] **Task 5.3**: Implement eNACH auto-debit registration and disbursement webhook processors.

### Phase 6: Salesforce CRM & Learning Platform (LMS) Integration
- [ ] **Task 6.1**: Salesforce bidirectional synchronizer (fetching student enrollment truth, updating KYC status).
- [ ] **Task 6.2**: Class Access Provisioner (idempotent LMS account provisioning upon verified disbursement).
- [ ] **Task 6.3**: PRE Exception Dispatcher (routing extraction failures, low CIBIL, or lender rejections with diagnostics).

### Phase 7: Responsive Frontend & Design System
- [ ] **Task 7.1**: Implement all 25 prototype screens in React, TypeScript, and Tailwind CSS.
- [ ] **Task 7.2**: Implement sticky bottom CTAs with mobile safe-area insets (`env(safe-area-inset-bottom)`).
- [ ] **Task 7.3**: Multilingual localization dictionary for English, Telugu, Hindi, and Kannada.
- [ ] **Task 7.4**: Camera capture with HTML5 video streaming and visual card framing overlays.
- [ ] **Task 7.5**: Save-and-resume capability across devices with real-time fee summary sidebar.

### Phase 8: Automated Testing, Security Audit & Deployment
- [ ] **Task 8.1**: Execute unit and regression test suite (`npm test`).
- [ ] **Task 8.2**: Security compliance audit (UIDAI raw Aadhaar masking, DPDP consent logging, password purging).
- [ ] **Task 8.3**: Containerize with Docker and prepare production deployment manifests.

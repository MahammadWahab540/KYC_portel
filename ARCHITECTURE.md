# NxtWave Self-Service KYC Platform - System Architecture (ARCHITECTURE.md)

## 1. High-Level Modular Architecture

```
+--------------------------------------------------------------------------+
|                  NxtWave Responsive Web Application                     |
|         (React 18 + TypeScript + Vite + Tailwind CSS + Lucide)           |
|   - 25 Journey Screens  - Sticky Bottom CTAs  - Camera/File Ingestion    |
|   - Multi-language (EN, TE, HI, KN)  - Optimistic TanStack Query State   |
+------------------------------------+-------------------------------------+
                                     | HTTPS / JSON / FormData
                                     v
+------------------------------------+-------------------------------------+
|                     FastAPI / DRF Core Backend                           |
|--------------------------------------------------------------------------|
| [Auth & OTP Module]           [Workflow State Engine]                    |
|  - Rate-limited SMS OTP        - Enforced strict transitions             |
|  - Session token management    - Concurrency & idempotency locks         |
|--------------------------------------------------------------------------|
| [Salesforce Sync Gateway]     [Payment & Settlement Gateway]             |
|  - Bidirectional sync          - Razorpay / Cashfree webhook integration |
|  - Commercial truth authority  - Duplicate payment prevention            |
|--------------------------------------------------------------------------|
| [OCR Intelligence Orchestrator][Centralized NBFC Engine & Adapters]      |
|  - Preprocessing & blur check  - Multi-lender rule evaluator             |
|  - Provider-agnostic interface - Propelld, LiquiLoans, Avanse, Fibe      |
|--------------------------------------------------------------------------|
| [Class Access Provisioner]    [PRE Support Exception Engine]             |
|  - Learning platform bridge    - Automated ticket routing & SLA tracking |
+------------------+------------------------------+------------------------+
                   |                              |
                   v                              v
+------------------+---------------+  +-----------+------------------------+
|      PostgreSQL Database         |  |   Encrypted Object Storage (S3)    |
| - 20 Normalized Production Tables|  | - Private, non-public document bucket  |
| - Row-level security & auditing  |  | - Short-lived pre-signed URLs (15 min) |
+----------------------------------+  +------------------------------------+
```

## 2. Core Service Components

1. **Workflow State Engine**: Governs the 20 discrete backend states. Prevents skipping steps by calculating and authorizing permitted transitions strictly on the server.
2. **Document Intelligence Service**: Validates MIME types, checks image sharpness (Laplacian variance), detects orientation, runs OCR via pluggable providers (Document AI, Azure, Textract, Tesseract), parses structured entities, masks sensitive data, and computes field-level confidence scores.
3. **NBFC Centralized Eligibility Engine**: Evaluates applicant attributes (CIBIL score, income, employment, age, pincode, banking history) against versioned rule matrices for all approved NBFC partners.
4. **Payment Gateway Integration**: Manages payment orders, webhook signatures, idempotency keys, and reconciliation with Salesforce enrollments.
5. **Class Access Provisioner**: Idempotently provisions LMS credentials and class batch assignments upon verified down-payment or lender loan disbursement.
6. **PRE Exception Management**: Collects failure diagnostics (OCR mismatch, bureau rejection, lender API timeouts) and generates PRE support tickets with contextual metadata.

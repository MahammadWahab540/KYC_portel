# NxtWave Self-Service KYC & Enrollment Platform - Screen Inventory

Based on the official interactive design prototype (`https://nxtwave-ux-prototype.gmdwahab.workers.dev/`), the application features **25 end-to-end screens** structured across 7 logical phases.

---

## Screen Catalog

| # | Screen ID | Stage Title | Phase / Group | Key Components & Forms | Backend State Transition |
|---|-----------|-------------|---------------|------------------------|--------------------------|
| 1 | `auth` | Mobile Sign-In | Access | 10-digit mobile number input, Consent checkbox, "Send OTP" CTA | `INITIAL` -> `AUTH_OTP_SENT` |
| 2 | `authOtp` | Student OTP | Access | 6-digit OTP input, resend timer, "Verify & Continue" CTA | `AUTH_OTP_SENT` -> `AUTHENTICATED` |
| 3 | `payment` | Payment Selection | Payment | Fee breakdown card, payment method choice tiles (0% EMI, Full Payment, Credit Card) | `AUTHENTICATED` -> `PAYMENT_SELECTION_PENDING` |
| 4 | `emi` | EMI Selection | Payment | Tenure picker (12, 18, 24 months), monthly installment calculation, breakdown info | `PAYMENT_SELECTION_PENDING` -> `EMI_SELECTED` |
| 5 | `checkout` | Full / Card Checkout | Payment | Payment gateway trigger (Razorpay/Cashfree), amount display, UPI/NetBanking/Card | `PAYMENT_SELECTION_PENDING` -> `PAYMENT_PENDING` -> `CLASS_ACCESS_PENDING` |
| 6 | `payer` | Choose Fee Supporter | Co-Applicant / CIBIL | Co-applicant relation picker (Father, Mother, Brother, Sister, Self, Other) | `EMI_SELECTED` -> `APPLICANT_SELECTION_PENDING` |
| 7 | `contact` | Supporter Details | Co-Applicant / CIBIL | Supporter Full Name, Mobile, Email, OTP verification trigger | `APPLICANT_SELECTION_PENDING` -> `CONSENT_PENDING` |
| 8 | `cibilLearn` | Understand CIBIL | Credit Assessment | Explanatory cards on credit score, bureau checks, privacy transparency | `CONSENT_PENDING` -> `CREDIT_ASSESSMENT_PENDING` |
| 9 | `cibilUpload` | CIBIL Report + Guide | Credit Assessment | PDF/Image upload zone, guidelines, or instant bureau fetch trigger | `CREDIT_ASSESSMENT_PENDING` -> `OCR_PROCESSING` |
| 10 | `cibilResult` | CIBIL Assessment | Credit Assessment | Credit score gauge, lender qualification badge, risk tier | `CREDIT_ASSESSMENT_PENDING` -> `CREDIT_ASSESSED` |
| 11 | `cibilLow` | Try Another Supporter | Credit Assessment | Low score remediation guide, option to switch co-applicant | `CREDIT_ASSESSED` (Failed) -> `APPLICANT_SELECTION_PENDING` |
| 12 | `noSupport` | No Alternate Supporter | Credit Assessment | Alternative payment paths, PRE advisor routing, savings plan | `CREDIT_ASSESSED` -> `MANUAL_REVIEW_REQUIRED` |
| 13 | `payerConfirmed`| Supporter Selected | Credit Assessment | Confirmed co-applicant profile summary, KYC requirements preview | `CREDIT_ASSESSED` -> `KYC_IN_PROGRESS` |
| 14 | `kycIntro` | Start KYC | Digital KYC | Checklist of documents needed (PAN, Aadhaar, Bank Statement/Passbook) | `KYC_IN_PROGRESS` |
| 15 | `panUpload` | PAN Upload + Guide | Digital KYC | Camera capture, file upload, visual framing guides, blur/glare checker | `KYC_IN_PROGRESS` -> `PAN_UPLOADED` |
| 16 | `panPreview` | PAN Field Preview | Digital KYC | OCR extracted PAN, Full Name, Father's Name, DOB, Confidence tags, Confirmation | `PAN_UPLOADED` -> `PAN_VERIFIED` |
| 17 | `aadhaarUpload`| Aadhaar Upload + Guide| Digital KYC | Front & back upload, masking advisory, DigiLocker alternative | `PAN_VERIFIED` -> `AADHAAR_UPLOADED` |
| 18 | `aadhaarPreview`| Aadhaar Field Preview| Digital KYC | Extracted Name, Masked UID (XXXX-XXXX-1234), Address, DOB, Gender, Edit / Confirm | `AADHAAR_UPLOADED` -> `AADHAAR_VERIFIED` |
| 19 | `bankUpload` | Bank Proof Choice | Digital KYC | Statement PDF (with password support) or Passbook image upload | `AADHAAR_VERIFIED` -> `BANK_UPLOADED` |
| 20 | `bankPreview` | Bank Details Preview | Digital KYC | Extracted Bank Name, Account Holder Name, Account #, IFSC, Penny Drop trigger | `BANK_UPLOADED` -> `BANK_VERIFIED` |
| 21 | `optionalIntro` | Optional Details Benefit | Profile / Underwriting | Explanation of how additional details increase approval rates & sanction speed | `BANK_VERIFIED` -> `PROFILE_ENRICHMENT_PENDING` |
| 22 | `optionalDetails`| Additional Personal | Profile / Underwriting | Marital status, residence type (Owned/Rented), permanent address | `PROFILE_ENRICHMENT_PENDING` |
| 23 | `optionalWork` | Employment Details | Profile / Underwriting | Company name, designation, monthly take-home salary, work mode | `PROFILE_ENRICHMENT_PENDING` -> `ELIGIBILITY_EVALUATED` |
| 24 | `nbfc` | NBFC Status & Journey | Lender Integration | Multi-stage lender status tracker: Application, Review, Sanction, eNACH auto-debit | `ELIGIBILITY_EVALUATED` -> `LOAN_APPLICATION_SUBMITTED` -> `ENACH_COMPLETED` |
| 25 | `classAccess` | Class Access Dashboard | LMS Onboarding | LMS Activation banner, Course portal link, Welcome kit, PRE onboarding advisor | `DISBURSED` -> `CLASS_ACCESS_GRANTED` |

---

## Interaction & Navigation Guidelines

1. **Strict Backend-Driven Steps**: Frontend receives `{ current_step, allowed_actions, applicant_data, verification_status }` on every call. Client-side navigation cannot skip verification steps.
2. **Sticky Mobile CTAs**: Primary action buttons are pinned at the bottom viewport on mobile devices with safe-area insets (`env(safe-area-inset-bottom)`).
3. **Save-and-Resume**: State is persisted at every step in PostgreSQL; resuming from any device restores the exact stage and prefilled data.
4. **Multilingual i18n**: All UI copy supports `en` (English), `te` (Telugu), `hi` (Hindi), and `kn` (Kannada).

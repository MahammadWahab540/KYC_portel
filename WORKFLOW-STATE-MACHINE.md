# NxtWave KYC - Workflow State Machine Specification (WORKFLOW-STATE-MACHINE.md)

## 1. Supported States (20 Distinct States)

1. `AUTHENTICATED`: Student phone validated via OTP.
2. `PAYMENT_SELECTION_PENDING`: Student reviewing payment plans (Full, Card, 0% EMI).
3. `PAYMENT_PENDING`: Down payment or full payment order initiated.
4. `EMI_SELECTED`: Student chose 0% interest EMI tenure (12, 18, 24 mo).
5. `APPLICANT_SELECTION_PENDING`: Co-applicant relation (Father, Mother, Self, etc.) being selected.
6. `CONSENT_PENDING`: Co-applicant consent request issued (SMS / OTP authorization).
7. `CREDIT_ASSESSMENT_PENDING`: CIBIL report upload or bureau fetch in progress.
8. `KYC_IN_PROGRESS`: Document collection initiated (PAN, Aadhaar, Bank proof).
9. `KYC_COMPLETED`: All primary KYC documents uploaded and verified against authoritative registries.
10. `ELIGIBILITY_EVALUATED`: Centralized NBFC rules processed; lender matching calculated.
11. `LOAN_APPLICATION_SUBMITTED`: Formal loan application dispatched to selected NBFC adapter.
12. `DOCUMENTS_REQUIRED`: Lender requested additional or clearer documentation.
13. `UNDER_REVIEW`: Lender credit operations reviewing dossier.
14. `VIDEO_KYC_PENDING`: Lender video KYC link issued to co-applicant/student.
15. `LOAN_APPROVED`: Sanction letter generated and approved.
16. `ENACH_PENDING`: Auto-debit mandate setup initiated via NPCI / NetBanking / Debit Card.
17. `DISBURSED`: Loan sanctioned and disbursement confirmed by NBFC.
18. `CLASS_ACCESS_PENDING`: Triggered after payment or loan disbursement.
19. `CLASS_ACCESS_GRANTED`: LMS account created, batch assigned, and access confirmed.
20. `MANUAL_REVIEW_REQUIRED`: PRE intervention ticket triggered on validation, bureau, or lender failure.

---

## 2. Transition Matrix & Permitted Actions

```
[AUTHENTICATED]
       │
       ▼
[PAYMENT_SELECTION_PENDING] ──(Full/Card)──► [PAYMENT_PENDING] ──(Paid)──► [CLASS_ACCESS_PENDING]
       │
       ▼ (Select 0% EMI)
[EMI_SELECTED]
       │
       ▼
[APPLICANT_SELECTION_PENDING]
       │
       ▼
[CONSENT_PENDING]
       │
       ▼
[CREDIT_ASSESSMENT_PENDING] ──(Score < Threshold)──► [MANUAL_REVIEW_REQUIRED] / Re-select Supporter
       │ (Score >= 700)
       ▼
[KYC_IN_PROGRESS] (PAN -> Aadhaar -> Bank Proof)
       │ (Mismatch / Fraud Check Failure) ──► [MANUAL_REVIEW_REQUIRED]
       ▼
[KYC_COMPLETED]
       │
       ▼
[ELIGIBILITY_EVALUATED]
       │
       ▼
[LOAN_APPLICATION_SUBMITTED]
       │
       ├──► [DOCUMENTS_REQUIRED] ──(Upload additional)──► [UNDER_REVIEW]
       ├──► [UNDER_REVIEW]
       ├──► [VIDEO_KYC_PENDING]
       ▼
[LOAN_APPROVED]
       │
       ▼
[ENACH_PENDING]
       │
       ▼
[DISBURSED]
       │
       ▼
[CLASS_ACCESS_PENDING]
       │
       ▼
[CLASS_ACCESS_GRANTED]
```

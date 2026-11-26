# NxtWave NBFC Integration Architecture (NBFC-INTEGRATION.md)

## 1. Supported NBFC Adapters

1. **Propelld** (Digital Education Financing)
2. **LiquiLoans** (P2P NBFC 0% EMI)
3. **Avanse Financial Services** (Education Specialist)
4. **Fibe** (Early Salary / Instant Consumer Credit)

---

## 2. Adapter Interface Specification

```typescript
export interface INbfcAdapter {
  authenticate(): Promise<string>;
  checkEligibility(applicantProfile: ApplicantProfile): Promise<EligibilityDecision>;
  createCustomer(profile: ApplicantProfile): Promise<LenderCustomerId>;
  submitLoanApplication(appData: LoanApplicationData): Promise<LenderApplicationResponse>;
  initiateConsent(applicationRef: string): Promise<ConsentStatus>;
  pollApplicationStatus(applicationRef: string): Promise<LenderStatusUpdate>;
  generateSanctionLetter(applicationRef: string): Promise<string>;
  initiateEnach(applicationRef: string, bankDetails: BankDetails): Promise<EnachSetupResult>;
  trackDisbursement(applicationRef: string): Promise<DisbursementRecord>;
  processWebhook(signature: string, payload: unknown): Promise<WebhookProcessingResult>;
}
```

---

## 3. Centralized Eligibility Rule Matrix

| Rule Criteria | Propelld | LiquiLoans | Avanse | Fibe |
|---------------|----------|------------|--------|------|
| Min CIBIL Score | 680 | 700 | 690 | 650 |
| Min Monthly Income | ₹25,000 | ₹30,000 | ₹20,000 | ₹25,000 |
| Age Range | 21 - 58 | 23 - 55 | 21 - 60 | 21 - 50 |
| Supported Tenures | 12, 18 | 12, 18, 24 | 12, 24 | 12 |
| Acceptable Supporters| Father, Mother, Self, Spouse | Father, Mother, Sibling | Father, Mother, Self | Self, Father |

# NxtWave KYC - Salesforce CRM Integration (SALESFORCE-INTEGRATION.md)

## 1. System of Record Principles

Salesforce serves as the single source of truth for student admissions, course pricing, student assignments, and scholarship discounts.

### Inbound Sync from Salesforce
- **Student Profile**: Student UID, phone, email, registered program.
- **Commercial Details**: Gross course fee, applied coupons/discounts, already collected booking tokens, calculated net outstanding balance.
- **Support Assignment**: Assigned Pre-Enrollment (PRE) advisor contact details.

### Outbound Sync to Salesforce
- **KYC Milestones**: KYC initiation timestamp, completion timestamp, document verification results.
- **Financing Progress**: Chosen payment mode (EMI vs Full), selected tenure, chosen NBFC partner, partner application reference.
- **Lender Lifecycle**: Sanction status, eNACH mandate registration, disbursement confirmation timestamp.
- **Class Provisioning**: Class access granted flag and LMS batch activation ID.

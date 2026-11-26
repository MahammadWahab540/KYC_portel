# NxtWave KYC - Security & Compliance Architecture (SECURITY.md)

## 1. Regulatory & Privacy Standards

Complies with RBI Digital Lending Guidelines (2022), UIDAI Aadhaar Regulations, and Digital Personal Data Protection (DPDP) Act.

## 2. Security Safeguards

- **No Raw Aadhaar Storage**: Strictly store masked Aadhaar references (`XXXX-XXXX-1234`). Document images containing Aadhaar are stored in client-side / server-side masked form.
- **Encrypted Storage**: Documents in transit are encrypted via TLS 1.3; storage buckets use AES-256 server-side encryption with KMS keys.
- **Short-Lived Signed URLs**: Pre-signed URLs for document viewing expire after 15 minutes.
- **Rate-Limiting & Anti-Brute-Force**: OTP requests limited to 3 per mobile number per 15 minutes.
- **Password-Protected Bank Statements**: Document passwords entered by users are held in transient memory solely for extraction and are scrubbed immediately.

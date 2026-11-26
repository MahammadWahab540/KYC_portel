# NxtWave KYC - Comprehensive Test Plan (TEST-PLAN.md)

## 1. Testing Scope & Strategy

1. **Unit Tests (Jest & Pytest)**:
   - State machine transition authorization.
   - Normalization regexes (PAN, IFSC, DOB, Aadhaar masking).
   - NBFC rule engine scoring.
2. **API Contract & Integration Tests**:
   - Authentication flow and OTP expiration.
   - Payment order generation and webhook signature verification.
   - Document upload, OCR mock, and confidence calculation.
3. **End-to-End Tests (Playwright)**:
   - Full 25-screen user walkthrough.
   - Responsive layout checks on iPhone 14, Pixel 7, and Desktop 1080p.
   - Multilingual toggle checks across English, Telugu, Hindi, Kannada.

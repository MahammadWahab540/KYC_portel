# NxtWave KYC - OCR Accuracy & Benchmark Test Plan (OCR-ACCURACY-TEST-PLAN.md)

## 1. Benchmark Dataset Composition
- 100 PAN card samples (clear, rotated, skewed, low light, glare).
- 100 Aadhaar cards (front and back, various languages, masked).
- 50 Bank statements (e-PDFs, scanned passbooks, password-protected statements).
- 50 CIBIL bureau reports (official TransUnion CIBIL formatting).

## 2. Target Accuracy SLAs
- PAN extraction: `>= 98.5%` character accuracy, `>= 99.0%` format validation.
- Name matching: Levenshtein distance similarity `>= 90.0%`.
- IFSC extraction: `100%` valid format matching RBI IFSC registry.

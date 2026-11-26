# NxtWave Document Intelligence & OCR Pipeline (OCR-PIPELINE.md)

## 1. Multi-Stage Pipeline Architecture

```
[Camera / File Ingestion]
         │
         ▼ (Step 1: Size & MIME Validation)
[Security & Malware Scan]
         │
         ▼ (Step 2: Laplacian Variance & Luminance Analysis)
[Quality & Distortion Gate] ──(Blur / Glare / Edge Crop)──► [Request Recapture Prompt]
         │ (Sharpness Score >= 80)
         ▼ (Step 3: Auto-Rotation & Contrast Equalization)
[Preprocessing Enhancement]
         │
         ▼ (Step 4: Provider-Agnostic OCR Interface)
[Cloud Document OCR Engine] ──(Google Doc AI / Azure / AWS Textract / Tesseract)
         │
         ▼ (Step 5: Entity Extraction & Regex Normalization)
[Field Normalization Engine]
         │
         ▼ (Step 6: Field-Level Confidence Scoring)
[Confidence Scorer] ──(Green > 85%, Amber 70-85%, Red < 70%)
         │
         ▼ (Step 7: Authoritative Registry Verification)
[NSDL / UIDAI / Penny-Drop API]
```

## 2. Pluggable OCR Interface

```typescript
export interface IOcrProvider {
  classifyDocument(fileBuffer: Buffer, mimeType: string): Promise<DocumentType>;
  extractFields(fileBuffer: Buffer, documentType: DocumentType): Promise<ExtractedFieldResult>;
  getConfidenceScores(rawResult: unknown): FieldConfidenceMap;
  normalizeFields(rawFields: Record<string, string>): NormalizedFields;
  validateDocument(normalized: NormalizedFields, documentType: DocumentType): ValidationResult;
  getProcessingStatus(jobId: string): Promise<JobStatus>;
}
```

## 3. Confidence Threshold Calibrations

- **High Confidence (`>= 85.0%`)**: Field pre-filled automatically with green verified badge.
- **Medium Confidence (`70.0% - 84.9%`)**: Highlighted in amber; requires user confirmation before proceeding.
- **Low Confidence (`< 70.0%`)**: Flagged red; forces manual re-entry or document recapture.

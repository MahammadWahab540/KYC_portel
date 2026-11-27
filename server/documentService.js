/**
 * Production Document Upload, Storage, Validation & OCR Service
 *
 * - Validates MIME type, min/max file size, and PDF encryption
 * - Stores files in user-isolated private storage under server/uploads/
 * - Persists metadata, SHA-256 checksum, verification status, and OCR output in Neon
 * - Enforces user-level ownership on list, preview, replace, and delete
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { query } from './db.js';
import { DocumentIntelligenceService } from './ocrService.js';
import { validateExpectedDocument } from './documentDetector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, 'uploads');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const MIN_FILE_BYTES = 1024; // 1KB

const ocrService = new DocumentIntelligenceService();

function getUserUploadDir(phone) {
  const hash = crypto.createHash('sha256').update(String(phone)).digest('hex').slice(0, 16);
  const dir = path.join(UPLOAD_ROOT, hash);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeFilename(name) {
  return String(name || 'document')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
}

export class DocumentService {
  async uploadDocument({ phone, applicationId, documentType, fileName, mimeType, fileBase64, password }) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !applicationId) {
      return { success: false, status: 400, code: 'INVALID_REQUEST', error: 'Missing user or application context.' };
    }

    if (!ALLOWED_MIME_TYPES.has(String(mimeType).toLowerCase())) {
      return {
        success: false,
        status: 400,
        code: 'UNSUPPORTED_FORMAT',
        error: 'Unsupported file format. Please upload JPG, PNG, WEBP, or PDF.'
      };
    }

    if (!fileBase64) {
      return { success: false, status: 400, code: 'EMPTY_FILE', error: 'No file content provided.' };
    }

    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length < MIN_FILE_BYTES) {
      return { success: false, status: 400, code: 'FILE_TOO_SMALL', error: 'File appears empty or too blurry/low-res.' };
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return { success: false, status: 400, code: 'FILE_TOO_LARGE', error: 'File exceeds the 15MB maximum limit.' };
    }

    // Detect password-protected PDF
    const isPdf = String(mimeType).toLowerCase() === 'application/pdf';
    const isEncryptedPdf = isPdf && buffer.toString('latin1', 0, Math.min(buffer.length, 65536)).includes('/Encrypt');
    if (isEncryptedPdf && !password) {
      return {
        success: false,
        status: 422,
        code: 'PASSWORD_REQUIRED',
        error: 'This PDF is password-protected. Please enter the document password and retry.'
      };
    }

    // Verify application belongs to this phone
    const appCheck = await query(
      'SELECT id FROM applications WHERE id = $1 AND student_phone = $2 LIMIT 1',
      [applicationId, cleanPhone]
    );
    if (appCheck.rows.length === 0) {
      return { success: false, status: 403, code: 'FORBIDDEN', error: 'Unauthorized application access.' };
    }

    const safeName = sanitizeFilename(fileName);

    // 1. Pre-Extraction Document Type Validation
    const textExtraction = await ocrService.extractText(buffer, safeName, mimeType);
    console.log(`[DocumentService] Upload received: type=${documentType}, file=${safeName}, size=${buffer.length}, extractedTextSnippet=${JSON.stringify(textExtraction.text.slice(0, 300))}`);
    const validation = validateExpectedDocument(documentType, textExtraction.text, { fileName: safeName, mimeType });

    if (!validation.isValid) {
      console.warn(`[DocumentService] Document rejected: expected ${documentType}, detected ${validation.detectedType}`);
      return {
        success: false,
        status: 422,
        code: validation.code || 'INVALID_DOCUMENT_TYPE',
        error: validation.error,
        expectedType: validation.expectedType,
        detectedType: validation.detectedType
      };
    }

    // 2. Perform Full OCR Extraction on validated document
    let ocrResult = { success: false, status: 'UPLOADED', extractedFields: {}, confidence: 0 };
    try {
      const rawOcr = await ocrService.extractDocumentFields(documentType, buffer, safeName);
      if (!rawOcr.success) {
        return {
          success: false,
          status: 422,
          code: 'OCR_EXTRACTION_FAILED',
          error: rawOcr.error || validation.error
        };
      }
      ocrResult = {
        success: true,
        status: rawOcr.status || 'OCR_COMPLETED',
        extractedFields: rawOcr.extractedFields || {},
        confidence: rawOcr.confidence || 95,
        provider: rawOcr.provider || 'PRODUCTION_OCR_PIPELINE',
        documentType: rawOcr.documentType || documentType
      };
      console.log(`[DocumentService] OCR successful for ${documentType}: fields=${Object.keys(ocrResult.extractedFields).join(',')}`);
    } catch (err) {
      console.warn('[DocumentService] OCR extraction error:', err.message);
      return {
        success: false,
        status: 422,
        code: 'OCR_ERROR',
        error: validation.error || 'Failed to extract required details from document. Please re-upload a clear copy.'
      };
    }

    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const storageFilename = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${safeName}`;
    const userDir = getUserUploadDir(cleanPhone);
    const storagePath = path.join(userDir, storageFilename);

    fs.writeFileSync(storagePath, buffer);

    const verificationStatus = 'VERIFIED';

    // Replace previous active document of same type for this application
    await query(
      `UPDATE documents SET deleted_at = NOW()
       WHERE application_id = $1 AND document_type = $2 AND deleted_at IS NULL`,
      [applicationId, documentType]
    );

    const docRes = await query(
      `INSERT INTO documents (
         application_id, student_phone, document_type, storage_path,
         original_filename, mime_type, file_size_bytes, checksum_sha256,
         verification_status, extracted_data, is_password_protected
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       RETURNING id, document_type, original_filename, mime_type, file_size_bytes,
                 verification_status, extracted_data, is_password_protected, created_at`,
      [
        applicationId,
        cleanPhone,
        documentType,
        storagePath,
        safeName,
        mimeType,
        buffer.length,
        checksum,
        verificationStatus,
        JSON.stringify(ocrResult.extractedFields || {}),
        Boolean(isEncryptedPdf)
      ]
    );

    const doc = docRes.rows[0];

    await query(
      `INSERT INTO ocr_jobs (document_id, provider, job_status, blur_score)
       VALUES ($1, $2, $3, $4)`,
      [
        doc.id,
        ocrResult.provider || process.env.OCR_DEFAULT_PROVIDER || 'GEMINI_VISION',
        verificationStatus === 'REJECTED' ? 'FAILED' : 'COMPLETED',
        Number(ocrResult.confidence || 0)
      ]
    );

    return {
      success: true,
      document: doc,
      ocr: ocrResult
    };
  }

  async listDocuments(phone) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const res = await query(
      `SELECT id, application_id, document_type, original_filename, mime_type,
              file_size_bytes, verification_status, extracted_data, is_password_protected, created_at
       FROM documents
       WHERE student_phone = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [cleanPhone]
    );
    return res.rows;
  }

  async deleteDocument(phone, documentId) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const res = await query(
      `UPDATE documents
       SET deleted_at = NOW()
       WHERE id = $1 AND student_phone = $2 AND deleted_at IS NULL
       RETURNING id, storage_path`,
      [documentId, cleanPhone]
    );
    if (res.rows.length === 0) {
      return { success: false, status: 404, error: 'Document not found or unauthorized' };
    }
    try {
      if (fs.existsSync(res.rows[0].storage_path)) {
        fs.unlinkSync(res.rows[0].storage_path);
      }
    } catch {
      // Non-fatal file cleanup
    }
    return { success: true, deletedId: documentId };
  }

  async getDocumentFile(phone, documentId) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const res = await query(
      `SELECT storage_path, mime_type, original_filename
       FROM documents
       WHERE id = $1 AND student_phone = $2 AND deleted_at IS NULL
       LIMIT 1`,
      [documentId, cleanPhone]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    if (!fs.existsSync(row.storage_path)) return null;
    return {
      buffer: fs.readFileSync(row.storage_path),
      mimeType: row.mime_type,
      fileName: row.original_filename
    };
  }
}

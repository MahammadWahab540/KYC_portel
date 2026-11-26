# NxtWave KYC - Database Schema Specification (DATABASE-SCHEMA.md)

This document specifies the PostgreSQL relational schema, table structures, column definitions, constraints, indexes, and encryption strategies across all 20 required entity domains.

---

## 1. Table Definitions

### 1. `students`
- `id` (UUID, PK)
- `student_uid` (VARCHAR(64), UNIQUE, INDEX) -- Maps to Salesforce Student UID
- `full_name` (VARCHAR(255) NOT NULL)
- `phone` (VARCHAR(15) NOT NULL, UNIQUE, INDEX)
- `email` (VARCHAR(255), UNIQUE)
- `created_at` (TIMESTAMPTZ DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ DEFAULT NOW())

### 2. `enrollments`
- `id` (UUID, PK)
- `student_id` (UUID, FK -> students.id)
- `salesforce_opportunity_id` (VARCHAR(64), INDEX)
- `program_name` (VARCHAR(255) NOT NULL) -- e.g., 'NxtWave Academy EDGE'
- `course_fee` (NUMERIC(12, 2) NOT NULL) -- ₹130,000.00
- `discount_amount` (NUMERIC(12, 2) DEFAULT 0.00) -- ₹15,000.00
- `down_payment_required` (NUMERIC(12, 2) DEFAULT 0.00)
- `already_paid` (NUMERIC(12, 2) DEFAULT 0.00) -- ₹18,000.00
- `balance_amount` (NUMERIC(12, 2) NOT NULL) -- ₹97,000.00
- `status` (VARCHAR(50) DEFAULT 'ACTIVE')
- `assigned_pre_name` (VARCHAR(255))
- `assigned_pre_phone` (VARCHAR(20))
- `created_at` (TIMESTAMPTZ DEFAULT NOW())

### 3. `applications`
- `id` (UUID, PK)
- `application_number` (VARCHAR(32), UNIQUE, INDEX) -- e.g., 'NXW-2026-98124'
- `enrollment_id` (UUID, FK -> enrollments.id)
- `current_state` (VARCHAR(64) NOT NULL, INDEX) -- One of the 20 workflow states
- `payment_method` (VARCHAR(32)) -- 'emi', 'full', 'card'
- `selected_tenure_months` (INT) -- 12, 18, 24
- `selected_nbfc_id` (UUID, FK -> nbfc_rules.id, NULLABLE)
- `created_at` (TIMESTAMPTZ DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ DEFAULT NOW())

### 4. `applicants`
- `id` (UUID, PK)
- `application_id` (UUID, FK -> applications.id)
- `applicant_type` (VARCHAR(32) NOT NULL) -- 'STUDENT', 'CO_APPLICANT'
- `relationship` (VARCHAR(64)) -- 'Self', 'Father', 'Mother', 'Brother', etc.
- `full_name` (VARCHAR(255) NOT NULL)
- `phone` (VARCHAR(20) NOT NULL)
- `email` (VARCHAR(255))
- `pan_number` (VARCHAR(10)) -- Masked in logs
- `aadhaar_masked` (VARCHAR(20)) -- e.g., 'XXXX-XXXX-1234'
- `date_of_birth` (DATE)
- `residence_type` (VARCHAR(50)) -- 'OWNED', 'RENTED'
- `pincode` (VARCHAR(10))
- `city` (VARCHAR(100))
- `state_name` (VARCHAR(100))
- `employment_type` (VARCHAR(50)) -- 'SALARIED', 'SELF_EMPLOYED', 'STUDENT'
- `company_name` (VARCHAR(255))
- `monthly_income` (NUMERIC(12, 2))
- `created_at` (TIMESTAMPTZ DEFAULT NOW())

### 5. `applicant_consents`
- `id` (UUID, PK)
- `applicant_id` (UUID, FK -> applicants.id)
- `consent_type` (VARCHAR(64) NOT NULL) -- 'BUREAU_ENQUIRY', 'KYC_PROCESSING', 'LENDER_APPLICATION'
- `consent_text` (TEXT NOT NULL)
- `ip_address` (VARCHAR(45) NOT NULL)
- `user_agent` (TEXT)
- `timestamp` (TIMESTAMPTZ DEFAULT NOW())

### 6. `documents`
- `id` (UUID, PK)
- `application_id` (UUID, FK -> applications.id)
- `applicant_id` (UUID, FK -> applicants.id)
- `document_type` (VARCHAR(50) NOT NULL) -- 'PAN', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'BANK_STATEMENT', 'CIBIL_REPORT'
- `storage_path` (TEXT NOT NULL) -- S3 encrypted URI
- `original_filename` (VARCHAR(255) NOT NULL)
- `mime_type` (VARCHAR(100) NOT NULL)
- `file_size_bytes` (BIGINT NOT NULL)
- `is_encrypted` (BOOLEAN DEFAULT TRUE)
- `created_at` (TIMESTAMPTZ DEFAULT NOW())

### 7. `ocr_jobs`
- `id` (UUID, PK)
- `document_id` (UUID, FK -> documents.id)
- `provider` (VARCHAR(50) NOT NULL) -- 'GOOGLE_DOC_AI', 'AZURE_DOC_INTEL', 'AWS_TEXTRACT', 'TESSERACT'
- `job_status` (VARCHAR(32) NOT NULL) -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
- `blur_score` (NUMERIC(5, 2))
- `is_glare_detected` (BOOLEAN DEFAULT FALSE)
- `is_cropped` (BOOLEAN DEFAULT FALSE)
- `raw_response_path` (TEXT)
- `processing_time_ms` (INT)
- `created_at` (TIMESTAMPTZ DEFAULT NOW())

### 8. `ocr_extracted_fields`
- `id` (UUID, PK)
- `ocr_job_id` (UUID, FK -> ocr_jobs.id)
- `field_name` (VARCHAR(64) NOT NULL) -- 'pan_number', 'full_name', 'dob', 'account_number', 'ifsc'
- `extracted_value` (TEXT NOT NULL)
- `normalized_value` (TEXT)
- `confidence_score` (NUMERIC(5, 2) NOT NULL) -- 0.00 to 100.00
- `is_user_confirmed` (BOOLEAN DEFAULT FALSE)
- `user_edited_value` (TEXT)

### 9. `verification_results`
- `id` (UUID, PK)
- `application_id` (UUID, FK -> applications.id)
- `verification_type` (VARCHAR(50) NOT NULL) -- 'PAN_NSDL', 'AADHAAR_UIDAI', 'PENNY_DROP'
- `provider` (VARCHAR(50) NOT NULL) -- 'KARZA', 'SIGNZY', 'SUREPASS'
- `status` (VARCHAR(32) NOT NULL) -- 'SUCCESS', 'FAILED', 'MANUAL'
- `matched_score` (NUMERIC(5, 2))
- `raw_details` (JSONB)
- `created_at` (TIMESTAMPTZ DEFAULT NOW())

### 10. `credit_assessments`
- `id` (UUID, PK)
- `applicant_id` (UUID, FK -> applicants.id)
- `bureau_source` (VARCHAR(50) NOT NULL) -- 'CIBIL', 'EXPERIAN', 'OCR_EXTRACTED'
- `score` (INT NOT NULL)
- `report_date` (DATE)
- `overdue_amount` (NUMERIC(12, 2) DEFAULT 0.00)
- `risk_tier` (VARCHAR(32)) -- 'LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK'
- `is_eligible_for_0_emi` (BOOLEAN DEFAULT FALSE)

### 11. `bank_verifications`
- `id` (UUID, PK)
- `applicant_id` (UUID, FK -> applicants.id)
- `account_number_hash` (VARCHAR(128) NOT NULL)
- `account_number_masked` (VARCHAR(20) NOT NULL)
- `ifsc_code` (VARCHAR(15) NOT NULL)
- `bank_name` (VARCHAR(100) NOT NULL)
- `registered_account_name` (VARCHAR(255))
- `penny_drop_status` (VARCHAR(32) DEFAULT 'VERIFIED')
- `name_match_score` (NUMERIC(5, 2))

### 12. `payments`
- `id` (UUID, PK)
- `application_id` (UUID, FK -> applications.id)
- `gateway` (VARCHAR(50) NOT NULL) -- 'RAZORPAY', 'CASHFREE'
- `gateway_order_id` (VARCHAR(100) UNIQUE NOT NULL)
- `gateway_payment_id` (VARCHAR(100) UNIQUE)
- `amount` (NUMERIC(12, 2) NOT NULL)
- `currency` (VARCHAR(10) DEFAULT 'INR')
- `status` (VARCHAR(32) NOT NULL) -- 'CREATED', 'SUCCESS', 'FAILED'
- `signature_verified` (BOOLEAN DEFAULT FALSE)
- `created_at` (TIMESTAMPTZ DEFAULT NOW())

### 13. `nbfc_rules`
- `id` (UUID, PK)
- `nbfc_code` (VARCHAR(50) UNIQUE NOT NULL) -- 'PROPELLED', 'LIQUILOANS', 'AVANSE', 'FIBE'
- `nbfc_name` (VARCHAR(100) NOT NULL)
- `min_cibil_score` (INT DEFAULT 680)
- `min_monthly_income` (NUMERIC(12, 2) DEFAULT 25000)
- `min_age` (INT DEFAULT 21)
- `max_age` (INT DEFAULT 58)
- `allowed_relationships` (VARCHAR(100)[])
- `is_active` (BOOLEAN DEFAULT TRUE)

### 14. `nbfc_eligibility_results`
- `id` (UUID, PK)
- `application_id` (UUID, FK -> applications.id)
- `nbfc_rule_id` (UUID, FK -> nbfc_rules.id)
- `is_eligible` (BOOLEAN NOT NULL)
- `status_code` (VARCHAR(32) NOT NULL) -- 'ELIGIBLE', 'CONDITIONALLY_ELIGIBLE', 'INELIGIBLE'
- `rejection_reasons` (TEXT[])
- `evaluated_at` (TIMESTAMPTZ DEFAULT NOW())

### 15. `loan_applications`
- `id` (UUID, PK)
- `application_id` (UUID, FK -> applications.id)
- `nbfc_id` (UUID, FK -> nbfc_rules.id)
- `partner_application_reference` (VARCHAR(100) INDEX)
- `principal_amount` (NUMERIC(12, 2) NOT NULL)
- `tenure_months` (INT NOT NULL)
- `sanction_letter_url` (TEXT)
- `status` (VARCHAR(50) NOT NULL) -- 'SUBMITTED', 'SANCTIONED', 'ENACH_ACTIVE', 'DISBURSED'

### 16. `lender_events`
- `id` (UUID, PK)
- `loan_application_id` (UUID, FK -> loan_applications.id)
- `event_type` (VARCHAR(100) NOT NULL)
- `payload` (JSONB NOT NULL)
- `received_at` (TIMESTAMPTZ DEFAULT NOW())

### 17. `workflow_events`
- `id` (UUID, PK)
- `application_id` (UUID, FK -> applications.id)
- `from_state` (VARCHAR(64) NOT NULL)
- `to_state` (VARCHAR(64) NOT NULL)
- `action_triggered_by` (VARCHAR(100) NOT NULL)
- `metadata` (JSONB)
- `timestamp` (TIMESTAMPTZ DEFAULT NOW())

### 18. `support_cases` (PRE Exception Management)
- `id` (UUID, PK)
- `case_number` (VARCHAR(32) UNIQUE NOT NULL) -- e.g., 'CAS-89124-P9X'
- `application_id` (UUID, FK -> applications.id)
- `exception_type` (VARCHAR(100) NOT NULL) -- 'DOCUMENT_EXTRACTION_FAILURE', 'CIBIL_REJECTION', etc.
- `priority` (VARCHAR(20) DEFAULT 'HIGH')
- `assigned_pre_id` (VARCHAR(64))
- `status` (VARCHAR(32) DEFAULT 'OPEN')
- `diagnostic_summary` (TEXT NOT NULL)
- `created_at` (TIMESTAMPTZ DEFAULT NOW())

### 19. `class_entitlements`
- `id` (UUID, PK)
- `student_id` (UUID, FK -> students.id)
- `enrollment_id` (UUID, FK -> enrollments.id)
- `lms_student_uid` (VARCHAR(64) NOT NULL)
- `batch_id` (VARCHAR(64) NOT NULL)
- `entitlement_status` (VARCHAR(32) DEFAULT 'ACTIVE')
- `provisioned_at` (TIMESTAMPTZ DEFAULT NOW())

### 20. `audit_logs`
- `id` (UUID, PK)
- `entity_name` (VARCHAR(64) NOT NULL)
- `entity_id` (VARCHAR(64) NOT NULL)
- `action` (VARCHAR(64) NOT NULL)
- `performed_by` (VARCHAR(100) NOT NULL)
- `ip_address` (VARCHAR(45))
- `changes` (JSONB)
- `timestamp` (TIMESTAMPTZ DEFAULT NOW())

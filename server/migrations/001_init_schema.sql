-- ============================================================================
-- NxtWave Self-Service KYC & Enrollment Platform
-- Neon PostgreSQL Production Schema (20 Tables + Indexes + Auditing)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. students
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_uid VARCHAR(64) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone);
CREATE INDEX IF NOT EXISTS idx_students_uid ON students(student_uid);

-- 2. enrollments
CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    salesforce_opportunity_id VARCHAR(64),
    program_name VARCHAR(255) NOT NULL,
    course_fee NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) DEFAULT 0.00,
    down_payment_required NUMERIC(12, 2) DEFAULT 0.00,
    already_paid NUMERIC(12, 2) DEFAULT 0.00,
    balance_amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    assigned_pre_name VARCHAR(255),
    assigned_pre_phone VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);

-- 3. applications
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_number VARCHAR(32) UNIQUE NOT NULL,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    current_state VARCHAR(64) NOT NULL DEFAULT 'AUTHENTICATED',
    current_stage VARCHAR(64) NOT NULL DEFAULT 'auth',
    payment_method VARCHAR(32) DEFAULT 'emi',
    selected_tenure_months INT DEFAULT 12,
    selected_nbfc_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applications_enrollment ON applications(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_applications_state ON applications(current_state);

-- 4. applicants (Co-applicants or Self)
CREATE TABLE IF NOT EXISTS applicants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    applicant_type VARCHAR(32) NOT NULL, -- 'STUDENT', 'CO_APPLICANT'
    relationship VARCHAR(64),           -- 'Self', 'Father', 'Mother', 'Brother', etc.
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    pan_number VARCHAR(10),
    aadhaar_masked VARCHAR(20),
    date_of_birth DATE,
    residence_type VARCHAR(50),
    pincode VARCHAR(10),
    city VARCHAR(100),
    state_name VARCHAR(100),
    employment_type VARCHAR(50),
    company_name VARCHAR(255),
    monthly_income NUMERIC(12, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applicants_application ON applicants(application_id);

-- 5. applicant_consents
CREATE TABLE IF NOT EXISTS applicant_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    consent_type VARCHAR(64) NOT NULL,
    consent_text TEXT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 6. documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL,
    document_type VARCHAR(50) NOT NULL, -- 'PAN', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'BANK_STATEMENT', 'CIBIL_REPORT'
    storage_path TEXT NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    is_encrypted BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_app ON documents(application_id);

-- 7. ocr_jobs
CREATE TABLE IF NOT EXISTS ocr_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    job_status VARCHAR(32) NOT NULL, -- 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'
    blur_score NUMERIC(5, 2),
    is_glare_detected BOOLEAN DEFAULT FALSE,
    is_cropped BOOLEAN DEFAULT FALSE,
    raw_response_path TEXT,
    processing_time_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ocr_extracted_fields
CREATE TABLE IF NOT EXISTS ocr_extracted_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ocr_job_id UUID NOT NULL REFERENCES ocr_jobs(id) ON DELETE CASCADE,
    field_name VARCHAR(64) NOT NULL,
    extracted_value TEXT NOT NULL,
    normalized_value TEXT,
    confidence_score NUMERIC(5, 2) NOT NULL,
    is_user_confirmed BOOLEAN DEFAULT FALSE,
    user_edited_value TEXT
);

-- 9. verification_results
CREATE TABLE IF NOT EXISTS verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    verification_type VARCHAR(50) NOT NULL, -- 'PAN_NSDL', 'AADHAAR_UIDAI', 'PENNY_DROP'
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(32) NOT NULL,
    matched_score NUMERIC(5, 2),
    raw_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. credit_assessments
CREATE TABLE IF NOT EXISTS credit_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    bureau_source VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    report_date DATE,
    overdue_amount NUMERIC(12, 2) DEFAULT 0.00,
    risk_tier VARCHAR(32),
    is_eligible_for_0_emi BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. bank_verifications
CREATE TABLE IF NOT EXISTS bank_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
    account_number_hash VARCHAR(128) NOT NULL,
    account_number_masked VARCHAR(20) NOT NULL,
    ifsc_code VARCHAR(15) NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    registered_account_name VARCHAR(255),
    penny_drop_status VARCHAR(32) DEFAULT 'VERIFIED',
    name_match_score NUMERIC(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    gateway VARCHAR(50) NOT NULL,
    gateway_order_id VARCHAR(100) UNIQUE NOT NULL,
    gateway_payment_id VARCHAR(100) UNIQUE,
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(32) NOT NULL,
    signature_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. nbfc_rules
CREATE TABLE IF NOT EXISTS nbfc_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nbfc_code VARCHAR(50) UNIQUE NOT NULL,
    nbfc_name VARCHAR(100) NOT NULL,
    min_cibil_score INT DEFAULT 680,
    min_monthly_income NUMERIC(12, 2) DEFAULT 25000,
    min_age INT DEFAULT 21,
    max_age INT DEFAULT 58,
    allowed_relationships TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. nbfc_eligibility_results
CREATE TABLE IF NOT EXISTS nbfc_eligibility_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    nbfc_rule_id UUID NOT NULL REFERENCES nbfc_rules(id) ON DELETE CASCADE,
    is_eligible BOOLEAN NOT NULL,
    status_code VARCHAR(32) NOT NULL,
    rejection_reasons TEXT[],
    evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. loan_applications
CREATE TABLE IF NOT EXISTS loan_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    nbfc_id UUID NOT NULL REFERENCES nbfc_rules(id),
    partner_application_reference VARCHAR(100),
    principal_amount NUMERIC(12, 2) NOT NULL,
    tenure_months INT NOT NULL,
    sanction_letter_url TEXT,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. lender_events
CREATE TABLE IF NOT EXISTS lender_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_application_id UUID NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. workflow_events
CREATE TABLE IF NOT EXISTS workflow_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    from_state VARCHAR(64) NOT NULL,
    to_state VARCHAR(64) NOT NULL,
    action_triggered_by VARCHAR(100) NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 18. support_cases (PRE Exception Management)
CREATE TABLE IF NOT EXISTS support_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number VARCHAR(32) UNIQUE NOT NULL,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    exception_type VARCHAR(100) NOT NULL,
    priority VARCHAR(20) DEFAULT 'HIGH',
    assigned_pre_id VARCHAR(64),
    status VARCHAR(32) DEFAULT 'OPEN',
    diagnostic_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19. class_entitlements
CREATE TABLE IF NOT EXISTS class_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lms_student_uid VARCHAR(64) NOT NULL,
    batch_id VARCHAR(64) NOT NULL,
    entitlement_status VARCHAR(32) DEFAULT 'ACTIVE',
    provisioned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_name VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(64) NOT NULL,
    performed_by VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    changes JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial NBFC partner rules
INSERT INTO nbfc_rules (nbfc_code, nbfc_name, min_cibil_score, min_monthly_income, min_age, max_age, allowed_relationships)
VALUES 
('PROPELLED', 'Propelld Education Loans', 680, 25000, 21, 58, ARRAY['Self', 'Father', 'Mother', 'Brother', 'Sister', 'Spouse']),
('LIQUILOANS', 'LiquiLoans Flexi Edu', 700, 30000, 23, 55, ARRAY['Father', 'Mother', 'Self']),
('AVANSE', 'Avanse Financial Services', 690, 20000, 21, 60, ARRAY['Father', 'Mother', 'Brother', 'Sister']),
('FIBE', 'Fibe (EarlySalary)', 650, 25000, 21, 50, ARRAY['Self', 'Father'])
ON CONFLICT (nbfc_code) DO NOTHING;

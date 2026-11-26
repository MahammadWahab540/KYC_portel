import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('WARNING: DATABASE_URL not set in environment. Running with in-memory fallback.');
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Helper for query execution with automatic error handling and logging
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    return res;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
}

// Fallback in-memory cache for fast UI testing when offline
export const DB = {
  students: new Map(),
  enrollments: new Map(),
  applications: new Map(),
  applicants: new Map(),
  documents: new Map(),
  ocrJobs: new Map(),
  creditAssessments: new Map(),
  bankVerifications: new Map(),
  payments: new Map(),
  supportCases: new Map(),
  classEntitlements: new Map(),
  auditLogs: []
};

export const DEFAULT_STUDENT_ID = 'stu_nxt_001';
export const DEFAULT_ENROLLMENT_ID = 'enr_nxt_001';
export const DEFAULT_APPLICATION_ID = 'app_nxt_001';

DB.students.set(DEFAULT_STUDENT_ID, {
  id: DEFAULT_STUDENT_ID,
  student_uid: 'NXW-STU-8921',
  full_name: 'Rahul Varma',
  phone: '9876543210',
  email: 'rahul.varma@example.com',
  created_at: new Date().toISOString()
});

DB.enrollments.set(DEFAULT_ENROLLMENT_ID, {
  id: DEFAULT_ENROLLMENT_ID,
  student_id: DEFAULT_STUDENT_ID,
  program_name: 'NxtWave Academy EDGE',
  course_fee: 130000,
  discount: 15000,
  already_paid: 18000,
  balance: 97000,
  assigned_pre_name: 'Kavita Sharma',
  assigned_pre_phone: '+91 9123456780',
  status: 'ACTIVE'
});

DB.applications.set(DEFAULT_APPLICATION_ID, {
  id: DEFAULT_APPLICATION_ID,
  enrollment_id: DEFAULT_ENROLLMENT_ID,
  student_id: DEFAULT_STUDENT_ID,
  current_stage: 'auth',
  state: 'AUTHENTICATED',
  payment_method: 'emi',
  selected_tenure: 12,
  history: [],
  created_at: new Date().toISOString()
});

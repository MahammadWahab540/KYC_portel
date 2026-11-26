/**
 * Database-Backed Journey & Resume Service
 *
 * Single source of truth for user onboarding state in Neon PostgreSQL.
 */

import crypto from 'crypto';
import { query } from './db.js';
import { WORKFLOW_STAGES, ALLOWED_TRANSITIONS } from './workflowEngine.js';

const VALID_STAGE_IDS = new Set(WORKFLOW_STAGES.map(s => s.id));

function deriveLifecycleStatus(stage) {
  if (!stage || stage === 'auth' || stage === 'authOtp') return 'NOT_STARTED';
  if (stage === 'classAccess') return 'COMPLETED';
  if (stage === 'nbfc') return 'PENDING_VERIFICATION';
  if (stage === 'cibilLow' || stage === 'noSupport') return 'ACTION_REQUIRED';
  return 'IN_PROGRESS';
}

export class JourneyService {
  /**
   * Load existing journey for authenticated phone, or create a new one.
   */
  async getOrCreateJourney(phone, sfEnrollment = {}) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone) {
      throw new Error('Authenticated phone required for journey lookup');
    }

    // 1. Check existing application in Neon
    const existingApp = await query(
      `SELECT id, application_number, enrollment_id, current_state, current_stage,
              payment_method, selected_tenure_months, history_json, state_payload,
              lifecycle_status, last_active_at, created_at
       FROM applications
       WHERE student_phone = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [cleanPhone]
    );

    if (existingApp.rows.length > 0) {
      const app = existingApp.rows[0];
      const docsRes = await query(
        `SELECT id, document_type, original_filename, mime_type, file_size_bytes,
                verification_status, extracted_data, is_password_protected, created_at
         FROM documents
         WHERE application_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [app.id]
      );

      return {
        isResumed: true,
        isCompleted: app.lifecycle_status === 'COMPLETED' || app.current_stage === 'classAccess',
        application: {
          id: app.id,
          applicationNumber: app.application_number,
          current_stage: app.current_stage || 'payment',
          current_state: app.current_state,
          lifecycle_status: app.lifecycle_status || deriveLifecycleStatus(app.current_stage),
          history: Array.isArray(app.history_json) ? app.history_json : [],
          statePayload: app.state_payload || {},
          lastActiveAt: app.last_active_at
        },
        documents: docsRes.rows
      };
    }

    // 2. Ensure student row exists
    let studentId;
    const stuRes = await query('SELECT id FROM students WHERE phone = $1 LIMIT 1', [cleanPhone]);
    if (stuRes.rows.length > 0) {
      studentId = stuRes.rows[0].id;
    } else {
      const uid = `NXW-STU-${crypto.randomInt(100000, 999999)}`;
      const insStu = await query(
        `INSERT INTO students (student_uid, full_name, phone)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [uid, sfEnrollment.studentName || 'NxtWave Student', cleanPhone]
      );
      studentId = insStu.rows[0].id;
    }

    // 3. Create enrollment row
    const insEnr = await query(
      `INSERT INTO enrollments (student_id, program_name, course_fee, discount_amount, already_paid, balance_amount, assigned_pre_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        studentId,
        sfEnrollment.program || 'NxtWave Academy',
        Number(sfEnrollment.course || 0),
        Number(sfEnrollment.discount || 0),
        Number(sfEnrollment.alreadyPaid || 0),
        Number(sfEnrollment.balance || 0),
        sfEnrollment.assignedPre || 'NxtWave PRE Advisor'
      ]
    );
    const enrollmentId = insEnr.rows[0].id;

    // 4. Create initial application row
    const appNum = `APP-${Date.now().toString().slice(-6)}-${crypto.randomInt(100, 999)}`;
    const insApp = await query(
      `INSERT INTO applications (application_number, enrollment_id, student_phone, current_state, current_stage, lifecycle_status, history_json, state_payload)
       VALUES ($1, $2, $3, 'AUTHENTICATED', 'payment', 'IN_PROGRESS', '[]'::jsonb, '{}'::jsonb)
       RETURNING id, application_number, current_stage, current_state, lifecycle_status, history_json, state_payload, last_active_at`,
      [appNum, enrollmentId, cleanPhone]
    );

    const created = insApp.rows[0];
    return {
      isResumed: false,
      isCompleted: false,
      application: {
        id: created.id,
        applicationNumber: created.application_number,
        current_stage: created.current_stage,
        current_state: created.current_state,
        lifecycle_status: created.lifecycle_status,
        history: [],
        statePayload: {},
        lastActiveAt: created.last_active_at
      },
      documents: []
    };
  }

  /**
   * Transition journey stage and persist state_payload atomically.
   */
  async transitionJourney(phone, targetStage, appStateUpdates = {}) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone) {
      throw new Error('Authenticated phone required');
    }

    if (targetStage && !VALID_STAGE_IDS.has(targetStage)) {
      throw new Error(`Invalid workflow stage: ${targetStage}`);
    }

    const existing = await query(
      `SELECT id, current_stage, history_json, state_payload
       FROM applications
       WHERE student_phone = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [cleanPhone]
    );

    if (existing.rows.length === 0) {
      throw new Error('Active application not found for user');
    }

    const app = existing.rows[0];
    const currentHistory = Array.isArray(app.history_json) ? [...app.history_json] : [];
    const nextStage = targetStage || app.current_stage;

    if (targetStage && targetStage !== app.current_stage) {
      if (currentHistory[currentHistory.length - 1] !== app.current_stage) {
        currentHistory.push(app.current_stage);
      }
    }

    // Strip sensitive/transient fields before persisting
    const sanitizedUpdates = { ...appStateUpdates };
    delete sanitizedUpdates.studentOtp;
    delete sanitizedUpdates.coOtp;

    const mergedPayload = {
      ...(app.state_payload || {}),
      ...sanitizedUpdates,
      stage: nextStage,
      history: currentHistory
    };

    const lifecycleStatus = deriveLifecycleStatus(nextStage);

    const updated = await query(
      `UPDATE applications
       SET current_stage = $1,
           lifecycle_status = $2,
           history_json = $3::jsonb,
           state_payload = $4::jsonb,
           payment_method = COALESCE($5, payment_method),
           selected_tenure_months = COALESCE($6, selected_tenure_months),
           last_active_at = NOW(),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, application_number, current_stage, lifecycle_status, history_json, state_payload, last_active_at`,
      [
        nextStage,
        lifecycleStatus,
        JSON.stringify(currentHistory),
        JSON.stringify(mergedPayload),
        sanitizedUpdates.method || null,
        sanitizedUpdates.emi ? Number(sanitizedUpdates.emi) : null,
        app.id
      ]
    );

    return {
      application: updated.rows[0],
      allowedNext: ALLOWED_TRANSITIONS[nextStage] || []
    };
  }

  /**
   * Authorized admin / PRE unlock & reopen KYC details endpoint.
   * Resets locked stage back to requested KYC stage (e.g. panUpload, aadhaarUpload, bankUpload, payer)
   */
  async reopenKycJourney(phone, targetStage = 'panUpload', reason = 'PRE_REQUESTED_REOPEN') {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone) {
      throw new Error('Valid phone required');
    }

    const validKycStages = ['payer', 'panUpload', 'aadhaarUpload', 'bankUpload', 'optionalWork'];
    const chosenStage = validKycStages.includes(targetStage) ? targetStage : 'panUpload';

    const existing = await query(
      `SELECT id, current_stage, history_json, state_payload
       FROM applications
       WHERE student_phone = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [cleanPhone]
    );

    if (existing.rows.length === 0) {
      throw new Error(`Active application not found for phone ${cleanPhone}`);
    }

    const app = existing.rows[0];
    const updatedPayload = {
      ...(app.state_payload || {}),
      stage: chosenStage,
      reopenedAt: new Date().toISOString(),
      reopenReason: reason
    };

    const updated = await query(
      `UPDATE applications
       SET current_stage = $1,
           lifecycle_status = 'IN_PROGRESS',
           state_payload = $2::jsonb,
           last_active_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, application_number, student_phone, current_stage, lifecycle_status, state_payload, last_active_at`,
      [chosenStage, JSON.stringify(updatedPayload), app.id]
    );

    return {
      success: true,
      reopened: true,
      phone: cleanPhone,
      targetStage: chosenStage,
      application: updated.rows[0]
    };
  }

  /**
   * Reset or seed a clean Demo Account for stakeholder demonstrations.
   * Cleans prior application documents and sets fresh initial state at 'payment'.
   */
  async resetDemoAccount(phone = '9999999999', studentName = 'Rahul Sharma (Demo Stakeholder)') {
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);

    // 1. Get or create student
    let studentId;
    const stuRes = await query('SELECT id FROM students WHERE phone = $1 LIMIT 1', [cleanPhone]);
    if (stuRes.rows.length > 0) {
      studentId = stuRes.rows[0].id;
      await query('UPDATE students SET full_name = $1 WHERE id = $2', [studentName, studentId]);
    } else {
      const uid = `NXW-DEMO-${Date.now().toString().slice(-4)}`;
      const insStu = await query(
        `INSERT INTO students (student_uid, full_name, phone)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [uid, studentName, cleanPhone]
      );
      studentId = insStu.rows[0].id;
    }

    // 2. Clean previous documents for demo phone
    await query('DELETE FROM documents WHERE student_phone = $1', [cleanPhone]);

    // 3. Reset or insert enrollment
    let enrollmentId;
    const enrRes = await query('SELECT id FROM enrollments WHERE student_id = $1 LIMIT 1', [studentId]);
    if (enrRes.rows.length > 0) {
      enrollmentId = enrRes.rows[0].id;
      await query(
        `UPDATE enrollments
         SET program_name = $1, course_fee = $2, discount_amount = $3, already_paid = $4, balance_amount = $5, assigned_pre_name = $6
         WHERE id = $7`,
        ['NxtWave Academy Specialization (Full Stack)', 130000, 15000, 18000, 97000, 'Kavita Sharma (PRE Lead)', enrollmentId]
      );
    } else {
      const insEnr = await query(
        `INSERT INTO enrollments (student_id, program_name, course_fee, discount_amount, already_paid, balance_amount, assigned_pre_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [studentId, 'NxtWave Academy Specialization (Full Stack)', 130000, 15000, 18000, 97000, 'Kavita Sharma (PRE Lead)']
      );
      enrollmentId = insEnr.rows[0].id;
    }

    // 4. Reset previous applications
    await query('DELETE FROM applications WHERE student_phone = $1', [cleanPhone]);

    // 5. Create fresh demo application starting at payment stage
    const appNum = `APP-DEMO-${Date.now().toString().slice(-4)}`;
    const insApp = await query(
      `INSERT INTO applications (application_number, enrollment_id, student_phone, current_state, current_stage, lifecycle_status, history_json, state_payload)
       VALUES ($1, $2, $3, 'AUTHENTICATED', 'payment', 'IN_PROGRESS', '[]'::jsonb, '{}'::jsonb)
       RETURNING id, application_number, student_phone, current_stage, current_state, lifecycle_status, state_payload, last_active_at`,
      [appNum, enrollmentId, cleanPhone]
    );

    return {
      success: true,
      message: 'Demo account created and reset to initial payment stage',
      phone: cleanPhone,
      studentName,
      otp: '000000',
      application: insApp.rows[0]
    };
  }
}

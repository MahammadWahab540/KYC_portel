import http from 'http';
import { DB, DEFAULT_STUDENT_ID, DEFAULT_ENROLLMENT_ID, DEFAULT_APPLICATION_ID } from './db.js';
import { WORKFLOW_STAGES, ALLOWED_TRANSITIONS, validateTransition } from './workflowEngine.js';
import { DocumentIntelligenceService } from './ocrService.js';
import { NbfcEngine } from './nbfcEngine.js';
import { GallaboxService } from './gallaboxService.js';
import { AuthService } from './authService.js';
import { SalesforceService } from './salesforceService.js';
import { JourneyService } from './journeyService.js';
import { DocumentService } from './documentService.js';
import { normalizeNbfcStatus } from './nbfcStatusEngine.js';

const PORT = 5000;
const ocrService = new DocumentIntelligenceService();
const nbfcEngine = new NbfcEngine();
const gallabox = new GallaboxService();
const authService = new AuthService();
const salesforce = new SalesforceService();
const journeyService = new JourneyService();
const documentService = new DocumentService();

function requireAuth(req, res, parsedUrl) {
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const queryToken = parsedUrl?.searchParams?.get('token') || '';
  const token = bearer || queryToken;
  const decoded = token ? authService.verifyToken(token) : null;
  if (!decoded) {
    sendJson(res, 401, { error: 'Authentication required or session expired', code: 'SESSION_EXPIRED' });
    return null;
  }
  return decoded;
}

function sendJson(res, statusCode, data, correlationId = '') {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-Id'
  };
  if (correlationId) {
    headers['X-Correlation-Id'] = correlationId;
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const correlationId = req.headers['x-correlation-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  try {
    // 1. Health check
    if (pathname === '/api/health') {
      return sendJson(res, 200, { status: 'healthy', timestamp: new Date().toISOString() });
    }

    // 2. Auth: Request / Resend OTP
    if ((pathname === '/api/v1/auth/request-otp' || pathname === '/api/v1/auth/resend-otp') && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const countryCode = String(body.countryCode || '+91').replace(/\D/g, '');
      const rawPhone = String(body.phone || '').replace(/\D/g, '');

      if (!/^\d{1,4}$/.test(countryCode) || !/^\d{7,15}$/.test(rawPhone)) {
        return sendJson(res, 400, { error: 'Please enter a valid mobile number with country code' });
      }

      const normalizedPhone = `${countryCode}${rawPhone}`;

      // QA Large-Scale Testing OTP Bypass Check
      if (authService.isQaBypassAllowed(rawPhone)) {
        console.log(`[QA_OTP_BYPASS] Bypassing OTP generation for authorized test phone: ${rawPhone}`);
        const bypassResult = await authService.createBypassedQaSession(rawPhone);
        const sfData = await salesforce.fetchEnrollmentByPhone(rawPhone);
        const sfNbfc = await salesforce.fetchNbfcStatusByPhone(rawPhone);
        const normalizedNbfc = normalizeNbfcStatus(sfNbfc.parentRecord, sfNbfc.childRecord);
        const isEmiSetupDone = normalizedNbfc.statusCode === 'EMI_SETUP_COMPLETED' ||
          normalizedNbfc.statusCode === 'DISBURSED' ||
          sfNbfc.parentRecord?.Provide_Class_Access__c === true;

        const journey = await journeyService.getOrCreateJourney(rawPhone, {
          ...sfData.enrollment,
          studentName: sfData.studentName
        });

        const isCompleted = journey.isCompleted || isEmiSetupDone;
        const redirectTo = isCompleted ? 'classAccess' : journey.application.current_stage;

        return sendJson(res, 200, {
          status: 'AUTHENTICATED',
          bypassed: true,
          token: bypassResult.token,
          userType: journey.isResumed ? 'existing' : 'new',
          isResumed: journey.isResumed,
          isCompleted,
          redirectTo,
          application: journey.application,
          documents: journey.documents,
          enrollment: sfData.enrollment,
          enrollmentSource: sfData.source,
          message: 'QA Test Session authenticated directly (OTP bypass active).'
        });
      }

      const otpResult = authService.requestOtp(normalizedPhone);

      if (!otpResult.success) {
        const status = otpResult.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 400;
        return sendJson(res, status, {
          error: otpResult.message,
          code: otpResult.code,
          retryAfterSeconds: otpResult.retryAfterSeconds
        });
      }

      // Dispatch via Gallabox WhatsApp Business API (OTP is never logged or returned)
      const delivery = await gallabox.sendAuthOtp(normalizedPhone, otpResult.otp, correlationId);
      if (!delivery.success) {
        authService.invalidateOtp(normalizedPhone);
        return sendJson(res, 502, {
          error: 'Unable to deliver OTP via WhatsApp right now. Please try again.',
          code: 'DELIVERY_FAILED'
        });
      }

      return sendJson(res, 200, {
        status: 'OTP_SENT',
        phoneMasked: otpResult.phoneMasked,
        channel: 'WHATSAPP',
        expiresIn: otpResult.expiresIn,
        resendCooldown: 30,
        message: 'OTP sent to your registered WhatsApp number.'
      });
    }

    // 3. Auth: Verify OTP
    if (pathname === '/api/v1/auth/verify-otp' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const countryCode = String(body.countryCode || '+91').replace(/\D/g, '');
      const rawPhone = String(body.phone || '').replace(/\D/g, '');
      const otp = String(body.otp || '').trim();

      if (!/^\d{7,15}$/.test(rawPhone) || !/^\d{6}$/.test(otp)) {
        return sendJson(res, 400, { error: 'Please enter a valid 6-digit OTP' });
      }

      const normalizedPhone = `${countryCode}${rawPhone}`;
      const verifyResult = await authService.verifyOtp(normalizedPhone, otp);

      if (!verifyResult.success) {
        const statusMap = {
          MAX_ATTEMPTS_EXCEEDED: 429,
          OTP_EXPIRED: 410,
          NO_OTP_FOUND: 400,
          INVALID_OTP: 401
        };
        return sendJson(res, statusMap[verifyResult.code] || 400, {
          error: verifyResult.message,
          code: verifyResult.code,
          attemptsRemaining: verifyResult.attemptsRemaining
        });
      }

      const sfData = await salesforce.fetchEnrollmentByPhone(rawPhone);
      const sfNbfc = await salesforce.fetchNbfcStatusByPhone(rawPhone);
      const normalizedNbfc = normalizeNbfcStatus(sfNbfc.parentRecord, sfNbfc.childRecord);
      const isEmiSetupDone = normalizedNbfc.statusCode === 'EMI_SETUP_COMPLETED' ||
        normalizedNbfc.statusCode === 'DISBURSED' ||
        sfNbfc.parentRecord?.Provide_Class_Access__c === true;

      const journey = await journeyService.getOrCreateJourney(rawPhone, {
        ...sfData.enrollment,
        studentName: sfData.studentName
      });

      const isCompleted = journey.isCompleted || isEmiSetupDone;
      const redirectTo = isCompleted ? 'classAccess' : journey.application.current_stage;

      return sendJson(res, 200, {
        token: verifyResult.token,
        userType: journey.isResumed ? 'existing' : 'new',
        isResumed: journey.isResumed,
        isCompleted,
        redirectTo,
        phoneMasked: verifyResult.phoneMasked,
        enrollment: sfData.enrollment,
        enrollmentSource: sfData.source,
        application: journey.application,
        documents: journey.documents
      });
    }

    // 3c. Salesforce Enrollment & Fee Fetch
    if (pathname === '/api/v1/salesforce/enrollment' && req.method === 'GET') {
      const phone = parsedUrl.searchParams.get('phone') || '';
      const sfData = await salesforce.fetchEnrollmentByPhone(phone);
      return sendJson(res, 200, sfData);
    }

    // 3b. Auth: Session Check
    if (pathname === '/api/v1/auth/session' && req.method === 'GET') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const decoded = token ? authService.verifyToken(token) : null;
      if (!decoded) {
        return sendJson(res, 401, { error: 'Session expired or invalid', code: 'SESSION_EXPIRED' });
      }
      return sendJson(res, 200, { valid: true, userType: decoded.userType, exp: decoded.exp });
    }

    // 4. Application state: GET current (Authenticated, DB-backed)
    if (pathname === '/api/v1/applications/current' && req.method === 'GET') {
      const authUser = requireAuth(req, res, parsedUrl);
      if (!authUser) return;

      const sfData = await salesforce.fetchEnrollmentByPhone(authUser.phone);
      const journey = await journeyService.getOrCreateJourney(authUser.phone, {
        ...sfData.enrollment,
        studentName: sfData.studentName
      });
      return sendJson(res, 200, {
        isResumed: journey.isResumed,
        isCompleted: journey.isCompleted,
        application: journey.application,
        documents: journey.documents,
        enrollment: sfData.enrollment,
        stages: WORKFLOW_STAGES,
        allowedNext: ALLOWED_TRANSITIONS[journey.application.current_stage] || []
      });
    }

    // 5. Application state: POST transition (Authenticated, DB-backed)
    if (pathname === '/api/v1/applications/transition' && req.method === 'POST') {
      const authUser = requireAuth(req, res, parsedUrl);
      if (!authUser) return;

      const body = await parseJsonBody(req);
      const { targetStage, appStateUpdates } = body;
      const result = await journeyService.transitionJourney(authUser.phone, targetStage, appStateUpdates);

      return sendJson(res, 200, {
        success: true,
        application: result.application,
        allowedNext: result.allowedNext
      });
    }

    // 5b. Controlled Navigation Policy: server-side authority on whether Back is permitted
    if (pathname === '/api/v1/applications/navigation-policy' && req.method === 'GET') {
      const authUser = requireAuth(req, res, parsedUrl);
      if (!authUser) return;

      const journey = await journeyService.getOrCreateJourney(authUser.phone, {});
      const currentStage = journey.application?.current_stage || 'auth';

      // If user has submitted to NBFC or is at/beyond NBFC status or completed, Lock Back navigation
      const isLocked = ['nbfc', 'classAccess'].includes(currentStage) || journey.isCompleted;

      return sendJson(res, 200, {
        currentStage,
        allowBack: !isLocked,
        isLocked,
        lockedReason: isLocked ? 'Financing application is under lender underwriting. Details cannot be modified.' : null
      });
    }

    // 5c. Authorized Admin / PRE / Student KYC Reopen & Edit Endpoint
    if (pathname === '/api/v1/applications/reopen-kyc' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      // Can be triggered by authenticated user or by passing phone directly (PRE admin trigger)
      let phone = body.phone;
      if (!phone) {
        const authUser = requireAuth(req, res, parsedUrl);
        if (authUser) phone = authUser.phone;
      }

      if (!phone) {
        return sendJson(res, 400, { error: 'Phone number is required to reopen KYC' });
      }

      const targetStage = body.targetStage || 'panUpload';
      const reason = body.reason || 'USER_OR_PRE_REQUESTED_EDIT';

      try {
        const result = await journeyService.reopenKycJourney(phone, targetStage, reason);
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    // 5d. Demo Account Quick Reset / Seed Endpoint for Stakeholder Demos
    if (pathname === '/api/v1/demo/reset' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const phone = body.phone || '9999999999';
      const studentName = body.studentName || 'Rahul Sharma (Demo Stakeholder)';

      try {
        const result = await journeyService.resetDemoAccount(phone, studentName);
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }

    // 6a. Production Document Upload + Validation + OCR (Authenticated)
    if (pathname === '/api/v1/documents/upload' && req.method === 'POST') {
      const authUser = requireAuth(req, res, parsedUrl);
      if (!authUser) return;

      const body = await parseJsonBody(req);
      const result = await documentService.uploadDocument({
        phone: authUser.phone,
        applicationId: body.applicationId,
        documentType: body.documentType,
        fileName: body.fileName,
        mimeType: body.mimeType,
        fileBase64: body.fileBase64,
        password: body.password
      });

      if (!result.success) {
        return sendJson(res, result.status || 400, {
          error: result.error,
          code: result.code
        });
      }

      return sendJson(res, 200, result);
    }

    // 6b. List User Documents (Authenticated)
    if (pathname === '/api/v1/documents' && req.method === 'GET') {
      const authUser = requireAuth(req, res, parsedUrl);
      if (!authUser) return;
      const docs = await documentService.listDocuments(authUser.phone);
      return sendJson(res, 200, { documents: docs });
    }

    // 6c. Stream Document File Preview (Authenticated, Owner-Only)
    if (pathname.startsWith('/api/v1/documents/') && pathname.endsWith('/file') && req.method === 'GET') {
      const authUser = requireAuth(req, res, parsedUrl);
      if (!authUser) return;
      const docId = pathname.split('/')[4];
      const file = await documentService.getDocumentFile(authUser.phone, docId);
      if (!file) {
        return sendJson(res, 404, { error: 'Document not found or unauthorized' });
      }
      res.writeHead(200, {
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${file.fileName}"`,
        'Cache-Control': 'private, no-store',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(file.buffer);
    }

    // 6d. Delete Document (Authenticated, Owner-Only)
    if (pathname.startsWith('/api/v1/documents/') && req.method === 'DELETE') {
      const authUser = requireAuth(req, res, parsedUrl);
      if (!authUser) return;
      const docId = pathname.split('/')[4];
      const result = await documentService.deleteDocument(authUser.phone, docId);
      if (!result.success) {
        return sendJson(res, result.status || 404, { error: result.error });
      }
      return sendJson(res, 200, result);
    }

    // 6e. OCR Trigger (legacy/internal)
    if (pathname === '/api/v1/documents/ocr' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { documentType, fileName, imageBase64 } = body;
      if (!imageBase64) {
        return sendJson(res, 400, { error: 'imageBase64 payload is required' });
      }
      const fileBuffer = Buffer.from(imageBase64, 'base64');
      const ocrResult = await ocrService.extractDocumentFields(documentType, fileBuffer, fileName || 'document.png');
      return sendJson(res, 200, ocrResult);
    }

    // 7. NBFC Eligibility Evaluation
    if (pathname === '/api/v1/nbfc/evaluate' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = nbfcEngine.evaluateEligibility(body);
      return sendJson(res, 200, result);
    }

    // 7b. Live Salesforce-Driven NBFC Application Status Tracking
    if (pathname === '/api/v1/nbfc/status' && req.method === 'GET') {
      const auth = requireAuth(req, res, parsedUrl);
      if (!auth) return;

      const sfRes = await salesforce.fetchNbfcStatusByPhone(auth.phone);
      const normalized = normalizeNbfcStatus(sfRes.parentRecord, sfRes.childRecord);

      // Verify class access status independently (EMI setup done or Disbursed)
      const classAccessEligible = normalized.statusCode === 'DISBURSED' ||
        normalized.statusCode === 'EMI_SETUP_COMPLETED' ||
        sfRes.parentRecord?.Provide_Class_Access__c === true;

      return sendJson(res, 200, {
        success: true,
        source: sfRes.source,
        nbfc: {
          ...normalized,
          classAccessEligible
        },
        lastSynced: new Date().toISOString()
      });
    }

    // 8. Payment initiation
    if (pathname === '/api/v1/payments/create-order' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const orderId = 'order_' + Math.random().toString(36).substring(2, 10);
      return sendJson(res, 200, {
        orderId,
        amount: body.amount || 97000,
        currency: 'INR',
        gateway: 'Razorpay / Cashfree Production Gateway'
      });
    }

    // 9. Class Access Provisioning
    if (pathname === '/api/v1/lms/provision' && req.method === 'POST') {
      const entitlement = {
        id: 'ent_' + Date.now(),
        status: 'ACTIVE',
        courseName: 'NxtWave Academy EDGE',
        batchId: 'BATCH_2026_AUG_01',
        provisionedAt: new Date().toISOString()
      };
      DB.classEntitlements.set(entitlement.id, entitlement);

      // Send WhatsApp confirmation via Gallabox
      const student = DB.students.get(DEFAULT_STUDENT_ID);
      if (student?.phone) {
        await gallabox.sendClassAccessWelcome(
          student.phone,
          student.full_name,
          entitlement.courseName,
          'https://learning.nxtwave.co/dashboard'
        );
      }

      return sendJson(res, 200, entitlement);
    }

    // 10. PRE Support Exception Trigger
    if (pathname === '/api/v1/support/exception' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const caseItem = {
        id: 'CAS-' + Math.floor(10000 + Math.random() * 90000),
        reason: body.reason || 'MANUAL_INTERVENTION_REQUESTED',
        assignedTo: 'Kavita Sharma (PRE Lead)',
        status: 'DISPATCHED_TO_CRM',
        created_at: new Date().toISOString()
      };
      DB.supportCases.set(caseItem.id, caseItem);
      return sendJson(res, 200, caseItem);
    }

    return sendJson(res, 404, { error: 'Endpoint not found' });
  } catch (err) {
    console.error('Server error:', err);
    return sendJson(res, 500, { error: 'Internal Server Error', details: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`NxtWave KYC Backend Service listening on port ${PORT}`);
});

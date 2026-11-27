import React, { useState, useEffect } from 'react';
import { ApplicationState, EnrollmentFinance, INITIAL_APPLICATION_STATE, INITIAL_FINANCE } from './types.ts';
import { TRANSLATIONS, Language } from './locales.ts';
import { initMixpanel, identifyUser, trackEvent, resetUser } from './analytics.ts';
import { 
  ShieldCheck, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, 
  UploadCloud, FileText, Camera, Building, User, CreditCard, 
  Sparkles, PhoneCall, HelpCircle, RefreshCw, Lock, Globe2
} from 'lucide-react';

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [appState, setAppState] = useState<ApplicationState>(INITIAL_APPLICATION_STATE);
  const [finance, setFinance] = useState<EnrollmentFinance>(INITIAL_FINANCE);
  const [financeSource, setFinanceSource] = useState<'SALESFORCE' | 'FALLBACK_LOCAL'>('FALLBACK_LOCAL');
  const [isLoading, setIsLoading] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [checkoutSubmitted, setCheckoutSubmitted] = useState(false);

  // Production Auth & Journey State (restored from sessionStorage across browser refreshes)
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('nxtwave_auth_token');
    } catch {
      return null;
    }
  });
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);
  const [resumedNotice, setResumedNotice] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docPasswordNeeded, setDocPasswordNeeded] = useState<string | null>(null);
  const [docPassword, setDocPassword] = useState<string>('');
  const [pendingUpload, setPendingUpload] = useState<{ docType: string; file: File; nextStage: string } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [otpExpiresIn, setOtpExpiresIn] = useState<number>(0);
  const [consentAccepted, setConsentAccepted] = useState<boolean>(true);

  // Live Salesforce-driven NBFC status state
  const [nbfcLive, setNbfcLive] = useState<any>(null);
  const [isLoadingNbfc, setIsLoadingNbfc] = useState<boolean>(false);
  const [nbfcError, setNbfcError] = useState<string | null>(null);
  const [isStageLocked, setIsStageLocked] = useState<boolean>(false);

  useEffect(() => {
    initMixpanel();
    trackEvent('portal_loaded', {
      initial_stage: appState.stage,
      has_active_session: Boolean(authToken)
    });
  }, []);

  // Server-side navigation policy check
  const checkNavigationPolicy = async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/v1/applications/navigation-policy', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIsStageLocked(Boolean(data.isLocked));
      }
    } catch {
      // Default to locked if beyond nbfc
      if (['nbfc', 'classAccess'].includes(appState.stage)) {
        setIsStageLocked(true);
      }
    }
  };

  useEffect(() => {
    if (authToken) {
      checkNavigationPolicy();
    }
  }, [appState.stage, authToken]);

  const fetchLiveNbfcStatus = async (silent = false) => {
    if (!authToken) return;
    if (!silent) setIsLoadingNbfc(true);
    setNbfcError(null);
    try {
      const res = await fetch('/api/v1/nbfc/status', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.nbfc) {
          setNbfcLive(data.nbfc);
          if (
            data.nbfc.statusCode === 'EMI_SETUP_COMPLETED' ||
            data.nbfc.statusCode === 'DISBURSED' ||
            data.nbfc.classAccessEligible === true
          ) {
            go('classAccess');
          }
        }
      } else {
        if (!silent) setNbfcError('Unable to sync latest lender status.');
      }
    } catch {
      if (!silent) setNbfcError('Network connection issue. Please retry.');
    } finally {
      if (!silent) setIsLoadingNbfc(false);
    }
  };

  useEffect(() => {
    if (appState.stage === 'nbfc' && authToken) {
      fetchLiveNbfcStatus();
      const interval = setInterval(() => fetchLiveNbfcStatus(true), 12000);
      return () => clearInterval(interval);
    }
  }, [appState.stage, authToken]);

  // Resume active journey on page refresh if token is saved in sessionStorage
  useEffect(() => {
    if (!authToken) return;

    fetch('/api/v1/applications/current', {
      headers: { Authorization: `Bearer ${authToken}` }
    })
      .then(r => {
        if (!r.ok) {
          if (r.status === 401) {
            setAuthToken(null);
            try { sessionStorage.removeItem('nxtwave_auth_token'); } catch {}
          }
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (data && data.application) {
          if (data.enrollment) {
            setFinance(data.enrollment);
            setFinanceSource('SALESFORCE');
          }
          if (data.application.id) {
            setApplicationId(data.application.id);
          }
          if (Array.isArray(data.documents)) {
            setUploadedDocs(data.documents);
          }
          const restoredPayload = data.application.statePayload || {};
          const targetStage = data.isCompleted
            ? 'classAccess'
            : (data.application.current_stage && data.application.current_stage !== 'auth' && data.application.current_stage !== 'authOtp'
                ? data.application.current_stage
                : 'payment');

          setAppState(prev => ({
            ...prev,
            ...restoredPayload,
            stage: targetStage,
            history: Array.isArray(data.application.history) ? data.application.history : []
          }));
          setResumedNotice(`Resumed your application at "${targetStage}" with ${data.documents?.length || 0} saved document(s).`);
        }
      })
      .catch(() => {});
  }, [authToken]);

  useEffect(() => {
    if (resendCooldown <= 0 && otpExpiresIn <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
      setOtpExpiresIn(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown, otpExpiresIn]);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleRequestOtp = async () => {
    setAuthError(null);
    const cleanPhone = appState.phone.replace(/\D/g, '');
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      setAuthError('Please enter a valid mobile number.');
      return;
    }
    if (!consentAccepted) {
      setAuthError('Please authorize WhatsApp OTP delivery to continue.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: appState.countryCode,
          phone: cleanPhone
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'Failed to send OTP. Please try again.');
        if (data.retryAfterSeconds && data.code === 'COOLDOWN_ACTIVE') {
          setResendCooldown(data.retryAfterSeconds);
        }
        return;
      }

      // Handle QA OTP Bypass response: directly transition to active journey
      if (data.status === 'AUTHENTICATED' && data.token) {
        setAuthToken(data.token);
        try {
          sessionStorage.setItem('nxtwave_auth_token', data.token);
        } catch {}
        if (data.enrollment) {
          setFinance(data.enrollment);
          setFinanceSource(data.enrollmentSource === 'SALESFORCE' ? 'SALESFORCE' : 'FALLBACK_LOCAL');
        }
        if (data.application?.id) {
          setApplicationId(data.application.id);
        }
        if (Array.isArray(data.documents)) {
          setUploadedDocs(data.documents);
        }

        const restoredPayload = data.application?.statePayload || {};
        const targetStage = data.isCompleted
          ? 'classAccess'
          : (data.application?.current_stage && data.application.current_stage !== 'auth' && data.application.current_stage !== 'authOtp'
              ? data.application.current_stage
              : 'payment');

        // Identify authenticated user in Mixpanel
        identifyUser(cleanPhone, {
          name: data.application?.student_name || 'NxtWave Student',
          phone: cleanPhone,
          program: data.enrollment?.program,
          courseFee: data.enrollment?.course,
          balanceAmount: data.enrollment?.balance
        });
        trackEvent('kyc_session_authenticated', {
          auth_type: 'QA_BYPASS_DIRECT',
          student_phone: cleanPhone,
          resumed: Boolean(data.isResumed),
          target_stage: targetStage
        });

        setAppState(prev => ({
          ...prev,
          ...restoredPayload,
          countryCode: prev.countryCode,
          phone: cleanPhone,
          studentOtp: '',
          history: Array.isArray(data.application?.history) ? data.application.history : [],
          stage: targetStage
        }));

        showToast(data.isResumed ? `Welcome back! Resumed your application.` : 'Authenticated test session initialized.');
        return;
      }

      setResendCooldown(data.resendCooldown || 30);
      setOtpExpiresIn(data.expiresIn || 300);
      updateField('studentOtp', '');
      showToast(`OTP sent to ${appState.countryCode} ${data.phoneMasked || cleanPhone} via WhatsApp`);
      setAppState(prev => ({
        ...prev,
        history: [...prev.history, prev.stage],
        stage: 'authOtp'
      }));
    } catch {
      setAuthError('Network error while contacting authentication server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setAuthError(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: appState.countryCode,
          phone: appState.phone.replace(/\D/g, '')
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Could not resend OTP.');
        if (data.retryAfterSeconds && data.code === 'COOLDOWN_ACTIVE') {
          setResendCooldown(data.retryAfterSeconds);
        }
        return;
      }
      setResendCooldown(data.resendCooldown || 30);
      setOtpExpiresIn(data.expiresIn || 300);
      updateField('studentOtp', '');
      showToast('New OTP sent to your WhatsApp');
    } catch {
      setAuthError('Network error while resending OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setAuthError(null);
    const otp = appState.studentOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      setAuthError('Please enter the 6-digit OTP sent to your WhatsApp.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: appState.countryCode,
          phone: appState.phone.replace(/\D/g, ''),
          otp
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || 'OTP verification failed.');
        return;
      }

      setAuthToken(data.token);
      try {
        sessionStorage.setItem('nxtwave_auth_token', data.token);
      } catch {}
      if (data.enrollment) {
        setFinance(data.enrollment);
        setFinanceSource(data.enrollmentSource === 'SALESFORCE' ? 'SALESFORCE' : 'FALLBACK_LOCAL');
      }
      if (data.application?.id) {
        setApplicationId(data.application.id);
      }
      if (Array.isArray(data.documents)) {
        setUploadedDocs(data.documents);
      }

      const restoredPayload = data.application?.statePayload || {};
      const targetStage = data.isCompleted
        ? 'classAccess'
        : (data.application?.current_stage && data.application.current_stage !== 'auth' && data.application.current_stage !== 'authOtp'
            ? data.application.current_stage
            : 'payment');

      setAppState(prev => ({
        ...prev,
        ...restoredPayload,
        countryCode: prev.countryCode,
        phone: prev.phone,
        studentOtp: '',
        history: Array.isArray(data.application?.history) ? data.application.history : [],
        stage: targetStage
      }));

      const cleanP = appState.phone.replace(/\D/g, '');
      identifyUser(cleanP, {
        phone: cleanP,
        program: data.enrollment?.program,
        courseFee: data.enrollment?.course,
        balanceAmount: data.enrollment?.balance
      });
      trackEvent('kyc_session_authenticated', {
        auth_type: 'OTP_VERIFIED',
        student_phone: cleanP,
        target_stage: targetStage
      });

      if (data.isResumed && !data.isCompleted && targetStage !== 'payment') {
        setResumedNotice(`Resumed your application at "${targetStage}" with ${data.documents?.length || 0} saved document(s).`);
        showToast('Welcome back! Resumed your active application.');
      } else if (data.isCompleted) {
        showToast('Your application is already complete!');
      } else {
        setResumedNotice(null);
        showToast('Verified! Starting your onboarding...');
      }
    } catch {
      setAuthError('Network error during OTP verification.');
    } finally {
      setIsLoading(false);
    }
  };

  const t = (key: string) => TRANSLATIONS[lang][key] || key;
  const money = (val: number) => '₹' + Number(val).toLocaleString('en-IN');
  const perMonth = () => Math.round(finance.balance / Number(appState.emi || 12));

  const getProgramTenures = (): number[] => {
    const prog = `${finance.programCode || ''} ${finance.program || ''}`.toLowerCase();
    if (prog.includes('genie') || prog.includes('genius')) return [12, 18, 24, 30, 36];
    if (prog.includes('smart')) return [12, 18, 24, 30];
    if (prog.includes('edge')) return [12, 18, 24];
    return [12, 18, 24];
  };

  const effectiveRelation =
    appState.relation === 'Other family member' && appState.otherRelation.trim()
      ? appState.otherRelation.trim()
      : appState.relation;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const updateField = (key: keyof ApplicationState, value: any) => {
    setAppState(prev => ({ ...prev, [key]: value }));
  };

  const go = async (targetStage: string) => {
    setIsLoading(true);
    try {
      if (authToken) {
        const res = await fetch('/api/v1/applications/transition', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`
          },
          body: JSON.stringify({ targetStage, appStateUpdates: appState })
        });
        if (res.status === 401) {
          setAuthToken(null);
          try {
            sessionStorage.removeItem('nxtwave_auth_token');
          } catch {}
          setAuthError('Your session expired. Please verify your mobile number again.');
          setAppState(prev => ({ ...prev, stage: 'auth', history: [] }));
          return;
        }
      }

      setAppState(prev => ({
        ...prev,
        history: [...prev.history, prev.stage],
        stage: targetStage
      }));

      trackEvent('kyc_stage_transition', {
        from_stage: appState.stage,
        to_stage: targetStage,
        method: appState.method,
        relation: appState.relation
      });
    } catch {
      setAppState(prev => ({
        ...prev,
        history: [...prev.history, prev.stage],
        stage: targetStage
      }));

      trackEvent('kyc_stage_transition', {
        from_stage: appState.stage,
        to_stage: targetStage,
        method: appState.method,
        relation: appState.relation
      });
    } finally {
      setIsLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    if (appState.history.length === 0) return;
    const prevHistory = [...appState.history];
    const prevStage = prevHistory.pop() || 'auth';
    setAppState(prev => ({ ...prev, history: prevHistory, stage: prevStage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        resolve(res.includes(',') ? res.split(',')[1] : res);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  // Real production document upload + validation + Google Vision OCR
  const handleDocumentUpload = async (docType: string, file: File, nextStage: string, password?: string) => {
    setDocError(null);
    if (!authToken || !applicationId) {
      setDocError('Active authenticated session required to upload documents.');
      return;
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type.toLowerCase())) {
      setDocError('Unsupported format. Please upload JPG, PNG, WEBP, or PDF.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setDocError('File exceeds 15MB maximum size.');
      return;
    }

    setIsOcrProcessing(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          applicationId,
          documentType: docType,
          fileName: file.name,
          mimeType: file.type,
          fileBase64,
          password
        })
      });
      const data = await res.json();

      if (res.status === 422 && data.code === 'PASSWORD_REQUIRED') {
        setDocPasswordNeeded(docType);
        setPendingUpload({ docType, file, nextStage });
        setDocError(data.error);
        return;
      }

      if (!res.ok) {
        setDocError(data.error || 'Document upload failed. Please retry.');
        return;
      }

      setDocPasswordNeeded(null);
      setDocPassword('');
      setPendingUpload(null);
      setUploadedDocs(prev => [data.document, ...prev.filter(d => d.document_type !== docType)]);

      // Auto-populate extracted OCR fields when available
      const ef = data.ocr?.extractedFields || {};
      
      // Normalize DOB to YYYY-MM-DD for HTML <input type="date">
      let normalizedDob: string | undefined = undefined;
      if (ef.dob) {
        const parts = String(ef.dob).trim().split(/[\/\-\.]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY-MM-DD format
            normalizedDob = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            // DD/MM/YYYY or MM/DD/YYYY format -> assume DD-MM-YYYY as standard on Indian PAN
            normalizedDob = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        } else {
          normalizedDob = ef.dob;
        }
      }

      setAppState(prev => ({
        ...prev,
        ...(ef.panNumber ? { pan: ef.panNumber } : {}),
        ...(ef.fullName ? { panName: ef.fullName, coName: prev.coName || ef.fullName, aadhaarName: ef.fullName } : {}),
        ...(normalizedDob ? { dob: normalizedDob } : {}),
        ...(ef.aadhaarNumber ? { aadhaarNumber: ef.aadhaarNumber } : {}),
        ...(ef.aadhaarLast4 ? { aadhaarLast4: ef.aadhaarLast4 } : (ef.maskedNumber ? { aadhaarLast4: String(ef.maskedNumber).slice(-4) } : {})),
        ...(ef.gender ? { gender: ef.gender } : {}),
        ...(ef.street ? { street: ef.street } : {}),
        ...(ef.city ? { city: ef.city } : {}),
        ...(ef.district ? { district: ef.district } : {}),
        ...(ef.state ? { stateName: ef.state } : {}),
        ...(ef.pincode ? { pincode: ef.pincode } : {}),
        ...(ef.completeAddress ? { building: ef.completeAddress } : {}),
        ...(ef.ifsc ? { ifsc: ef.ifsc } : {}),
        ...(ef.accountNumber ? { accountNumber: ef.accountNumber, reAccountNumber: ef.accountNumber } : {}),
        ...(ef.cibilScore ? { demoScore: String(ef.cibilScore) } : {})
      }));

      showToast(`${file.name} uploaded & verified (${data.document?.verification_status || 'UPLOADED'})`);

      trackEvent('kyc_document_uploaded', {
        document_type: docType,
        file_name: file.name,
        verification_status: data.document?.verification_status,
        ocr_status: data.ocr?.status,
        has_extracted_fields: Object.keys(ef).length > 0
      });

      let resolvedNext = nextStage;
      if (docType === 'CIBIL_REPORT') {
        const scoreVal = parseInt(ef.cibilScore, 10);
        if (ef.cibilScore === 'NH' || (scoreVal && scoreVal < 650)) {
          resolvedNext = 'cibilLow';
        } else {
          resolvedNext = 'cibilResult';
        }
      }

      await go(resolvedNext);
    } catch {
      setDocError('Network error during document upload. Please retry.');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!authToken) return;
    try {
      const res = await fetch(`/api/v1/documents/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        setUploadedDocs(prev => prev.filter(d => d.id !== docId));
        showToast('Document removed.');
      }
    } catch {
      showToast('Failed to delete document.');
    }
  };

  const renderDocumentUploader = (docType: string, label: string, nextStage: string, allowCamera = true) => {
    const existing = uploadedDocs.find(d => d.document_type === docType);
    const inputId = `upload-${docType}`;
    const camId = `cam-${docType}`;

    return (
      <div className="space-y-3">
        {docError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{docError}</span>
          </div>
        )}

        {docPasswordNeeded === docType && pendingUpload && (
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 space-y-2">
            <label className="text-xs font-bold text-amber-900 block">Enter PDF Password</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={docPassword}
                onChange={e => setDocPassword(e.target.value)}
                placeholder="Document password"
                className="nxt-input flex-1 text-xs"
              />
              <button
                type="button"
                onClick={() => handleDocumentUpload(pendingUpload.docType, pendingUpload.file, pendingUpload.nextStage, docPassword)}
                className="px-4 py-2 rounded-xl bg-[#7136ef] text-white text-xs font-bold"
              >
                Unlock & Upload
              </button>
            </div>
          </div>
        )}

        {existing && (
          <div className="bg-green-50 p-3.5 rounded-2xl border border-green-200 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-green-900 truncate">{existing.original_filename}</div>
              <div className="text-[10px] text-green-700">
                Status: <b>{existing.verification_status}</b> · {Math.round((existing.file_size_bytes || 0) / 1024)} KB
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <a
                href={`/api/v1/documents/${existing.id}/file?token=${encodeURIComponent(authToken || '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-[#7136ef] underline"
              >
                Preview
              </a>
              <button
                type="button"
                onClick={() => handleDeleteDocument(existing.id)}
                className="text-[11px] font-bold text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        <div className="border-2 border-dashed border-[#7136ef]/40 bg-[#f4efff]/30 rounded-2xl p-6 text-center space-y-3">
          <UploadCloud className="w-10 h-10 text-[#7136ef] mx-auto" />
          <div>
            <div className="font-bold text-sm text-[#0c1b3b]">{existing ? `Replace ${label}` : label}</div>
            <div className="text-xs text-[#687894] mt-0.5">JPG, PNG, WEBP or PDF up to 15MB</div>
          </div>

          <input
            id={inputId}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleDocumentUpload(docType, f, nextStage);
              e.target.value = '';
            }}
          />
          {allowCamera && (
            <input
              id={camId}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleDocumentUpload(docType, f, nextStage);
                e.target.value = '';
              }}
            />
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <label
              htmlFor={inputId}
              className="nxt-btn-primary max-w-[200px] text-xs py-2.5 cursor-pointer"
            >
              {isOcrProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span>{isOcrProcessing ? 'Uploading & Scanning...' : 'Choose File'}</span>
            </label>
            {allowCamera && (
              <label
                htmlFor={camId}
                className="px-4 py-2.5 rounded-xl border border-[#7136ef] text-[#7136ef] bg-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Camera</span>
              </label>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* =========================================================
     25 SCREEN RENDERERS
  ========================================================= */

  const renderScreen = () => {
    switch (appState.stage) {
      /* Screen 1: Auth */
      case 'auth':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Welcome to NxtWave</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Build a career ready for what's next</h1>
            <p className="text-sm text-[#687894]">Sign in with your WhatsApp-registered mobile number to continue your secure enrollment & KYC.</p>
            
            {authError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-4">
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-2">Student Mobile Number</label>
                <div className="flex gap-2">
                  <select
                    value={appState.countryCode}
                    onChange={e => updateField('countryCode', e.target.value)}
                    className="px-3 rounded-xl bg-[#edf3fc] border border-[#a9bbd4] font-semibold text-sm text-[#0c1b3b]"
                  >
                    <option value="+91">+91 (IN)</option>
                    <option value="+1">+1 (US)</option>
                    <option value="+44">+44 (UK)</option>
                    <option value="+971">+971 (AE)</option>
                    <option value="+65">+65 (SG)</option>
                  </select>
                  <input
                    type="tel"
                    maxLength={15}
                    value={appState.phone}
                    onChange={e => {
                      setAuthError(null);
                      updateField('phone', e.target.value.replace(/\D/g, ''));
                    }}
                    placeholder="Enter mobile number"
                    className="nxt-input flex-1"
                  />
                </div>
              </div>
              <label className="flex items-start gap-2.5 text-xs text-[#687894] cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={e => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 accent-[#7136ef]"
                />
                <span>I authorize NxtWave to send OTP, application updates, and KYC communications via WhatsApp Business API.</span>
              </label>
            </div>

            <button
              onClick={handleRequestOtp}
              disabled={isLoading}
              className="nxt-btn-primary disabled:opacity-60"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              <span>{isLoading ? 'Sending OTP...' : t('sendOtp')}</span>
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        );

      /* Screen 2: Student OTP */
      case 'authOtp':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Secure WhatsApp Verification</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Enter your OTP</h1>
            <p className="text-sm text-[#687894]">
              Enter the 6-digit code sent to <span className="font-semibold text-[#0c1b3b]">{appState.countryCode} {appState.phone}</span> on WhatsApp.
            </p>

            {authError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-[#102448]">6-Digit WhatsApp OTP</label>
                {otpExpiresIn > 0 ? (
                  <span className="text-[11px] font-mono font-bold text-[#7136ef]">
                    Expires in {formatCountdown(otpExpiresIn)}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-red-600">OTP Expired</span>
                )}
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={appState.studentOtp}
                onChange={e => {
                  setAuthError(null);
                  updateField('studentOtp', e.target.value.replace(/\D/g, ''));
                }}
                placeholder="• • • • • •"
                className="nxt-input text-center text-xl tracking-widest font-mono"
              />
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#687894]">Didn't receive the code?</span>
                <button
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isLoading}
                  className="font-bold text-[#7136ef] disabled:text-[#a9bbd4] disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : t('resendOtp')}
                </button>
              </div>
            </div>

            <button
              onClick={handleVerifyOtp}
              disabled={isLoading || otpExpiresIn === 0}
              className="nxt-btn-primary disabled:opacity-60"
            >
              {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              <span>{isLoading ? 'Verifying...' : t('verify')}</span>
            </button>
          </div>
        );

      /* Screen 3: Payment Selection */
      case 'payment': {
        const tenures = getProgramTenures();
        const minEmi = Math.round(finance.balance / Math.max(...tenures));
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Step 1 · Payment</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">How would you like to pay?</h1>
            <p className="text-sm text-[#687894]">Choose the financing plan that fits your family's budget.</p>

            <div className="bg-gradient-to-br from-[#7136ef] to-[#5635c5] p-5 rounded-2xl text-white shadow-md">
              <div className="text-xs uppercase opacity-80 font-bold tracking-wider">{finance.program}</div>
              <div className="text-2xl font-extrabold mt-1">{money(finance.balance)}</div>
              <div className="text-xs opacity-90 mt-0.5 font-medium">Remaining Amount To Be Paid</div>
              <div className="text-xs opacity-90 mt-2.5 pt-2 border-t border-white/20 flex justify-between">
                <span>Total Amount to be Paid: {money(finance.course)}</span>
                <span>Amount Paid to Company: {money(finance.alreadyPaid)}</span>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { id: 'emi', title: '0% Interest EMI Loan', desc: `Estimated EMI from ${money(minEmi)}/month (depends on NBFC)` },
                { id: 'full', title: 'Full Payment', desc: 'Direct UPI, NetBanking or Debit Card' },
                { id: 'card', title: 'Credit Card EMI', desc: 'Convert balance with your personal bank card' }
              ].map(opt => (
                <div
                  key={opt.id}
                  onClick={() => updateField('method', opt.id)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${
                    appState.method === opt.id ? 'border-[#7136ef] bg-[#f4efff]/60' : 'border-[#e0e7f2] bg-white'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm text-[#0c1b3b] flex items-center gap-2">
                      {opt.title}
                    </div>
                    <div className="text-xs text-[#687894] mt-1">{opt.desc}</div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    appState.method === opt.id ? 'border-[#7136ef] bg-[#7136ef]' : 'border-[#a9bbd4]'
                  }`}>
                    {appState.method === opt.id && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => go(appState.method === 'emi' ? 'emi' : 'checkout')} className="nxt-btn-primary">
              <span>{t('continue')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );
      }

      /* Screen 4: EMI Selection */
      case 'emi': {
        const tenures = getProgramTenures();
        const tagMap: Record<number, string> = {
          12: 'Most Popular',
          18: 'Balanced Plan',
          24: 'Flexible',
          30: 'Extended Plan',
          36: 'Lowest Monthly'
        };
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Step 2 · EMI Loan Plan</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Choose your EMI loan tenure</h1>
            <p className="text-sm text-[#687894]">Select loan tenure length for Remaining Amount of {money(finance.balance)} with 0% interest.</p>

            <div className="space-y-3">
              {tenures.map(tVal => {
                const tenure = String(tVal);
                const perMo = Math.round(finance.balance / tVal);
                return (
                  <div
                    key={tenure}
                    onClick={() => updateField('emi', tenure)}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex justify-between items-center ${
                      appState.emi === tenure ? 'border-[#7136ef] bg-[#f4efff]/60' : 'border-[#e0e7f2] bg-white'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-[#7136ef] flex items-center gap-2">
                        <span>{tenure} Months 0% EMI Loan</span>
                        {tVal === 24 && (
                          <span className="text-[10px] bg-[#7136ef] text-white px-2 py-0.5 rounded-full font-bold">
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="text-lg font-black text-[#0c1b3b] mt-0.5">Est. {money(perMo)} / month</div>
                      <span className="text-[10px] text-[#687894] font-medium">{tagMap[tVal] || 'Flexible'} · Estimated EMI</span>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      appState.emi === tenure ? 'border-[#7136ef] bg-[#7136ef]' : 'border-[#a9bbd4]'
                    }`}>
                      {appState.emi === tenure && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-[#eff7ff] p-4 rounded-2xl border border-[#b8daff] text-xs text-[#1870d5] flex items-center gap-3">
              <Sparkles className="w-5 h-5 flex-shrink-0" />
              <span><b>Estimated EMI:</b> Final loan tenure and monthly EMI depend on NBFC approval. NxtWave subvents the interest charge.</span>
            </div>

            <button onClick={() => go('payer')} className="nxt-btn-primary">
              <span>Continue with {appState.emi} Months</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );
      }

      /* Screen 5: Checkout (Full / Card) */
      case 'checkout': {
        const cardBanks = [
          { id: 'HDFC Bank', short: 'HDFC', bg: '#004c8f', accent: '#ed232a' },
          { id: 'ICICI Bank', short: 'ICICI', bg: '#b02a30', accent: '#f58220' },
          { id: 'SBI Card', short: 'SBI', bg: '#1b4e9b', accent: '#00b5ef' },
          { id: 'Axis Bank', short: 'AXIS', bg: '#97144d', accent: '#d6a461' },
          { id: 'Kotak Bank', short: 'KOTAK', bg: '#ed1c24', accent: '#003874' },
          { id: 'Other Bank', short: 'BANK', bg: '#475569', accent: '#94a3b8' }
        ];
        const numericLimit = Number(appState.creditCardLimit || 0);
        const hasSufficientLimit = numericLimit >= finance.balance;

        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">
              {appState.method === 'card' ? 'Credit Card EMI · Checkout' : 'Payment Checkout'}
            </div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">
              {appState.method === 'card' ? 'Credit Card EMI Details' : 'Complete Payment'}
            </h1>
            <p className="text-sm text-[#687894]">
              {appState.method === 'card'
                ? `Share your credit card bank & available limit for ${money(finance.balance)}. Our team will connect with you to process the EMI.`
                : `Review your fee summary for ${money(finance.balance)}. Our team will connect with you to complete the payment.`}
            </p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                <span className="text-[#687894]">Total Amount to be Paid</span>
                <span className="font-bold">{money(finance.course)}</span>
              </div>
              {finance.discount > 0 && (
                <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                  <span className="text-[#687894]">Scholarship Discount</span>
                  <span className="font-bold text-green-600">-{money(finance.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                <span className="text-[#687894]">Amount Paid to Company</span>
                <span className="font-bold text-blue-600">-{money(finance.alreadyPaid)}</span>
              </div>
              <div className="flex justify-between text-base font-black pt-2">
                <span>Remaining Amount To Be Paid</span>
                <span className="text-[#7136ef]">{money(finance.balance)}</span>
              </div>
            </div>

            {checkoutSubmitted ? (
              <div className="bg-white p-6 rounded-2xl border border-green-200 shadow-sm space-y-4 text-center">
                <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0c1b3b]">Payment Request Received</h3>
                  <p className="text-xs text-[#687894] mt-1.5 leading-relaxed">
                    Our Academic Onboarding team has received your {appState.method === 'card' ? 'Credit Card EMI' : 'Full Payment'} request and will contact you on <b>{appState.countryCode} {appState.phone}</b> to share the secure payment link.
                  </p>
                </div>
                <div className="bg-[#f8fafc] p-3.5 rounded-xl border border-[#e2e8f0] text-xs text-[#475569] text-left">
                  <b>Please Note:</b> Class access will be unlocked after your payment of <b>{money(finance.balance)}</b> is completed and verified by our team.
                </div>
                <div className="pt-2 flex flex-col gap-2">
                  <a
                    href={`https://wa.me/919392901586?text=${encodeURIComponent(
                      `Hi Suresh, I requested ${appState.method === 'card' ? 'Credit Card EMI' : 'Full Payment'} for my enrollment. Please share the payment link.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nxt-btn-primary flex items-center justify-center gap-2"
                  >
                    <span>Connect with PRE on WhatsApp</span>
                  </a>
                  <button
                    onClick={() => {
                      setCheckoutSubmitted(false);
                      go('payment');
                    }}
                    className="w-full py-2.5 text-xs font-bold text-[#7136ef] hover:underline"
                  >
                    Change Payment Method
                  </button>
                </div>
              </div>
            ) : (
              <>
                {appState.method === 'card' && (
                  <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-4">
                    <div>
                      <label className="text-xs font-bold text-[#102448] block mb-2">Which Credit Card do you have?</label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {cardBanks.map(bank => {
                          const selected = appState.creditCardBank === bank.id;
                          return (
                            <button
                              key={bank.id}
                              type="button"
                              onClick={() => updateField('creditCardBank', bank.id)}
                              className={`p-3 rounded-xl border-2 text-left transition-all flex items-center gap-2.5 ${
                                selected ? 'border-[#7136ef] bg-[#f4efff]/70' : 'border-[#e0e7f2] bg-white hover:border-[#a9bbd4]'
                              }`}
                            >
                              <svg width="28" height="28" viewBox="0 0 28 28" className="flex-shrink-0 rounded-lg">
                                <rect width="28" height="28" rx="6" fill={bank.bg} />
                                <rect x="4" y="20" width="20" height="3" rx="1.5" fill={bank.accent} />
                                <text x="14" y="14" textAnchor="middle" fill="#ffffff" fontSize="7" fontWeight="800" fontFamily="sans-serif">
                                  {bank.short}
                                </text>
                              </svg>
                              <span className="text-xs font-bold text-[#0c1b3b] leading-tight">{bank.id}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-[#102448] block mb-1.5">Available Credit Card Limit (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={appState.creditCardLimit}
                        onChange={e => updateField('creditCardLimit', e.target.value)}
                        placeholder={`e.g. ${finance.balance}`}
                        className="nxt-input font-bold"
                      />
                      {appState.creditCardLimit && (
                        <div className={`text-[11px] mt-1.5 font-semibold ${hasSufficientLimit ? 'text-green-600' : 'text-amber-600'}`}>
                          {hasSufficientLimit
                            ? `Covers full ${money(finance.balance)} net payable.`
                            : `Below ${money(finance.balance)} — our team can assist with split payment.`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="bg-[#f4efff] p-4 rounded-2xl border border-[#e2d4ff] text-xs text-[#4b23a3] flex items-start gap-3">
                  <PhoneCall className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#7136ef]" />
                  <span>
                    <b>Our team will connect with you</b> shortly on {appState.countryCode} {appState.phone || 'your registered number'} to share the secure payment link. Class access will be unlocked after payment is verified.
                  </span>
                </div>

                <button
                  disabled={isLoading}
                  onClick={async () => {
                    if (appState.method === 'card' && (!appState.creditCardBank || !appState.creditCardLimit)) {
                      showToast('Please select your credit card bank and enter your available limit.');
                      return;
                    }
                    setIsLoading(true);
                    await fetch('/api/v1/support/exception', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        phone: appState.phone,
                        reason: appState.method === 'card'
                          ? `CREDIT_CARD_EMI (${appState.creditCardBank}, Limit: ₹${appState.creditCardLimit})`
                          : 'FULL_PAYMENT_CALLBACK',
                        remainingAmount: finance.balance,
                        totalFee: finance.course
                      })
                    }).catch(() => {});
                    setIsLoading(false);
                    setCheckoutSubmitted(true);
                    showToast('Payment request submitted! Our team will connect with you shortly.');
                  }}
                  className="nxt-btn-primary"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>Submit Payment Request</span>
                </button>
              </>
            )}
          </div>
        );
      }

      /* Screen 6: Co-Applicant Selection */
      case 'payer':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Co-Applicant · 0% EMI</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Who will support your EMI?</h1>
            <p className="text-sm text-[#687894]">Choose an earning family member or yourself for loan sanctioning.</p>

            <div className="grid grid-cols-2 gap-3">
              {['Father', 'Mother', 'Brother', 'Sister', 'Self', 'Other family member'].map(rel => (
                <div
                  key={rel}
                  onClick={() => updateField('relation', rel)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer text-center ${
                    appState.relation === rel ? 'border-[#7136ef] bg-[#f4efff]/70' : 'border-[#e0e7f2] bg-white'
                  }`}
                >
                  <User className={`w-6 h-6 mx-auto mb-1 ${appState.relation === rel ? 'text-[#7136ef]' : 'text-gray-400'}`} />
                  <div className="font-bold text-xs text-[#0c1b3b]">{rel}</div>
                </div>
              ))}
            </div>

            {appState.relation === 'Other family member' && (
              <div className="bg-white p-4 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-2">
                <label className="text-xs font-bold text-[#102448] block">Specify family member & relationship</label>
                <input
                  type="text"
                  value={appState.otherRelation}
                  onChange={e => updateField('otherRelation', e.target.value)}
                  placeholder="e.g. Uncle, Aunt, Spouse, Cousin"
                  className="nxt-input"
                />
              </div>
            )}

            <button
              onClick={() => {
                if (appState.relation === 'Other family member' && !appState.otherRelation.trim()) {
                  showToast('Please enter the family member relationship.');
                  return;
                }
                go('contact');
              }}
              className="nxt-btn-primary"
            >
              <span>Continue with {effectiveRelation}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 7: Supporter Contact */
      case 'contact':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Supporter Details</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Enter {effectiveRelation}'s details</h1>
            <p className="text-sm text-[#687894]">Used for digital loan agreement and consent validation.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-4">
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Mobile Number</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={appState.coPhone}
                  onChange={e => updateField('coPhone', e.target.value.replace(/\D/g, ''))}
                  className="nxt-input"
                  placeholder="Enter 10-digit mobile number"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Email ID</label>
                <input
                  type="email"
                  value={appState.coEmail}
                  onChange={e => updateField('coEmail', e.target.value)}
                  className="nxt-input"
                  placeholder="Enter email address"
                />
              </div>
            </div>

            <button onClick={() => go('cibilLearn')} className="nxt-btn-primary">
              <span>{t('continue')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 8: Understand CIBIL */
      case 'cibilLearn':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Credit Assessment</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">What is a CIBIL score?</h1>
            <p className="text-sm text-[#687894]">A 3-digit score (300-900) representing credit health. A score of 700+ qualifies for instant 0% EMI.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-[#0c1b3b]">
                  <b className="block mb-0.5">Zero Impact on Credit</b>
                  Checking your score via NxtWave uses a soft inquiry that never lowers credit rating.
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-[#0c1b3b]">
                  <b className="block mb-0.5">High Sanction Rate</b>
                  Co-applicants with consistent repayment records unlock maximum instant financing limits.
                </div>
              </div>
            </div>

            <button onClick={() => go('cibilUpload')} className="nxt-btn-primary">
              <span>Proceed to Check Score</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 9: CIBIL Report Upload */
      case 'cibilUpload':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Credit Assessment</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Check {effectiveRelation}'s Score</h1>
            <p className="text-sm text-[#687894]">Upload recent CIBIL PDF for {effectiveRelation} to verify 0% EMI loan eligibility.</p>

            {renderDocumentUploader('CIBIL_REPORT', 'Upload CIBIL Report PDF', 'cibilResult', false)}

            <div className="bg-white p-4 rounded-2xl border border-[#e0e7f2] space-y-3">
              <div className="text-xs font-bold text-[#0c1b3b]">Don't have your CIBIL PDF? Check for free in 1 minute:</div>
              <div className="grid grid-cols-2 gap-2.5">
                <a
                  href="https://pay.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl border border-[#e0e7f2] hover:border-[#7136ef] flex items-center gap-2.5 transition-all"
                >
                  <span className="w-7 h-7 rounded-lg bg-[#edf3fc] text-[#1a73e8] font-black text-xs flex items-center justify-center">G</span>
                  <div>
                    <div className="text-xs font-bold text-[#0c1b3b]">Google Pay</div>
                    <div className="text-[10px] text-[#687894]">Check CIBIL Score</div>
                  </div>
                </a>
                <a
                  href="https://www.phonepe.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl border border-[#e0e7f2] hover:border-[#7136ef] flex items-center gap-2.5 transition-all"
                >
                  <span className="w-7 h-7 rounded-lg bg-[#f4efff] text-[#5f259f] font-black text-xs flex items-center justify-center">Pe</span>
                  <div>
                    <div className="text-xs font-bold text-[#0c1b3b]">PhonePe</div>
                    <div className="text-[10px] text-[#687894]">Check CIBIL Score</div>
                  </div>
                </a>
              </div>
            </div>
          </div>
        );

      /* Screen 10: CIBIL Assessment Result */
      case 'cibilResult':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">CIBIL Assessment</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Credit score verified</h1>
            <p className="text-sm text-[#687894]">{appState.relation}'s credit score meets our financing partner criteria.</p>

            <div className="bg-white p-6 rounded-3xl border border-[#e0e7f2] text-center shadow-sm space-y-3">
              <div className="inline-block px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                {parseInt(appState.demoScore, 10) >= 750 ? 'Excellent Credit Profile' : 'Eligible Credit Profile'}
              </div>
              <div className="text-5xl font-black text-[#0c1b3b] tracking-tight">{appState.demoScore || '—'}</div>
              <div className="text-xs text-[#687894]">Score verified across Credit Bureau report</div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-yellow-400 via-green-500 to-[#7136ef] h-full" style={{ width: `${Math.min(100, Math.max(10, ((parseInt(appState.demoScore, 10) || 650) - 300) / 6))}%` }} />
              </div>
            </div>

            <button onClick={() => go('payerConfirmed')} className="nxt-btn-primary">
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirm & Proceed</span>
            </button>
          </div>
        );

      /* Screen 11: CIBIL Low Remediation */
      case 'cibilLow':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#b84e42]">Credit Assessment</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">We can try another person</h1>
            <p className="text-sm text-[#687894]">The verified credit score is below our 0% EMI lender limit (700).</p>

            <div className="bg-[#fff2ef] p-4 rounded-2xl border border-[#ffd7d1] text-xs text-[#b84e42] space-y-2">
              <b>Don't worry! 84% of students succeed with an alternate family member.</b>
              <p>You can add your Mother, Father, Brother, Sister or select full payment option.</p>
            </div>

            <button onClick={() => go('payer')} className="nxt-btn-primary">
              <span>Choose Another Co-Applicant</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => go('noSupport')} className="w-full py-3 text-xs font-bold text-[#687894]">
              I don't have another family member
            </button>
          </div>
        );

      /* Screen 12: No Alternate Support */
      case 'noSupport':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Alternate Path</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Let's find another path</h1>
            <p className="text-sm text-[#687894]">Our dedicated PRE advisor will assist with special financing options.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#f4efff] flex items-center justify-center font-bold text-[#7136ef]">
                  KS
                </div>
                <div>
                  <div className="font-bold text-sm text-[#0c1b3b]">{finance.assignedPre}</div>
                  <div className="text-xs text-[#687894]">Your Dedicated Enrollment Lead</div>
                </div>
              </div>
              <p className="text-xs text-[#687894]">Assisting you with manual review, collateral-free community financing, or partial fee arrangements.</p>
            </div>

            <button onClick={() => {
              showToast('Support ticket dispatched to CRM');
              go('payment');
            }} className="nxt-btn-primary">
              <PhoneCall className="w-4 h-4" />
              <span>Request Priority Callback</span>
            </button>
          </div>
        );

      /* Screen 13: Supporter Selected */
      case 'payerConfirmed':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Supporter Confirmed</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">{appState.relation} can proceed!</h1>
            <p className="text-sm text-[#687894]">All eligibility parameters cleared. Ready for quick paperless digital KYC.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                <span className="text-[#687894]">Co-Applicant</span>
                <span className="font-bold text-[#0c1b3b]">{appState.coName}</span>
              </div>
              <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                <span className="text-[#687894]">Relation</span>
                <span className="font-bold text-[#0c1b3b]">{appState.relation}</span>
              </div>
              <div className="flex justify-between text-xs py-1.5 border-b border-gray-100">
                <span className="text-[#687894]">Verified Score</span>
                <span className="font-bold text-green-600">{appState.demoScore} CIBIL</span>
              </div>
            </div>

            <button onClick={() => go('kycIntro')} className="nxt-btn-primary">
              <span>Start Digital KYC</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 14: KYC Intro */
      case 'kycIntro':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Identity Verification</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Complete {appState.relation}'s KYC</h1>
            <p className="text-sm text-[#687894]">Quick 3-step digital verification takes under 3 minutes.</p>

            <div className="space-y-3">
              {[
                { title: '1. PAN Card', desc: 'Instant entity name and tax ID validation' },
                { title: '2. Aadhaar Masked Proof', desc: 'Secure address and age verification' },
                { title: '3. Bank Account Proof', desc: 'Penny-drop bank verification for 0% auto-debit' }
              ].map((step, idx) => (
                <div key={idx} className="bg-white p-4 rounded-2xl border border-[#e0e7f2] flex gap-3 items-center">
                  <div className="w-7 h-7 rounded-xl bg-[#f4efff] text-[#7136ef] font-black text-xs flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-xs text-[#0c1b3b]">{step.title}</div>
                    <div className="text-[11px] text-[#687894]">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => go('panUpload')} className="nxt-btn-primary">
              <span>Upload PAN Card</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 15: PAN Upload */
      case 'panUpload':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">PAN · Identity</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Upload PAN card</h1>
            <p className="text-sm text-[#687894]">Upload front side photo or document of {effectiveRelation}'s PAN card.</p>

            {/* Sample PAN Card Visual Guide */}
            <div className="bg-gradient-to-br from-[#e0f2fe] to-[#bae6fd] p-4 rounded-2xl border border-[#7dd3fc] shadow-sm">
              <div className="flex justify-between items-center text-[9px] font-extrabold text-[#0369a1] tracking-wider mb-2">
                <span>INCOME TAX DEPARTMENT · GOVT. OF INDIA</span>
                <span>SAMPLE GUIDE</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[10px] text-[#0c4a6e] font-bold">Permanent Account Number</div>
                  <div className="font-mono text-xs font-black text-[#0f172a] bg-white/70 px-2 py-0.5 rounded inline-block">ABCDE1234F</div>
                  <div className="text-[10px] text-[#0c4a6e] font-semibold">Name · Father's Name · DOB</div>
                </div>
                <div className="w-12 h-14 rounded-lg bg-white/80 border border-[#7dd3fc] flex flex-col items-center justify-center text-[8px] font-bold text-[#0369a1]">
                  <User className="w-5 h-5 mb-0.5" />
                  <span>PHOTO</span>
                </div>
              </div>
            </div>

            {renderDocumentUploader('PAN', 'Capture or Upload PAN Front', 'panPreview', true)}

            <button onClick={() => go('panPreview')} className="nxt-btn-primary">
              <span>Proceed to Field Review</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 16: PAN Field Preview */
      case 'panPreview':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">PAN · Confirm Details</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Check PAN details</h1>
            <p className="text-sm text-[#687894]">AI extracted with 98.5% confidence. Review before confirming.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-[#102448]">PAN Number</label>
                  <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-bold">Verified</span>
                </div>
                <input
                  type="text"
                  value={appState.pan}
                  onChange={e => updateField('pan', e.target.value.toUpperCase())}
                  className="nxt-input uppercase font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Name on PAN</label>
                <input
                  type="text"
                  value={appState.panName}
                  onChange={e => updateField('panName', e.target.value)}
                  className="nxt-input uppercase font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Date of Birth</label>
                <input
                  type="date"
                  value={appState.dob}
                  onChange={e => updateField('dob', e.target.value)}
                  className="nxt-input"
                />
              </div>
            </div>

            <button onClick={() => go('aadhaarUpload')} className="nxt-btn-primary">
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirm & Proceed to Aadhaar</span>
            </button>
          </div>
        );

      /* Screen 17: Aadhaar Upload */
      case 'aadhaarUpload':
        const frontDoc = uploadedDocs.find(d => d.document_type === 'AADHAAR_FRONT');
        const backDoc = uploadedDocs.find(d => d.document_type === 'AADHAAR_BACK');

        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Aadhaar · Identity</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Upload Aadhaar Card</h1>
            <p className="text-sm text-[#687894]">Upload clear photos of both Front & Back sides for address verification.</p>

            {/* Aadhaar Dual Upload: Front & Back */}
            <div className="space-y-5">
              {/* Front Side */}
              <div className="p-4 rounded-2xl border border-[#e0e7f2] bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#f4efff] text-[#7136ef] text-xs font-black flex items-center justify-center">1</span>
                    <span className="text-xs font-bold text-[#0c1b3b]">Aadhaar Front Side (Photo, Name, DOB, Aadhaar #)</span>
                  </div>
                  {frontDoc && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Uploaded</span>}
                </div>
                {renderDocumentUploader('AADHAAR_FRONT', 'Aadhaar Front Side', 'aadhaarUpload', true)}
              </div>

              {/* Back Side */}
              <div className="p-4 rounded-2xl border border-[#e0e7f2] bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#f4efff] text-[#7136ef] text-xs font-black flex items-center justify-center">2</span>
                    <span className="text-xs font-bold text-[#0c1b3b]">Aadhaar Back Side (Residential Address & PIN Code)</span>
                  </div>
                  {backDoc && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">Uploaded</span>}
                </div>
                {renderDocumentUploader('AADHAAR_BACK', 'Aadhaar Back Side', 'aadhaarPreview', true)}
              </div>
            </div>

            <button onClick={() => go('aadhaarPreview')} className="nxt-btn-primary">
              <span>Review Extracted Aadhaar Details</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 18: Aadhaar Preview */
      case 'aadhaarPreview':
        const displayAadhaar = appState.aadhaarNumber && !appState.aadhaarNumber.includes('X') && appState.aadhaarNumber.length >= 12
          ? `XXXX-XXXX-${appState.aadhaarNumber.slice(-4)}`
          : (appState.aadhaarNumber || `XXXX-XXXX-${appState.aadhaarLast4 || '4589'}`);

        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Aadhaar · Details</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Verify extracted Aadhaar</h1>
            <p className="text-sm text-[#687894]">Review OCR extracted details below. You can correct any inaccurate fields before proceeding.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#102448] block mb-1">
                    Aadhaar Number <span className="text-[10px] text-gray-500 font-normal">(Masked for Privacy)</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value={displayAadhaar}
                    className="nxt-input bg-gray-50 text-gray-700 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#102448] block mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    value={appState.aadhaarName || appState.panName}
                    onChange={e => updateField('aadhaarName', e.target.value)}
                    className="nxt-input font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#102448] block mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={appState.dob}
                    onChange={e => updateField('dob', e.target.value)}
                    className="nxt-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#102448] block mb-1">Gender</label>
                  <select
                    value={appState.gender || 'Male'}
                    onChange={e => updateField('gender', e.target.value)}
                    className="nxt-input"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Transgender">Transgender</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Street / Flat / Locality</label>
                <input
                  type="text"
                  value={appState.street}
                  onChange={e => updateField('street', e.target.value)}
                  className="nxt-input"
                  placeholder="House/Flat No, Building, Road name"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#102448] block mb-1">City / District</label>
                  <input
                    type="text"
                    value={appState.city || appState.district}
                    onChange={e => {
                      updateField('city', e.target.value);
                      updateField('district', e.target.value);
                    }}
                    className="nxt-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#102448] block mb-1">State</label>
                  <input
                    type="text"
                    value={appState.stateName}
                    onChange={e => updateField('stateName', e.target.value)}
                    className="nxt-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#102448] block mb-1">Pincode</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={appState.pincode}
                    onChange={e => updateField('pincode', e.target.value)}
                    className="nxt-input font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Complete Address as printed on Back</label>
                <textarea
                  rows={2}
                  value={appState.building || `${appState.street}, ${appState.city}, ${appState.stateName} - ${appState.pincode}`}
                  onChange={e => updateField('building', e.target.value)}
                  className="nxt-input text-xs"
                />
              </div>
            </div>

            <button onClick={() => go('bankUpload')} className="nxt-btn-primary">
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirm & Proceed to Bank Details</span>
            </button>
          </div>
        );

      /* Screen 19: Bank Upload Choice */
      case 'bankUpload':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Bank Proof</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Upload bank proof</h1>
            <p className="text-sm text-[#687894]">Used to configure 0% auto-debit (eNACH) mandate.</p>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'statement', title: 'Bank Statement', desc: 'PDF statement (Last 3-6 months)' },
                { id: 'passbook', title: 'Passbook Photo', desc: 'Front page with Name & Account #' }
              ].map(b => (
                <div
                  key={b.id}
                  onClick={() => updateField('bankType', b.id)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                    appState.bankType === b.id ? 'border-[#7136ef] bg-[#f4efff]/70' : 'border-[#e0e7f2] bg-white'
                  }`}
                >
                  <Building className={`w-6 h-6 mb-2 ${appState.bankType === b.id ? 'text-[#7136ef]' : 'text-gray-400'}`} />
                  <div className="font-bold text-xs text-[#0c1b3b]">{b.title}</div>
                  <div className="text-[10px] text-[#687894] mt-0.5">{b.desc}</div>
                </div>
              ))}
            </div>

            {/* Sample Bank Statement / Passbook Visual Guide */}
            <div className="bg-white p-4 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-2">
              <div className="flex justify-between items-center text-[10px] font-extrabold text-[#7136ef] uppercase">
                <span>{appState.bankType === 'statement' ? 'Sample Bank Statement PDF' : 'Sample Passbook Front Page'}</span>
                <span className="text-[#687894]">Visible Fields</span>
              </div>
              <div className="bg-[#f8fafc] p-3 rounded-xl border border-dashed border-[#cbd5e1] text-[10px] space-y-1 font-mono text-[#334155]">
                <div className="flex justify-between"><span>Account Holder:</span><b>{effectiveRelation}'s Name</b></div>
                <div className="flex justify-between"><span>Account No & IFSC:</span><b>XXXX1823 · SBIN0001234</b></div>
                {appState.bankType === 'statement' && (
                  <div className="pt-1 border-t border-gray-200 text-[#64748b]">Last 3–6 months transactions clearly visible</div>
                )}
              </div>
            </div>

            {renderDocumentUploader('BANK_STATEMENT', appState.bankType === 'statement' ? 'Upload Bank Statement PDF' : 'Upload Passbook Photo', 'bankPreview', true)}

            <button onClick={() => go('bankPreview')} className="nxt-btn-primary">
              <span>Review Extracted Bank Info</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 20: Bank Details & Confirmation */
      case 'bankPreview':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Bank Details · Preview</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Check bank details</h1>
            <p className="text-sm text-[#687894]">Ensure account number matches the borrower's primary bank.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Bank Name</label>
                <input
                  type="text"
                  value={appState.bankName}
                  onChange={e => updateField('bankName', e.target.value)}
                  className="nxt-input font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Account Holder Name</label>
                <input
                  type="text"
                  value={appState.holderName}
                  onChange={e => updateField('holderName', e.target.value)}
                  className="nxt-input uppercase font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Account Number</label>
                <input
                  type="password"
                  value={appState.accountNumber}
                  onChange={e => updateField('accountNumber', e.target.value)}
                  className="nxt-input font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Re-enter Account Number</label>
                <input
                  type="text"
                  value={appState.reAccountNumber}
                  onChange={e => updateField('reAccountNumber', e.target.value)}
                  className="nxt-input font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">IFSC Code</label>
                <input
                  type="text"
                  value={appState.ifsc}
                  onChange={e => updateField('ifsc', e.target.value.toUpperCase())}
                  className="nxt-input uppercase font-mono font-bold"
                />
              </div>
            </div>

            <button onClick={() => go('optionalIntro')} className="nxt-btn-primary">
              <CheckCircle2 className="w-5 h-5" />
              <span>Verify & Continue</span>
            </button>
          </div>
        );

      /* Screen 21: Optional Details Benefit */
      case 'optionalIntro':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Profile · Underwriting</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Speed up class access?</h1>
            <p className="text-sm text-[#687894]">Sharing a few extra work details increases automated NBFC instant sanctioning from 65% to 94%.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div className="flex gap-3">
                <Sparkles className="w-5 h-5 text-[#7136ef] flex-shrink-0" />
                <div className="text-xs text-[#0c1b3b]">
                  <b className="block mb-0.5">Faster Class Access</b>
                  Sharing these additional details helps speed up verification and unlocks your class access faster.
                </div>
              </div>
            </div>

            <button onClick={() => go('optionalDetails')} className="nxt-btn-primary">
              <span>Add Quick Details (2 min)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => go('nbfc')} className="w-full py-3 text-xs font-bold text-[#687894]">
              Skip & Submit to NBFC
            </button>
          </div>
        );

      /* Screen 22: Additional Personal Details */
      case 'optionalDetails':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Optional · Group 1 of 2</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">{effectiveRelation}'s Personal Background</h1>
            <p className="text-sm text-[#687894]">
              Additional details for {appState.coName ? <b>{appState.coName}</b> : effectiveRelation} ({effectiveRelation}).
            </p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">{effectiveRelation}'s Mother's Name</label>
                <input
                  type="text"
                  value={appState.coMotherName}
                  onChange={e => updateField('coMotherName', e.target.value)}
                  placeholder={`Enter ${effectiveRelation}'s mother's full name`}
                  className="nxt-input"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Marital Status</label>
                <select 
                  value={appState.marital} 
                  onChange={e => updateField('marital', e.target.value)}
                  className="nxt-input"
                >
                  <option value="Married">Married</option>
                  <option value="Single">Single</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Education Level</label>
                <select 
                  value={appState.education} 
                  onChange={e => updateField('education', e.target.value)}
                  className="nxt-input"
                >
                  <option value="Graduate">Graduate</option>
                  <option value="Post Graduate">Post Graduate</option>
                  <option value="Diploma">Diploma / 12th</option>
                </select>
              </div>
            </div>

            <button onClick={() => go('optionalWork')} className="nxt-btn-primary">
              <span>Next: Work Details</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 23: Work & Employment */
      case 'optionalWork':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Optional · Group 2 of 2</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Employment details</h1>
            <p className="text-sm text-[#687894]">Details of {appState.relation}'s monthly income source.</p>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Company / Organization</label>
                <input
                  type="text"
                  value={appState.company}
                  onChange={e => updateField('company', e.target.value)}
                  className="nxt-input"
                  placeholder="e.g. Infosys, TCS, Self-Owned"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Monthly In-Hand Income</label>
                <input
                  type="number"
                  value={appState.income}
                  onChange={e => updateField('income', e.target.value)}
                  className="nxt-input font-bold"
                  placeholder="50000"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#102448] block mb-1">Workplace / Office Pincode</label>
                <input
                  type="text"
                  maxLength={6}
                  value={(appState as any).workplacePincode || ''}
                  onChange={e => updateField('workplacePincode' as any, e.target.value)}
                  className="nxt-input font-mono font-bold"
                  placeholder="e.g. 500081"
                />
              </div>
            </div>

            <button onClick={() => go('nbfc')} className="nxt-btn-primary">
              <span>Evaluate Eligible NBFCs</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      /* Screen 24: Dynamic Salesforce-Driven NBFC Status Tracker */
      case 'nbfc':
        const lender = nbfcLive?.activeLender || 'Finance partner is being assigned';
        const statusCode = nbfcLive?.statusCode || 'UNDER_REVIEW';
        const statusLabel = nbfcLive?.statusLabel || 'Under Lender Verification';
        const stages = nbfcLive?.cadenceStages || [
          { step: 1, name: 'Application & Consent', description: 'Application initiated & consent received', isCompleted: true, isCurrent: false },
          { step: 2, name: 'Document & Credit Review', description: 'Underwriting team reviewing KYC documents & bureau score', isCompleted: false, isCurrent: true },
          { step: 3, name: 'Sanction & e-Sign', description: 'Loan agreement approval & digital agreement signing', isCompleted: false, isCurrent: false },
          { step: 4, name: 'Auto-Debit (eNACH)', description: '0% EMI auto-debit registration with verified bank', isCompleted: false, isCurrent: false },
          { step: 5, name: 'Disbursement & Class Access', description: 'Loan disbursed to NxtWave & LMS unlocked', isCompleted: false, isCurrent: false }
        ];

        const isDisbursed = statusCode === 'DISBURSED' || nbfcLive?.classAccessEligible === true;
        const isRejected = statusCode === 'REJECTED';
        const isActionRequired = statusCode === 'EMI_SETUP_PENDING' || statusCode === 'DOCUMENTS_REQUIRED' || isRejected;

        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-[#7136ef]">Lender Partner Status</div>
              <button
                onClick={() => fetchLiveNbfcStatus(false)}
                disabled={isLoadingNbfc}
                className="flex items-center gap-1.5 text-xs font-bold text-[#687894] hover:text-[#7136ef]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingNbfc ? 'animate-spin text-[#7136ef]' : ''}`} />
                <span>{isLoadingNbfc ? 'Updating...' : 'Refresh Status'}</span>
              </button>
            </div>

            <h1 className="text-2xl font-black text-[#0c1b3b]">Loan Application Status</h1>
            <p className="text-sm text-[#687894]">Live application progress with education financing partner.</p>

            {nbfcError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between">
                <span>{nbfcError}</span>
                <button onClick={() => fetchLiveNbfcStatus(false)} className="font-bold underline">Retry</button>
              </div>
            )}

            {/* Active Partner & Loan Overview Card */}
            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div className="flex justify-between items-start pb-3 border-b border-gray-100">
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#687894] tracking-wider">Active Financing Partner</div>
                  <div className="text-sm font-extrabold text-[#0c1b3b]">
                    {String(lender).replace(/_/g, ' ')}
                  </div>
                  {nbfcLive?.applicationReferenceId && !String(nbfcLive.applicationReferenceId).includes('_') && (
                    <div className="text-[11px] font-mono text-[#687894] mt-0.5">Application ID: {nbfcLive.applicationReferenceId}</div>
                  )}
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-bold ${
                  isDisbursed ? 'bg-green-100 text-green-800' :
                  isRejected ? 'bg-red-100 text-red-800' :
                  isActionRequired ? 'bg-amber-100 text-amber-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {statusLabel}
                </span>
              </div>

              {/* Loan Amount Metrics */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div>
                  <span className="text-[#687894] block text-[11px]">Payable Loan Amount:</span>
                  <span className="font-bold text-[#0c1b3b]">{money(nbfcLive?.appliedLoanAmount || finance.balance)}</span>
                </div>
                <div>
                  <span className="text-[#687894] block text-[11px]">Tenure / Plan:</span>
                  <span className="font-bold text-[#7136ef]">{appState.emi || '24'} Months 0% EMI</span>
                </div>
              </div>
            </div>

            {/* Current Stage Explanation Card */}
            <div className={`p-4 rounded-2xl border text-xs space-y-1.5 ${
              isDisbursed ? 'bg-green-50 border-green-200 text-green-900' :
              isRejected ? 'bg-red-50 border-red-200 text-red-900' :
              isActionRequired ? 'bg-amber-50 border-amber-200 text-amber-900' :
              'bg-[#f4efff]/70 border-[#e9ddff] text-[#341b63]'
            }`}>
              <div className="font-extrabold text-sm">{nbfcLive?.userMessage || 'Your application is being processed.'}</div>
              <div className="opacity-90">{nbfcLive?.guidanceMessage || 'Underwriting typically takes 2–6 working hours.'}</div>
              {nbfcLive?.classAccessEta && (
                <div className="pt-1.5 font-bold border-t border-current/20">
                  Class Access ETA: {nbfcLive.classAccessEta}
                </div>
              )}
            </div>

            {/* 5-Stage Cadence Progress Tracker */}
            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#687894]">Application Milestones</div>
              <div className="space-y-4">
                {stages.map((st: any) => {
                  const isDone = st.isCompleted;
                  const isCurrent = st.isCurrent;
                  return (
                    <div key={st.step} className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">
                        {isDone ? (
                          <div className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : isCurrent ? (
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white ${
                            isRejected ? 'bg-red-500' : isActionRequired ? 'bg-amber-500' : 'bg-[#7136ef] animate-pulse'
                          }`}>
                            {st.step}
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-[10px] font-bold flex items-center justify-center">
                            {st.step}
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 text-xs">
                        <div className={`font-bold ${isCurrent ? 'text-[#0c1b3b]' : isDone ? 'text-gray-700' : 'text-gray-400'}`}>
                          {st.name}
                        </div>
                        <div className="text-[11px] text-[#687894] leading-relaxed">
                          {st.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Contextual Action Button */}
            {isDisbursed ? (
              <button onClick={() => go('classAccess')} className="nxt-btn-primary">
                <span>Go to Learning Platform</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : isRejected ? (
              <div className="space-y-2">
                <button onClick={() => go('payer')} className="nxt-btn-primary">
                  <span>Change Co-Applicant</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <a
                  href="https://wa.me/919392901586?text=Hi%2C%20my%20loan%20application%20was%20declined.%20Please%20help%20with%20alternate%20options."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-xl border border-gray-300 text-xs font-bold text-center block text-[#0c1b3b]"
                >
                  Connect with PRE Advisor on WhatsApp
                </a>
              </div>
            ) : isActionRequired ? (
              <div className="space-y-2">
                <a
                  href="https://wa.me/919392901586?text=Hi%2C%20I%20am%20ready%20to%20complete%20my%20loan%20mandate%20and%20auto-debit."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nxt-btn-primary text-center block"
                >
                  <span>Connect with PRE to Setup Auto-Debit</span>
                </a>
                <button onClick={() => fetchLiveNbfcStatus(false)} className="w-full py-2.5 text-xs font-bold text-[#687894]">
                  Refresh Status
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={() => fetchLiveNbfcStatus(false)} className="nxt-btn-primary">
                  <RefreshCw className="w-4 h-4" />
                  <span>Check Latest Status</span>
                </button>
              </div>
            )}
          </div>
        );

      /* Screen 25: Class Access Dashboard */
      case 'classAccess':
        return (
          <div className="space-y-6">
            <div className="text-xs font-bold uppercase tracking-wider text-green-600">Onboarding Complete</div>
            <h1 className="text-2xl font-black text-[#0c1b3b]">Welcome to NxtWave!</h1>
            <p className="text-sm text-[#687894]">Your enrollment is 100% complete. Class access has been provisioned.</p>

            <div className="bg-gradient-to-br from-[#078758] to-[#045939] p-6 rounded-3xl text-white shadow-lg space-y-4">
              <div className="text-xs uppercase font-bold tracking-wider opacity-90">Student Portal Active</div>
              <div className="text-xl font-extrabold">{finance.program}</div>
              <div className="text-xs opacity-90">
                Batch Code: <span className="font-mono font-bold">NXW-EDGE-2026</span>
              </div>
              <a
                href="#lms-portal"
                onClick={e => { e.preventDefault(); showToast('Redirecting to NxtWave Learning Platform...'); }}
                className="block text-center bg-white text-[#078758] font-bold text-sm py-3 rounded-xl shadow-sm"
              >
                Go to Learning Platform
              </a>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#e0e7f2] shadow-sm space-y-3">
              <div className="text-xs font-bold text-[#0c1b3b]">What happens next?</div>
              <ul className="text-xs text-[#687894] space-y-1.5 list-disc list-inside">
                <li>Your student login credentials have been sent via WhatsApp.</li>
                <li>Your dedicated mentor will host the onboarding orientation session.</li>
                <li>Course materials and initial assignments are unlocked.</li>
              </ul>
            </div>
          </div>
        );

      default:
        return <div>Stage not found</div>;
    }
  };

  /* =========================================================
     MAIN APP SHELL
  ========================================================= */

  return (
    <div className="min-h-screen flex flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#0c1b3b] text-white text-xs font-bold py-2.5 px-4 rounded-full shadow-lg flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#844cff]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-[#e0e7f2] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#7136ef] text-white font-black text-lg flex items-center justify-center shadow-md shadow-[#7136ef]/20">
              N
            </div>
            <div>
              <div className="text-sm font-extrabold text-[#0c1b3b] tracking-tight">{t('appTitle')}</div>
              <div className="text-[10px] text-[#687894] hidden sm:block">Digital KYC & Enrollment Platform</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex items-center gap-1 bg-[#edf3fc] p-1 rounded-xl border border-[#a9bbd4]/60">
              <Globe2 className="w-3.5 h-3.5 text-[#687894] ml-1.5" />
              {(['en', 'te', 'hi', 'kn'] as Language[]).map(l => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-lg uppercase ${
                    lang === l ? 'bg-white text-[#7136ef] shadow-sm' : 'text-[#687894]'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <a
              href="https://wa.me/919392901586?text=Hi%20NxtWave%2C%20I%20need%20assistance%20with%20my%20KYC%20and%20onboarding."
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold text-[#078758] bg-green-50 px-3 py-1.5 rounded-xl border border-green-200 hover:bg-green-100 transition-all"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Connect on WhatsApp (+91 93929 01586)</span>
            </a>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8 flex flex-col justify-center items-center">
        {/* Interactive Stage Form Viewport */}
        <div className="w-full bg-white p-6 sm:p-8 rounded-3xl border border-[#e0e7f2] shadow-sm relative">
          {resumedNotice && appState.stage !== 'auth' && appState.stage !== 'authOtp' && (
            <div className="mb-4 p-3 rounded-xl bg-[#f4efff] border border-[#d8c4ff] text-xs text-[#4b23a3] flex items-center justify-between gap-2">
              <span>{resumedNotice}</span>
              <button onClick={() => setResumedNotice(null)} className="font-bold text-[#7136ef]">Dismiss</button>
            </div>
          )}

          {/* Controlled Back Button: strictly hidden on auth, nbfc, classAccess, and when server locks navigation */}
          {appState.history.length > 0 &&
            !['auth', 'authOtp', 'nbfc', 'classAccess'].includes(appState.stage) &&
            !isStageLocked && (
              <button
                onClick={goBack}
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#687894] hover:text-[#0c1b3b]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('back')}</span>
              </button>
            )}

          {renderScreen()}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-6 border-t border-[#e0e7f2] bg-white text-center text-xs text-[#687894]">
        <div className="max-w-6xl mx-auto px-4">
          NxtWave Digital KYC & Enrollment Platform · Compliant with RBI Digital Lending Guidelines & UIDAI Standards
        </div>
      </footer>
    </div>
  );
}

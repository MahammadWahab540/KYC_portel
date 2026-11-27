export interface WorkflowStage {
  id: string;
  title: string;
  group: string;
}

export interface EnrollmentFinance {
  program: string;
  programCode?: string;
  course: number;
  totalAmountToBePaid?: number;
  discount: number;
  alreadyPaid: number;
  amountPaidToCompany?: number;
  balance: number;
  remainingAmountToBePaid?: number;
  assignedPre: string;
  assignedPrePhone: string;
}

export interface ApplicationState {
  stage: string;
  history: string[];
  countryCode: string;
  phone: string;
  studentOtp: string;
  method: 'emi' | 'full' | 'card';
  emi: string; // '12' | '18' | '24'
  creditCardBank: string;
  creditCardLimit: string;
  relation: string; // 'Father' | 'Mother' | 'Self' | etc.
  otherRelation: string;
  coName: string;
  coMotherName: string;
  coPhone: string;
  coEmail: string;
  coOtp: string;
  cibilFile: string;
  cibilMode: string;
  demoScore: string;
  scoreConfirmed: boolean;
  failedRelation: string;
  panFile: string;
  pan: string;
  panName: string;
  dob: string;
  aadhaarNumber?: string;
  aadhaarFront: string;
  aadhaarBack: string;
  aadhaarName: string;
  aadhaarLast4: string;
  gender: string;
  building: string;
  street: string;
  stateName: string;
  district: string;
  city: string;
  pincode: string;
  residenceType: string;
  bankType: 'statement' | 'passbook';
  bankFile: string;
  bankName: string;
  holderName: string;
  accountNumber: string;
  reAccountNumber: string;
  ifsc: string;
  marital: string;
  education: string;
  occupation: string;
  company: string;
  income: string;
  workplacePincode?: string;
  workMode: string;
  nbfcStatus: string;
  accessStatus: string;
  team: string;
}

export const INITIAL_APPLICATION_STATE: ApplicationState = {
  stage: 'auth',
  history: [],
  countryCode: '+91',
  phone: '',
  studentOtp: '',
  method: 'emi',
  emi: '24',
  creditCardBank: '',
  creditCardLimit: '',
  relation: 'Father',
  otherRelation: '',
  coName: '',
  coMotherName: '',
  coPhone: '',
  coEmail: '',
  coOtp: '',
  cibilFile: '',
  cibilMode: 'upload',
  demoScore: '',
  scoreConfirmed: false,
  failedRelation: '',
  panFile: '',
  pan: '',
  panName: '',
  dob: '',
  aadhaarNumber: '',
  aadhaarFront: '',
  aadhaarBack: '',
  aadhaarName: '',
  aadhaarLast4: '',
  gender: '',
  building: '',
  street: '',
  stateName: '',
  district: '',
  city: '',
  pincode: '',
  residenceType: 'Owned',
  bankType: 'statement',
  bankFile: '',
  bankName: '',
  holderName: '',
  accountNumber: '',
  reAccountNumber: '',
  ifsc: '',
  marital: 'Single',
  education: 'Graduate',
  occupation: 'Salaried',
  company: '',
  income: '',
  workplacePincode: '',
  workMode: 'Full-time',
  nbfcStatus: 'CONSENT_PENDING',
  accessStatus: 'ACTIVE',
  team: 'Academic Onboarding'
};

export const INITIAL_FINANCE: EnrollmentFinance = {
  program: 'NxtWave Academy EDGE',
  programCode: 'Edge',
  course: 130000,
  discount: 15000,
  alreadyPaid: 18000,
  balance: 97000,
  assignedPre: 'Kavita Sharma',
  assignedPrePhone: '+91 9123456780'
};

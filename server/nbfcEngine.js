/**
 * Centralized Multi-Lender NBFC Rule Engine and Adapters
 */

export const NBFC_LENDERS = [
  {
    code: 'PROPELLED',
    name: 'Propelld Education Loans',
    logo: 'P',
    minScore: 680,
    minIncome: 25000,
    minAge: 21,
    maxAge: 58,
    allowedRelations: ['Self', 'Father', 'Mother', 'Brother', 'Sister', 'Spouse'],
    features: ['Instant digital approval', 'Zero prepayment fees', '100% paperless']
  },
  {
    code: 'LIQUILOANS',
    name: 'LiquiLoans Flexi Edu',
    logo: 'L',
    minScore: 700,
    minIncome: 30000,
    minAge: 23,
    maxAge: 55,
    allowedRelations: ['Father', 'Mother', 'Self'],
    features: ['Fast eNACH setup', 'Special zero-cost EMI tier', 'Direct student portal link']
  },
  {
    code: 'AVANSE',
    name: 'Avanse Financial Services',
    logo: 'A',
    minScore: 690,
    minIncome: 20000,
    minAge: 21,
    maxAge: 60,
    allowedRelations: ['Father', 'Mother', 'Brother', 'Sister'],
    features: ['Flexible repayment terms', 'Subsidized interest rate options']
  },
  {
    code: 'FIBE',
    name: 'Fibe (EarlySalary)',
    logo: 'F',
    minScore: 650,
    minIncome: 25000,
    minAge: 21,
    maxAge: 50,
    allowedRelations: ['Self', 'Father'],
    features: ['Quick salary-based approval', 'Instant sanction letter']
  }
];

export class NbfcEngine {
  evaluateEligibility(applicantProfile) {
    const score = Number(applicantProfile.cibilScore || 750);
    const relation = applicantProfile.relation || 'Father';
    const income = Number(applicantProfile.income || 35000);

    const eligible = [];
    const ineligible = [];

    for (const lender of NBFC_LENDERS) {
      const reasons = [];

      if (score < lender.minScore) {
        reasons.push(`CIBIL score ${score} below minimum threshold of ${lender.minScore}`);
      }
      if (income < lender.minIncome) {
        reasons.push(`Monthly income below minimum required ₹${lender.minIncome.toLocaleString('en-IN')}`);
      }
      if (!lender.allowedRelations.includes(relation)) {
        reasons.push(`Relationship '${relation}' not permitted by lender`);
      }

      if (reasons.length === 0) {
        eligible.push(lender);
      } else {
        ineligible.push({ ...lender, reasons });
      }
    }

    return {
      eligibleCount: eligible.length,
      hasEligibleLenders: eligible.length > 0,
      eligible,
      ineligible
    };
  }
}

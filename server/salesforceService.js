/**
 * Salesforce Enrollment, Fee & NBFC Sync Service
 *
 * Authenticates via OAuth 2.0 Client Credentials against SF_LOGIN_URL
 * and queries Academy_Onboarding_PRE__c and NBFC_Onboarding__c for live data.
 */

import dotenv from 'dotenv';
import { DB, DEFAULT_ENROLLMENT_ID } from './db.js';

dotenv.config();

export class SalesforceService {
  constructor() {
    this.loginUrl = process.env.SF_LOGIN_URL || '';
    this.clientId = process.env.SF_CLIENT_ID || '';
    this.clientSecret = process.env.SF_CLIENT_SECRET || '';
    this.cachedToken = null;
    this.cachedInstanceUrl = null;
    this.tokenFetchedAt = 0;
  }

  isConfigured() {
    return Boolean(this.loginUrl && this.clientId && this.clientSecret);
  }

  async _getAccessToken() {
    if (this.cachedToken && Date.now() - this.tokenFetchedAt < 45 * 60 * 1000) {
      return { accessToken: this.cachedToken, instanceUrl: this.cachedInstanceUrl };
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    const res = await fetch(`${this.loginUrl}/services/oauth2/token`, {
      method: 'POST',
      body: params
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Salesforce OAuth failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    this.cachedToken = data.access_token;
    this.cachedInstanceUrl = data.instance_url;
    this.tokenFetchedAt = Date.now();
    return { accessToken: this.cachedToken, instanceUrl: this.cachedInstanceUrl };
  }

  async fetchEnrollmentByPhone(phone) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);

    if (this.isConfigured() && cleanPhone) {
      try {
        const { accessToken, instanceUrl } = await this._getAccessToken();
        const fields = [
          'Id',
          'Name',
          'Program_PRE__c',
          'Total_Amount_to_be_Paid__c',
          'Amount_to_be_Receive__c',
          'Total_Amount_PRE__c',
          'Partial_amount_paid_to_company__c',
          'Amount_Paid_Till_Now_To_Nxtwave_PRE__c',
          'Total_Discount_NBFC_Other_PRE__c',
          'Coupon_Discount_Amount__c',
          'Payment_Plan_Discount__c',
          'Referral_Discount__c',
          'Remaining_Amount_To_Be_Paid_PRE__c',
          'Owner.Name'
        ].join(',');

        const soql = encodeURIComponent(
          `SELECT ${fields} FROM Academy_Onboarding_PRE__c ` +
          `WHERE PHONE_NUMBER__c LIKE '%${cleanPhone}' ` +
          `OR Student_Number__c LIKE '%${cleanPhone}' ` +
          `OR Student_WhatsApp_Number__c LIKE '%${cleanPhone}' ` +
          `ORDER BY LastModifiedDate DESC LIMIT 1`
        );

        const res = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${soql}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (res.ok) {
          const data = await res.json();
          const rec = data.records?.[0];
          if (rec) {
            // 1. Total program fee from SF: Total_Amount_to_be_Paid__c
            const course = Number(rec.Total_Amount_to_be_Paid__c ?? rec.Amount_to_be_Receive__c ?? 0);

            // 2. Amount Paid to Company (so far amount they paid): Total_Amount_PRE__c
            const alreadyPaid = Number(rec.Total_Amount_PRE__c ?? rec.Partial_amount_paid_to_company__c ?? rec.Amount_Paid_Till_Now_To_Nxtwave_PRE__c ?? 0);

            // 3. Remaining Amount To Be Paid (amount they needed to pay): Remaining_Amount_To_Be_Paid_PRE__c
            const balance = Number(rec.Remaining_Amount_To_Be_Paid_PRE__c ?? (course - alreadyPaid));

            const discount =
              Number(rec.Payment_Plan_Discount__c || 0) +
              Number(rec.Total_Discount_NBFC_Other_PRE__c || 0) +
              Number(rec.Coupon_Discount_Amount__c || 0) +
              Number(rec.Referral_Discount__c || 0);

            let programName = 'NxtWave Academy Specialization';
            let programCode = 'Edge';
            if (rec.Program_PRE__c) {
              const p = String(rec.Program_PRE__c);
              if (p.toLowerCase().includes('genius') || p.toLowerCase().includes('genie')) {
                programName = 'NxtWave Academy GENIUS';
                programCode = 'Genius';
              } else if (p.toLowerCase().includes('smart')) {
                programName = 'NxtWave Academy SMART';
                programCode = 'Smart';
              } else {
                programName = `NxtWave Academy ${p}`;
                programCode = p;
              }
            }

            return {
              source: 'SALESFORCE',
              recordId: rec.Id,
              studentName: rec.Name || 'Student',
              enrollment: {
                program: programName,
                programCode,
                course, // Total Amount to be Paid (as total program fee)
                totalAmountToBePaid: course,
                discount,
                alreadyPaid, // Amount Paid to Company (so far amount they paid)
                amountPaidToCompany: alreadyPaid,
                balance, // Remaining Amount To Be Paid (amount they needed to pay)
                remainingAmountToBePaid: balance,
                assignedPre: rec.Owner?.Name || 'NxtWave PRE Advisor',
                assignedPrePhone: '+91 93929 01586'
              }
            };
          }
        }
      } catch (err) {
        console.warn('[SalesforceService] Live query failed:', err.message);
      }
    }

    const fallback = DB.enrollments.get(DEFAULT_ENROLLMENT_ID);
    return {
      source: 'FALLBACK_LOCAL',
      configured: this.isConfigured(),
      enrollment: {
        program: fallback.program_name,
        programCode: 'Edge',
        course: fallback.course_fee,
        discount: fallback.discount,
        alreadyPaid: fallback.already_paid,
        balance: fallback.balance,
        assignedPre: fallback.assigned_pre_name,
        assignedPrePhone: '+91 93929 01586'
      }
    };
  }

  /**
   * Fetches authoritative NBFC status records (parent Academy_Onboarding_PRE__c and child NBFC_Onboarding__c)
   */
  async fetchNbfcStatusByPhone(phone) {
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    if (!this.isConfigured() || !cleanPhone) {
      return { source: 'UNCONFIGURED', parentRecord: null, childRecord: null };
    }

    try {
      const { accessToken, instanceUrl } = await this._getAccessToken();

      // 1. Query Parent Academy_Onboarding_PRE__c
      const parentFields = [
        'Id', 'Name', 'Onboarding_Status__c', 'NBFC_Status__c', 'Choose_NBFC_PRE__c',
        'Status_Of_Decision_in_NBFC_PRE__c', 'Northern_Arc_Overall_Stages__c',
        'Fibe_Overall_Stages__c', 'Fibe_Overall_Loan_Status__c', 'Finz_Overall_Stages__c',
        'Gyandhan_Overall_Stages__c', 'JODO_NBFC_Status__c', 'Disbursed_NBFC_Name__c',
        'Provide_Class_Access__c', 'Applied_Loan_Amount_PRE__c', 'LastModifiedDate'
      ].join(',');

      const parentSoql = encodeURIComponent(
        `SELECT ${parentFields} FROM Academy_Onboarding_PRE__c ` +
        `WHERE PHONE_NUMBER__c LIKE '%${cleanPhone}' ` +
        `OR Student_Number__c LIKE '%${cleanPhone}' ` +
        `OR Student_WhatsApp_Number__c LIKE '%${cleanPhone}' ` +
        `ORDER BY LastModifiedDate DESC LIMIT 1`
      );

      const parentRes = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${parentSoql}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });

      let parentRecord = null;
      if (parentRes.ok) {
        const pData = await parentRes.json();
        parentRecord = pData.records?.[0] || null;
      }

      // 2. Query Child NBFC_Onboarding__c record linked to this student
      const childFields = [
        'Id', 'Name', 'Choose_NBFC_PRE__c', 'other_NBFC_PRE__c', 'Application_Status_PRE__c',
        'Northern_Arc_Overall_Stages__c', 'Northern_Arc_Remarks__c', 'Gyandhan_Overall_Stages__c',
        'Gyandhan_Sub_Status__c', 'Fibe_Overall_Stages__c', 'Fibe_Overall_Loan_Status__c',
        'Auxilo_Overall_Stages__c', 'Techfino_Overall_Status__c', 'Bajaj_Overall_Status_Presa__c',
        'NBFC_Stage_of_Reps__c', 'Post_Approval_Status_Pre__c', 'Applied_Loan_Amount_PRE__c',
        'Effective_Approved_Amount__c', 'NBFC_Application_Reference_Number_PRE__c',
        'Loan_Id__c', 'Provide_Class_Access__c', 'LastModifiedDate'
      ].join(',');

      const childSoql = encodeURIComponent(
        `SELECT ${childFields} FROM NBFC_Onboarding__c ` +
        `WHERE student_phone_number__c LIKE '%${cleanPhone}' ` +
        (parentRecord?.Id ? `OR Academy_Onboarding_PRE_L__c = '${parentRecord.Id}' ` : '') +
        `ORDER BY LastModifiedDate DESC LIMIT 1`
      );

      const childRes = await fetch(`${instanceUrl}/services/data/v59.0/query/?q=${childSoql}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });

      let childRecord = null;
      if (childRes.ok) {
        const cData = await childRes.json();
        childRecord = cData.records?.[0] || null;
      }

      return {
        source: 'SALESFORCE',
        parentRecord,
        childRecord
      };
    } catch (err) {
      console.warn('[SalesforceService] NBFC status query error:', err.message);
      return { source: 'ERROR', error: err.message, parentRecord: null, childRecord: null };
    }
  }
}

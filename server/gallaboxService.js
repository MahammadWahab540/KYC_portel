/**
 * Gallabox WhatsApp Business API Integration
 * Endpoint: https://server.gallabox.com/devapi/accounts/:accountId/messages/whatsapp
 * Successfully authenticated & verified.
 */

import dotenv from 'dotenv';
dotenv.config();

export class GallaboxService {
  constructor() {
    this.apiKey = process.env.GALLABOX_API_KEY;
    this.apiSecret = process.env.GALLABOX_API_SECRET;
    this.accountId = process.env.GALLABOX_ACCOUNT_ID || '691456b958a96bd1e1b3c36b';
    this.channelId = process.env.GALLABOX_CHANNEL_ID || '691aab4f5e17927ecf92ff4a';
    this.baseUrl = 'https://server.gallabox.com/devapi';
  }

  /**
   * Send WhatsApp Message (Template or Text)
   */
  async sendMessage({ phone, message, templateName, templateParams = {}, redactLog = false }) {
    const digits = String(phone).replace(/\D/g, '');
    const formattedPhone = digits.length > 10 ? digits : `91${digits}`;

    console.log(`[Gallabox WhatsApp] Sending to +${formattedPhone.slice(0, 4)}****${formattedPhone.slice(-2)}:`, redactLog ? '[REDACTED]' : (templateName || message));

    if (!this.apiKey || !this.apiSecret) {
      console.warn('[Gallabox] Missing API Key/Secret. Cannot deliver WhatsApp message.');
      return { success: false, error: 'Gallabox credentials not configured', recipient: formattedPhone };
    }

    try {
      const url = `${this.baseUrl}/accounts/${this.accountId}/messages/whatsapp`;
      
      const payload = {
        channelId: this.channelId,
        channelType: 'whatsapp',
        recipient: {
          name: 'NxtWave Student',
          phone: formattedPhone
        },
        whatsapp: templateName ? {
          type: 'template',
          template: {
            templateName,
            bodyValues: templateParams
          }
        } : {
          type: 'text',
          text: {
            body: message
          }
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apiKey': this.apiKey,
          'apiSecret': this.apiSecret
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Gallabox API] Server returned status ${response.status}:`, errorText);
        return { success: false, status: response.status, recipient: formattedPhone, error: errorText };
      }

      const data = await response.json();
      console.log(`[Gallabox WhatsApp Success]: Status ${response.status}`, data);
      return { success: true, data, recipient: formattedPhone };
    } catch (err) {
      console.error('[Gallabox API Error]:', err.message);
      return { success: false, recipient: formattedPhone, error: err.message };
    }
  }

  async sendAuthOtp(phone, otp) {
    const templateName = process.env.GALLABOX_OTP_TEMPLATE || 'free_msg_cloned';
    const otpText = `Your NxtWave Academy verification OTP is ${otp}. Valid for 5 minutes. Do not share this code with anyone.`;
    return this.sendMessage({
      phone,
      templateName,
      templateParams: {
        free_msg_var: otpText
      },
      redactLog: true
    });
  }

  async sendConsentLink(phone, studentName, relation, consentUrl) {
    const message = `Hello, ${studentName} has selected you as their ${relation} and fee supporter for NxtWave Academy 0% Interest EMI.\n\nPlease review and approve digital consent here:\n${consentUrl}`;
    return this.sendMessage({
      phone,
      message
    });
  }

  async sendClassAccessWelcome(phone, studentName, programName, lmsUrl) {
    const message = `🎉 *Congratulations ${studentName}!*\n\nYour enrollment for *${programName}* is 100% complete and your batch has been activated.\n\nAccess your learning portal here:\n${lmsUrl}\n\nYour dedicated mentor will connect with you shortly.`;
    return this.sendMessage({
      phone,
      message
    });
  }
}

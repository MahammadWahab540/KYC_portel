/**
 * Gallabox WhatsApp Business API Integration
 * Endpoint: https://server.gallabox.com/devapi/messages/whatsapp
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
    this.baseUrl = process.env.GALLABOX_API_URL || 'https://server.gallabox.com/devapi/messages/whatsapp';
  }

  /**
   * Send WhatsApp Message (Template or Text) with timeout, retry, and PII masking
   */
  async sendMessage({ phone, message, templateName, templateParams = {}, redactLog = false, correlationId = '' }) {
    const digits = String(phone).replace(/\D/g, '');
    const formattedPhone = digits.length > 10 ? digits : `91${digits}`;
    const maskedPhone = `+${formattedPhone.slice(0, 4)}****${formattedPhone.slice(-2)}`;

    console.log(`[Gallabox WhatsApp][${correlationId || 'N/A'}] Sending to ${maskedPhone}:`, redactLog ? '[REDACTED_OTP]' : (templateName || message));

    if (!this.apiKey || !this.apiSecret) {
      console.warn('[Gallabox] Missing API Key/Secret. Cannot deliver WhatsApp message.');
      return { success: false, error: 'Gallabox credentials not configured', recipient: formattedPhone };
    }

    const url = this.baseUrl.includes('/messages/whatsapp')
      ? this.baseUrl
      : `${this.baseUrl}/messages/whatsapp`;

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

    // Retry loop (up to 2 attempts with 1s backoff)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apiKey': this.apiKey,
            'apiSecret': this.apiSecret
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[Gallabox API][${correlationId || 'N/A'}] Attempt ${attempt} returned status ${response.status}:`, errorText);
          if (attempt === 1 && response.status >= 500) {
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          return { success: false, status: response.status, recipient: formattedPhone, error: errorText };
        }

        const data = await response.json();
        console.log(`[Gallabox WhatsApp Success][${correlationId || 'N/A'}]: Status ${response.status}`);
        return { success: true, data, recipient: formattedPhone };
      } catch (err) {
        console.error(`[Gallabox API Error][${correlationId || 'N/A'}] Attempt ${attempt}:`, err.message);
        if (attempt === 1) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return { success: false, recipient: formattedPhone, error: err.message };
      }
    }
  }

  async sendAuthOtp(phone, otp, correlationId = '') {
    const templateName = process.env.GALLABOX_OTP_TEMPLATE || 'free_msg_cloned';
    const otpText = `Your NxtWave Academy verification OTP is ${otp}. Valid for 5 minutes. Do not share this code with anyone.`;
    return this.sendMessage({
      phone,
      templateName,
      templateParams: {
        free_msg_var: otpText
      },
      redactLog: true,
      correlationId
    });
  }

  async sendConsentLink(phone, studentName, relation, consentUrl, correlationId = '') {
    const message = `Hello, ${studentName} has selected you as their ${relation} and fee supporter for NxtWave Academy 0% Interest EMI.\n\nPlease review and approve digital consent here:\n${consentUrl}`;
    return this.sendMessage({
      phone,
      message,
      correlationId
    });
  }
}

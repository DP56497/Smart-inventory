const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    ) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
  }

  async sendPasswordResetEmail({ to, resetUrl, userName }) {
    const fromAddress = process.env.EMAIL_FROM || '"Smart-Inventory Security" <noreply@smart-inventory.io>';
    const subject = 'Reset Your Smart-Inventory Password';

    const textContent = `Hello ${userName || 'User'},

You requested a password reset for your Smart-Inventory account.
Please use the following link to reset your password (valid for 15 minutes):

${resetUrl}

If you did not request this, please ignore this email or contact your organization administrator immediately.

The Smart-Inventory Team`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); padding: 32px 24px; text-align: center; }
    .logo-text { color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: -0.5px; margin: 0; }
    .logo-sub { color: #94a3b8; font-size: 13px; margin-top: 4px; }
    .body { padding: 32px 28px; }
    .greeting { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .btn-container { text-align: center; margin: 28px 0; }
    .reset-btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25); }
    .callout { background-color: #f1f5f9; border-left: 4px solid #4f46e5; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #64748b; margin-bottom: 24px; }
    .fallback-link { word-break: break-all; font-size: 12px; color: #6366f1; }
    .footer { border-top: 1px solid #f1f5f9; padding: 20px 28px; text-align: center; font-size: 12px; color: #94a3b8; background-color: #fafafa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="logo-text">Smart-Inventory</h1>
      <div class="logo-sub">Multi-Tenant Business ERP & POS</div>
    </div>
    <div class="body">
      <div class="greeting">Password Reset Request</div>
      <p class="message">
        Hello <strong>${userName || 'there'}</strong>,<br>
        We received a request to reset the password for your Smart-Inventory account associated with <strong>${to}</strong>.
      </p>
      <div class="btn-container">
        <a href="${resetUrl}" class="reset-btn" target="_blank">Reset Password</a>
      </div>
      <div class="callout">
        <strong>Important:</strong> This reset link will expire in <strong>15 minutes</strong>. If you did not make this request, you can safely ignore this email — your account remains secure.
      </div>
      <p class="message" style="font-size: 12px; color: #64748b;">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${resetUrl}" class="fallback-link">${resetUrl}</a>
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Smart-Inventory Inc. All rights reserved.
    </div>
  </div>
</body>
</html>`;

    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: fromAddress,
          to,
          subject,
          text: textContent,
          html: htmlContent
        });
        return { success: true, messageId: info.messageId };
      } catch (error) {
        console.error('Failed to send password reset email via SMTP:', error.message);
        // Fallback to console logging if SMTP fails
      }
    }

    // Dev / Test / Fallback logging
    console.log('\n============================================================');
    console.log('[EMAIL SERVICE - DEV/FALLBACK]');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log('Validity: 15 minutes');
    console.log('============================================================\n');

    return { success: true, fallback: true, resetUrl };
  }
}

module.exports = new EmailService();

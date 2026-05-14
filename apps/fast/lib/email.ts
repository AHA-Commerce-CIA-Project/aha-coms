import { Resend } from 'resend';
import { getAppUrl } from '@/lib/appUrl';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// On Resend free tier, can only send to verified email.
const NOTIFICATION_EMAIL = process.env.RESEND_NOTIFICATION_EMAIL || 'alif.masyhur@ahacommerce.net';

// Google Apps Script email sender - bypasses Resend free tier limitations
// Can send to any email via Google Workspace
const APPS_SCRIPT_EMAIL_URL = process.env.APPS_SCRIPT_EMAIL_URL || '';
const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET || 'aha-fast-email-secret-2026';

export async function sendViaAppsScript(to: string[], subject: string, htmlBody: string, cc?: string): Promise<boolean> {
  if (!APPS_SCRIPT_EMAIL_URL) {
    console.warn('APPS_SCRIPT_EMAIL_URL not set, cannot send via Apps Script');
    return false;
  }

  try {
    const response = await fetch(APPS_SCRIPT_EMAIL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        secret: APPS_SCRIPT_SECRET,
        to,
        subject,
        htmlBody,
        cc,
      }),
    });

    const result = await response.json();
    if (result.success) {
      console.log(`Apps Script email sent to: ${to.join(', ')}`);
      return true;
    } else {
      console.error('Apps Script email error:', result.error);
      return false;
    }
  } catch (err) {
    console.error('Failed to send via Apps Script:', err);
    return false;
  }
}

interface RequestEmailData {
  taskToken: string;
  requesterName: string;
  requesterDivision: string | null;
  title: string;
  description: string;
  urgency: string;
  requestType: string;
  requesterEmail?: string;
}

export async function sendRequestNotificationEmail(data: RequestEmailData) {
  const appUrl = getAppUrl();
  const trackUrl = `${appUrl}/track?token=${data.taskToken}`;

  const requestTypeLabel: Record<string, string> = {
    'fix_request': 'Partner Request',
    'google_sheets': 'Google Sheets Maintenance',
    'other': 'Other',
  };

  const urgencyLabel: Record<string, string> = {
    'P1': 'Critical - Urgent & Important',
    'P2': 'High - Very Important',
    'P3': 'Medium - Normal',
    'P4': 'Low Priority',
    '5-minute': '5 Minute Quick Task',
  };

  const recipients = [NOTIFICATION_EMAIL];
  if (data.requesterEmail && data.requesterEmail !== NOTIFICATION_EMAIL) {
    recipients.push(data.requesterEmail);
  }

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #0F0E7F 0%, #4F46E5 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          &#9889; FAST - New Request Submitted
        </h1>
      </div>

      <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
          A new request has been submitted and is awaiting action.
        </p>

        <div style="background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; text-align: center;">
          <p style="color: #6366F1; font-size: 12px; margin: 0 0 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Tracking Token</p>
          <p style="color: #0F0E7F; font-size: 24px; margin: 0; font-weight: 800; letter-spacing: 2px;">${data.taskToken}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px; width: 140px;">Requester</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #1E293B; font-size: 13px; font-weight: 600;">${data.requesterName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px;">Division</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #1E293B; font-size: 13px;">${data.requesterDivision || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px;">Request Type</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #1E293B; font-size: 13px;">${requestTypeLabel[data.requestType] || data.requestType}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px;">Title</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #1E293B; font-size: 13px; font-weight: 600;">${data.title}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px;">Priority</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #1E293B; font-size: 13px;">
              <span style="background: ${data.urgency === 'P1' ? '#FEE2E2' : data.urgency === 'P2' ? '#FFF7ED' : '#F0FDF4'}; color: ${data.urgency === 'P1' ? '#DC2626' : data.urgency === 'P2' ? '#EA580C' : '#16A34A'}; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 12px;">
                ${data.urgency} - ${urgencyLabel[data.urgency] || data.urgency}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; color: #94A3B8; font-size: 13px; vertical-align: top;">Description</td>
            <td style="padding: 10px 12px; color: #1E293B; font-size: 13px; white-space: pre-wrap;">${data.description}</td>
          </tr>
        </table>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${trackUrl}" style="display: inline-block; background: #0F0E7F; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Track Request Status
          </a>
        </div>

        <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; margin-top: 24px;">
          <p style="color: #94A3B8; font-size: 11px; margin: 0; text-align: center;">
            AHA FAST - FBI Assignment Smart Tracker<br>
            This is an automated notification. Please do not reply to this email.
          </p>
        </div>
      </div>
    </div>
  `;

  const subject = `[FAST] New Request: ${data.title} (${data.urgency}) - Token: ${data.taskToken}`;

  const appsScriptSent = await sendViaAppsScript(recipients, subject, htmlBody);
  if (appsScriptSent) {
    console.log(`Request notification sent via Apps Script to: ${recipients.join(', ')}`);
  }
  return appsScriptSent;
}

// ==========================================
// Task Claimed Email
// ==========================================

interface TaskClaimedEmailData {
  taskToken: string;
  title: string;
  requesterName: string;
  claimedByName: string;
  urgency: string;
  requesterEmail?: string;
}

export async function sendTaskClaimedEmail(data: TaskClaimedEmailData) {
  const appUrl = getAppUrl();
  const trackUrl = `${appUrl}/track?token=${data.taskToken}`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #0F0E7F 0%, #4F46E5 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          &#128276; FAST - Your Request Has Been Claimed
        </h1>
      </div>
      <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 16px;">
          Hi <strong>${data.requesterName}</strong>,
        </p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
          Your request has been picked up by a team member and is now <strong>in progress</strong>.
        </p>

        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="color: #16A34A; font-size: 13px; margin: 0 0 4px; font-weight: 600;">Status: In Progress</p>
          <p style="color: #15803D; font-size: 12px; margin: 0;">Assigned to: <strong>${data.claimedByName}</strong></p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px; width: 140px;">Token</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #0F0E7F; font-size: 13px; font-weight: 800; letter-spacing: 1px;">${data.taskToken}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px;">Title</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #1E293B; font-size: 13px; font-weight: 600;">${data.title}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px;">Priority</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #1E293B; font-size: 13px;">${data.urgency}</td>
          </tr>
        </table>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${trackUrl}" style="display: inline-block; background: #0F0E7F; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Track Request Status
          </a>
        </div>

        <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; margin-top: 24px;">
          <p style="color: #94A3B8; font-size: 11px; margin: 0; text-align: center;">
            AHA FAST - FBI Assignment Smart Tracker
          </p>
        </div>
      </div>
    </div>
  `;

  const subject = `[FAST] Request Claimed: ${data.title} - Token: ${data.taskToken}`;
  const recipients = [NOTIFICATION_EMAIL];
  if (data.requesterEmail && data.requesterEmail !== NOTIFICATION_EMAIL) {
    recipients.push(data.requesterEmail);
  }

  return await sendViaAppsScript(recipients, subject, htmlBody);
}

// ==========================================
// Task Completed Email
// ==========================================

interface TaskCompletedEmailData {
  taskToken: string;
  title: string;
  requesterName: string;
  completedByName: string;
  resolutionSummary: string | null;
  requesterEmail?: string;
}

export async function sendTaskCompletedEmail(data: TaskCompletedEmailData) {
  const appUrl = getAppUrl();
  const trackUrl = `${appUrl}/track?token=${data.taskToken}`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #059669 0%, #10B981 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          &#9989; FAST - Your Request Has Been Completed
        </h1>
      </div>
      <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 16px;">
          Hi <strong>${data.requesterName}</strong>,
        </p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
          Great news! Your request has been <strong>completed</strong> by the FBI team.
        </p>

        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="color: #16A34A; font-size: 14px; margin: 0; font-weight: 700;">&#9989; Completed</p>
          <p style="color: #15803D; font-size: 12px; margin: 4px 0 0;">By: <strong>${data.completedByName}</strong></p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px; width: 140px;">Token</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #0F0E7F; font-size: 13px; font-weight: 800; letter-spacing: 1px;">${data.taskToken}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #94A3B8; font-size: 13px;">Title</td>
            <td style="padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #1E293B; font-size: 13px; font-weight: 600;">${data.title}</td>
          </tr>
          ${data.resolutionSummary ? `
          <tr>
            <td style="padding: 10px 12px; color: #94A3B8; font-size: 13px; vertical-align: top;">Resolution</td>
            <td style="padding: 10px 12px; color: #1E293B; font-size: 13px; white-space: pre-wrap;">${data.resolutionSummary}</td>
          </tr>
          ` : ''}
        </table>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${trackUrl}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 14px; font-weight: 600;">
            View Completed Request
          </a>
        </div>

        <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; margin-top: 24px;">
          <p style="color: #94A3B8; font-size: 11px; margin: 0; text-align: center;">
            AHA FAST - FBI Assignment Smart Tracker
          </p>
        </div>
      </div>
    </div>
  `;

  const subject = `[FAST] Request Completed: ${data.title} - Token: ${data.taskToken}`;
  const recipients = [NOTIFICATION_EMAIL];
  if (data.requesterEmail && data.requesterEmail !== NOTIFICATION_EMAIL) {
    recipients.push(data.requesterEmail);
  }

  return await sendViaAppsScript(recipients, subject, htmlBody);
}

// ==========================================
// Account Activation Email
// ==========================================

export async function sendActivationEmail(email: string, name: string, token: string) {
  const appUrl = getAppUrl();
  const activateUrl = `${appUrl}/activate?token=${token}`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #0F0E7F 0%, #4F46E5 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          &#9889; Welcome to AHA FAST
        </h1>
      </div>
      <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 16px;">
          Hi <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
          Your account registration has been received. Please click the button below to activate your account, choose your team, and set your password.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${activateUrl}" style="display: inline-block; background: #0F0E7F; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 700;">
            Activate Your Account
          </a>
        </div>
        <p style="color: #94A3B8; font-size: 12px; margin: 24px 0 0; text-align: center;">
          This link expires in 24 hours. If you didn't request this, please ignore this email.
        </p>
        <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; margin-top: 24px;">
          <p style="color: #94A3B8; font-size: 11px; margin: 0; text-align: center;">
            AHA FAST - FBI Assignment Smart Tracker
          </p>
        </div>
      </div>
    </div>
  `;

  // Try Apps Script first (can send to any email)
  const appsScriptSent = await sendViaAppsScript(
    [email],
    '[AHA FAST] Activate Your Account',
    htmlBody,
    NOTIFICATION_EMAIL,
  );

  if (appsScriptSent) {
    console.log(`Activation email sent via Apps Script to: ${email}`);
    return true;
  }

  // Fallback to Resend (only sends to your own email)
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const result = await getResend().emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: `[AHA FAST] Activate Account for ${name} (${email}) - Please forward to ${email}`,
      html: htmlBody,
    });
    if (result.error) { console.error('Resend fallback error:', result.error); return false; }
    console.log(`Activation email sent via Resend fallback for: ${email}`);
    return true;
  } catch (err) {
    console.error('Failed to send activation email:', err);
    return false;
  }
}

// ==========================================
// Password Reset Email
// ==========================================

export async function sendPasswordResetEmail(email: string, name: string, code: string) {
  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #0F0E7F 0%, #4F46E5 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          &#128274; AHA COMSS - Password Reset Code
        </h1>
      </div>
      <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 16px;">
          Hi <strong>${name}</strong>,
        </p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
          We received a request to reset your password. Use the code below to proceed:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <div style="display: inline-block; background: #F1F5F9; border: 2px dashed #CBD5E1; border-radius: 12px; padding: 20px 48px;">
            <p style="color: #94A3B8; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Your Reset Code</p>
            <p style="color: #0F0E7F; font-size: 36px; font-weight: 800; letter-spacing: 8px; margin: 0; font-family: monospace;">${code}</p>
          </div>
        </div>
        <p style="color: #94A3B8; font-size: 12px; margin: 24px 0 0; text-align: center;">
          This code expires in 15 minutes. If you didn't request this, please ignore this email.
        </p>
        <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; margin-top: 24px;">
          <p style="color: #94A3B8; font-size: 11px; margin: 0; text-align: center;">
            AHA COMSS - Company Support Systems
          </p>
        </div>
      </div>
    </div>
  `;

  const appsScriptSent = await sendViaAppsScript(
    [email],
    '[AHA COMSS] Reset Your Password',
    htmlBody,
    NOTIFICATION_EMAIL,
  );

  if (appsScriptSent) return true;

  if (!process.env.RESEND_API_KEY) return false;
  try {
    const result = await getResend().emails.send({
      from: 'AHA COMSS <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: `[AHA COMSS] Password Reset for ${name} (${email}) - Please forward to ${email}`,
      html: htmlBody,
    });
    if (result.error) return false;
    return true;
  } catch {
    return false;
  }
}

// ==========================================
// Account Approved Email
// ==========================================

export async function sendAccountApprovedEmail(email: string, name: string) {
  const appUrl = getAppUrl();

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #059669 0%, #10B981 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          &#9989; Account Approved!
        </h1>
      </div>
      <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 16px;">Hi <strong>${name}</strong>,</p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
          Your AHA FAST account has been approved by a team leader. You can now log in and start using the platform.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${appUrl}/login" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 700;">
            Log In Now
          </a>
        </div>
        <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; margin-top: 24px;">
          <p style="color: #94A3B8; font-size: 11px; margin: 0; text-align: center;">AHA FAST - FBI Assignment Smart Tracker</p>
        </div>
      </div>
    </div>
  `;

  const appsScriptSent = await sendViaAppsScript(
    [email],
    '[AHA FAST] Your Account Has Been Approved',
    htmlBody,
    NOTIFICATION_EMAIL,
  );
  if (appsScriptSent) return true;

  if (!process.env.RESEND_API_KEY) return false;
  try {
    const result = await getResend().emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: `[AHA FAST] Account Approved for ${name} (${email})`,
      html: htmlBody,
    });
    if (result.error) { console.error('Resend error:', result.error); return false; }
    return true;
  } catch (err) {
    console.error('Failed to send approval email:', err);
    return false;
  }
}

export async function sendAccountRejectedEmail(email: string, name: string) {
  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #DC2626 0%, #EF4444 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">Account Registration Declined</h1>
      </div>
      <div style="padding: 32px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #475569; font-size: 14px; margin: 0 0 16px;">Hi <strong>${name}</strong>,</p>
        <p style="color: #475569; font-size: 14px; margin: 0 0 24px;">
          Unfortunately, your AHA FAST account registration was not approved. If you believe this is an error, please contact your team leader.
        </p>
        <div style="border-top: 1px solid #F1F5F9; padding-top: 16px; margin-top: 24px;">
          <p style="color: #94A3B8; font-size: 11px; margin: 0; text-align: center;">AHA FAST - FBI Assignment Smart Tracker</p>
        </div>
      </div>
    </div>
  `;

  const appsScriptSent = await sendViaAppsScript(
    [email],
    '[AHA FAST] Account Registration Update',
    htmlBody,
    NOTIFICATION_EMAIL,
  );
  if (appsScriptSent) return true;

  if (!process.env.RESEND_API_KEY) return false;
  try {
    const result = await getResend().emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: `[AHA FAST] Account Rejected for ${name} (${email})`,
      html: htmlBody,
    });
    if (result.error) { console.error('Resend error:', result.error); return false; }
    return true;
  } catch (err) {
    console.error('Failed to send rejection email:', err);
    return false;
  }
}

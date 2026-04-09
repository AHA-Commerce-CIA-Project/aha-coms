import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// On Resend free tier, can only send to verified email.
// Once domain is verified in Resend, change this to 'tfbi@ahacommerce.net'
const NOTIFICATION_EMAIL = process.env.RESEND_NOTIFICATION_EMAIL || 'alif.masyhur@ahacommerce.net';

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
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set, skipping email notification');
    return false;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
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
          ⚡ FAST - New Request Submitted
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

  try {
    const result = await resend.emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: recipients,
      subject: `[FAST] New Request: ${data.title} (${data.urgency}) - Token: ${data.taskToken}`,
      html: htmlBody,
    });
    console.log('Resend response:', JSON.stringify(result));
    if (result.error) {
      console.error('Resend error:', result.error);
      return false;
    }
    console.log(`Email notification sent to: ${recipients.join(', ')}`);
    return true;
  } catch (err) {
    console.error('Failed to send email notification:', err);
    return false;
  }
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
}

export async function sendTaskClaimedEmail(data: TaskClaimedEmailData) {
  if (!process.env.RESEND_API_KEY) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const trackUrl = `${appUrl}/track?token=${data.taskToken}`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #0F0E7F 0%, #4F46E5 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          🔔 FAST - Your Request Has Been Claimed
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

  try {
    const result = await resend.emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: `[FAST] Request Claimed: ${data.title} - Token: ${data.taskToken}`,
      html: htmlBody,
    });
    if (result.error) { console.error('Resend error:', result.error); return false; }
    console.log('Task claimed email sent');
    return true;
  } catch (err) {
    console.error('Failed to send task claimed email:', err);
    return false;
  }
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
}

export async function sendTaskCompletedEmail(data: TaskCompletedEmailData) {
  if (!process.env.RESEND_API_KEY) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const trackUrl = `${appUrl}/track?token=${data.taskToken}`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #059669 0%, #10B981 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          ✅ FAST - Your Request Has Been Completed
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
          <p style="color: #16A34A; font-size: 14px; margin: 0; font-weight: 700;">✅ Completed</p>
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

  try {
    const result = await resend.emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: `[FAST] Request Completed: ${data.title} - Token: ${data.taskToken}`,
      html: htmlBody,
    });
    if (result.error) { console.error('Resend error:', result.error); return false; }
    console.log('Task completed email sent');
    return true;
  } catch (err) {
    console.error('Failed to send task completed email:', err);
    return false;
  }
}

// ==========================================
// Account Activation Email
// ==========================================

export async function sendActivationEmail(email: string, name: string, token: string) {
  if (!process.env.RESEND_API_KEY) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001';
  const activateUrl = `${appUrl}/activate?token=${token}`;

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #0F0E7F 0%, #4F46E5 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          ⚡ Welcome to AHA FAST
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

  try {
    const result = await resend.emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL], // On free tier; change to [email] after domain verification
      subject: '[AHA FAST] Activate Your Account',
      html: htmlBody,
    });
    if (result.error) { console.error('Resend error:', result.error); return false; }
    console.log(`Activation email sent for: ${email}`);
    return true;
  } catch (err) {
    console.error('Failed to send activation email:', err);
    return false;
  }
}

// ==========================================
// Account Approved Email
// ==========================================

export async function sendAccountApprovedEmail(email: string, name: string) {
  if (!process.env.RESEND_API_KEY) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3001';

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #059669 0%, #10B981 100%); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700;">
          ✅ Account Approved!
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

  try {
    const result = await resend.emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: '[AHA FAST] Your Account Has Been Approved',
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
  if (!process.env.RESEND_API_KEY) return false;

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

  try {
    const result = await resend.emails.send({
      from: 'AHA FAST <onboarding@resend.dev>',
      to: [NOTIFICATION_EMAIL],
      subject: '[AHA FAST] Account Registration Update',
      html: htmlBody,
    });
    if (result.error) { console.error('Resend error:', result.error); return false; }
    return true;
  } catch (err) {
    console.error('Failed to send rejection email:', err);
    return false;
  }
}

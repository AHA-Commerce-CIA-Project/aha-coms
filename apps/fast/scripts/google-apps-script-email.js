// ============================================
// AHA FAST - Email Sender via Google Apps Script
// ============================================
//
// SETUP INSTRUCTIONS:
// 1. Go to https://script.google.com and open the existing project tied
//    to this gateway (or create a new one if standing up a fresh
//    deployment).
// 2. Paste this entire code into Code.gs and save.
// 3. Set the SHARED_SECRET script property:
//    a. Click the gear icon (Project Settings) in the left sidebar.
//    b. Scroll to "Script Properties".
//    c. Click "Add script property".
//    d. Property name: SHARED_SECRET
//    e. Property value: a cryptographically random string. The SAME value
//       must live in Secret Manager's `aha-fast-apps-script-secret` so
//       fast's Cloud Run revision sends a matching token. Rotate by
//       adding a new version to that secret + redeploying the Cloud Run
//       service alongside this property update.
//    f. Click "Save script properties".
// 4. Click Deploy > Manage deployments (or > New deployment if first
//    deploy).
// 5. Select "Web app" as the type.
// 6. Set "Execute as" to your account (e.g., alif.masyhur@ahacommerce.net).
// 7. Set "Who has access" to "Anyone".
// 8. Click Deploy and copy the Web App URL.
// 9. Set the URL as the APPS_SCRIPT_EMAIL_URL Tofu variable in
//    `infra/fast/variables.tf` (or the running Cloud Run revision's env)
//    and ensure APPS_SCRIPT_SECRET projects from Secret Manager's
//    `aha-fast-apps-script-secret`.
//

function getSharedSecret() {
  return PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var sharedSecret = getSharedSecret();
    if (!sharedSecret) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Server misconfigured: SHARED_SECRET script property not set'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (data.secret !== sharedSecret) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var to = data.to; // array of emails
    var subject = data.subject;
    var htmlBody = data.htmlBody;
    var cc = data.cc || '';

    // Send email using GmailApp (sends from your Google Workspace account)
    GmailApp.sendEmail(
      to.join(','),
      subject,
      '', // plain text fallback
      {
        htmlBody: htmlBody,
        cc: cc,
        name: 'AHA FAST',
        noReply: false
      }
    );

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Email sent to: ' + to.join(', ')
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function — run this in Apps Script after setting SHARED_SECRET to
// verify end-to-end. The function pulls the secret from PropertiesService
// so the test self-bootstraps without embedding the value in source.
function testSend() {
  var result = doPost({
    postData: {
      contents: JSON.stringify({
        secret: getSharedSecret(),
        to: ['alif.masyhur@ahacommerce.net'],
        subject: '[AHA FAST] Test Email',
        htmlBody: '<h1>Test</h1><p>If you see this, Apps Script email is working!</p>'
      })
    }
  });
  Logger.log(result.getContent());
}

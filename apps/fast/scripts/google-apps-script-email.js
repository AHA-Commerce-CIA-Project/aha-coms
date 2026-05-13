// ============================================
// AHA FAST - Email Sender via Google Apps Script
// ============================================
//
// SETUP INSTRUCTIONS:
// 1. Go to https://script.google.com and create a new project
// 2. Paste this entire code into Code.gs
// 3. Click Deploy > New Deployment
// 4. Select "Web app" as the type
// 5. Set "Execute as" to your account (e.g., alif.masyhur@ahacommerce.net)
// 6. Set "Who has access" to "Anyone"
// 7. Click Deploy and copy the Web App URL
// 8. Set the URL as APPS_SCRIPT_EMAIL_URL environment variable in Cloud Run
//

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Verify secret key
    if (data.secret !== 'aha-fast-email-secret-2026') {
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

// Test function - run this in Apps Script to verify it works
function testSend() {
  var result = doPost({
    postData: {
      contents: JSON.stringify({
        secret: 'aha-fast-email-secret-2026',
        to: ['alif.masyhur@ahacommerce.net'],
        subject: '[AHA FAST] Test Email',
        htmlBody: '<h1>Test</h1><p>If you see this, Apps Script email is working!</p>'
      })
    }
  });
  Logger.log(result.getContent());
}

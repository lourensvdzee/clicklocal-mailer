/**
 * Test script to verify SMTP connection and send a single test email
 * Usage: node src/test-send.js [recipient-email]
 */

const { verifyConnection, sendEmail } = require('./mailer');

const TEST_EMAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">ClickLocal Mailer Test</h1>

  <p>This is a test email from the ClickLocal mailer system.</p>

  <p>If you received this email, the SMTP configuration is working correctly!</p>

  <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;">
    Sent from ClickLocal Mailer<br>
    <a href="https://clicklocal.me" style="color: #2563eb;">clicklocal.me</a>
  </p>
</body>
</html>
`;

async function main() {
  const recipient = process.argv[2] || 'lourensvdzee@gmail.com';

  console.log('='.repeat(50));
  console.log('ClickLocal Mailer - Test Send');
  console.log('='.repeat(50));
  console.log(`Recipient: ${recipient}`);
  console.log('');

  // Step 1: Verify SMTP connection
  console.log('Step 1: Verifying SMTP connection...');
  const connected = await verifyConnection();

  if (!connected) {
    console.error('Failed to connect to SMTP server. Check your credentials.');
    process.exit(1);
  }

  // Step 2: Send test email
  console.log('');
  console.log('Step 2: Sending test email...');
  const result = await sendEmail({
    to: recipient,
    subject: 'ClickLocal Mailer Test',
    html: TEST_EMAIL_HTML,
  });

  if (result.success) {
    console.log('');
    console.log('SUCCESS! Test email sent.');
    console.log(`Message ID: ${result.messageId}`);
    console.log(`Check ${recipient} inbox (and spam folder).`);
  } else {
    console.error('');
    console.error('FAILED to send email:', result.error);
    process.exit(1);
  }
}

main().catch(console.error);

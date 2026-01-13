const nodemailer = require('nodemailer');
const config = require('./config');

let transporter = null;

/**
 * Initialize the SMTP transporter
 */
function initTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465, // true for 465, false for 587
    auth: config.smtp.auth,
    tls: {
      rejectUnauthorized: false,
    },
    debug: true,
    logger: true,
  });

  return transporter;
}

/**
 * Verify SMTP connection
 */
async function verifyConnection() {
  const transport = initTransporter();
  try {
    await transport.verify();
    console.log('SMTP connection verified successfully');
    return true;
  } catch (error) {
    console.error('SMTP connection failed:', error.message);
    return false;
  }
}

/**
 * Send a single email
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML content of the email
 * @param {string} [text] - Plain text fallback (optional)
 */
async function sendEmail({ to, subject, html, text }) {
  const transport = initTransporter();

  const mailOptions = {
    from: `"${config.email.fromName}" <${config.email.fromEmail}>`,
    to,
    subject,
    html,
    text: text || stripHtml(html),
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Simple HTML to text converter
 */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

module.exports = {
  initTransporter,
  verifyConnection,
  sendEmail,
};

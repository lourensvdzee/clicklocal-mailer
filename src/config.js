require('dotenv').config();

module.exports = {
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: false, // STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },

  email: {
    fromName: process.env.FROM_NAME || 'ClickLocal',
    fromEmail: process.env.FROM_EMAIL,
  },

  googleSheets: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },

  rateLimitSeconds: parseInt(process.env.RATE_LIMIT_SECONDS, 10) || 120,
};

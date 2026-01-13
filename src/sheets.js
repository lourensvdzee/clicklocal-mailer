const { google } = require('googleapis');
const config = require('./config');

let sheetsClient = null;

/**
 * Initialize Google Sheets client
 */
async function initSheets() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.googleSheets.serviceAccountEmail,
      private_key: config.googleSheets.privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Get all rows from the sheet
 * Expected columns: A=email, B=send_status, C=sent_at
 */
async function getRows() {
  const sheets = await initSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheets.sheetId,
    range: 'email_list_test!A:C', // email, send_status, sent_at
  });

  const rows = response.data.values || [];

  // Skip header row, map to objects
  return rows.slice(1).map((row, index) => ({
    rowIndex: index + 2, // +2 because: 1-indexed + skip header
    email: row[0] || '',
    sendStatus: row[1] || '',
    sentAt: row[2] || '',
  }));
}

/**
 * Find the first row that hasn't been sent yet
 */
async function getNextUnsent() {
  const rows = await getRows();
  return rows.find(row => row.email && !row.sendStatus);
}

/**
 * Get count of sent and pending emails
 */
async function getStats() {
  const rows = await getRows();
  const withEmail = rows.filter(row => row.email);
  const sent = withEmail.filter(row => row.sendStatus === 'SENT');
  const failed = withEmail.filter(row => row.sendStatus === 'FAILED');
  const pending = withEmail.filter(row => !row.sendStatus);

  return {
    total: withEmail.length,
    sent: sent.length,
    failed: failed.length,
    pending: pending.length,
  };
}

/**
 * Update a row with send status and timestamp
 */
async function updateRow(rowIndex, status) {
  const sheets = await initSheets();
  const timestamp = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheets.sheetId,
    range: `email_list_test!B${rowIndex}:C${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[status, timestamp]],
    },
  });

  console.log(`Row ${rowIndex} updated: ${status} at ${timestamp}`);
}

/**
 * Mark a row as sent
 */
async function markSent(rowIndex) {
  await updateRow(rowIndex, 'SENT');
}

/**
 * Mark a row as failed
 */
async function markFailed(rowIndex, error) {
  await updateRow(rowIndex, `FAILED: ${error}`);
}

module.exports = {
  initSheets,
  getRows,
  getNextUnsent,
  getStats,
  markSent,
  markFailed,
};

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
 * Create a new sheet tab with email list
 * @param {string} sheetName - Name for the new tab
 * @param {Array} emails - Array of email objects {email: string}
 * @returns {Promise<string>} - The created sheet name
 */
async function createSheetTab(sheetName, emails) {
  const sheets = await initSheets();

  // First, create the new sheet tab
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.googleSheets.sheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName,
            }
          }
        }]
      }
    });
  } catch (err) {
    // If sheet already exists, append timestamp
    if (err.message.includes('already exists')) {
      const timestamp = Date.now();
      sheetName = `${sheetName}_${timestamp}`;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.googleSheets.sheetId,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName,
              }
            }
          }]
        }
      });
    } else {
      throw err;
    }
  }

  // Add headers and email data
  const headerRow = ['email', 'status', 'sent_at', 'unsubscribed'];
  const dataRows = emails.map(e => [e.email || e, '', '', '']);
  const allRows = [headerRow, ...dataRows];

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheets.sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: allRows,
    },
  });

  console.log(`Created sheet tab "${sheetName}" with ${emails.length} emails`);
  return sheetName;
}

/**
 * Get all rows from a specific sheet tab
 * @param {string} sheetName - Name of the sheet tab
 */
async function getRowsFromSheet(sheetName) {
  const sheets = await initSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheets.sheetId,
    range: `${sheetName}!A:D`,
  });

  const rows = response.data.values || [];

  // Skip header row, map to objects
  return rows.slice(1).map((row, index) => ({
    rowIndex: index + 2,
    email: row[0] || '',
    sendStatus: row[1] || '',
    sentAt: row[2] || '',
    unsubscribed: row[3] || '',
  }));
}

/**
 * Update a row in a specific sheet
 */
async function updateRowInSheet(sheetName, rowIndex, status) {
  const sheets = await initSheets();
  const timestamp = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheets.sheetId,
    range: `${sheetName}!B${rowIndex}:C${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[status, timestamp]],
    },
  });

  console.log(`[${sheetName}] Row ${rowIndex} updated: ${status}`);
}

/**
 * Mark unsubscribed in a specific sheet
 */
async function markUnsubscribedInSheet(sheetName, rowIndex) {
  const sheets = await initSheets();
  const timestamp = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheets.sheetId,
    range: `${sheetName}!D${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[timestamp]],
    },
  });

  console.log(`[${sheetName}] Row ${rowIndex} marked as unsubscribed`);
}

/**
 * Find row by email in a specific sheet
 */
async function findRowByEmailInSheet(sheetName, email) {
  const rows = await getRowsFromSheet(sheetName);
  const row = rows.find(r => r.email.toLowerCase() === email.toLowerCase());
  return row ? row.rowIndex : null;
}

/**
 * Get unsent/unprocessed emails from a sheet (for resume)
 * Skips emails that have status, sent_at, or unsubscribed set
 */
async function getUnsentFromSheet(sheetName) {
  const rows = await getRowsFromSheet(sheetName);
  return rows.filter(r => r.email && !r.sendStatus && !r.sentAt && !r.unsubscribed);
}

/**
 * Get all rows from the sheet
 * Expected columns: A=email, B=send_status, C=sent_at, D=unsubscribed
 */
async function getRows() {
  const sheets = await initSheets();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheets.sheetId,
    range: 'email_list_test!A:D', // email, send_status, sent_at, unsubscribed
  });

  const rows = response.data.values || [];

  // Skip header row, map to objects
  return rows.slice(1).map((row, index) => ({
    rowIndex: index + 2, // +2 because: 1-indexed + skip header
    email: row[0] || '',
    sendStatus: row[1] || '',
    sentAt: row[2] || '',
    unsubscribed: row[3] || '',
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

/**
 * Mark a row as unsubscribed (column D)
 */
async function markUnsubscribed(rowIndex) {
  const sheets = await initSheets();
  const timestamp = new Date().toISOString();

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.googleSheets.sheetId,
    range: `email_list_test!D${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[timestamp]],
    },
  });

  console.log(`Row ${rowIndex} marked as unsubscribed at ${timestamp}`);
}

/**
 * Find row index by email address
 */
async function findRowByEmail(email) {
  const rows = await getRows();
  const row = rows.find(r => r.email.toLowerCase() === email.toLowerCase());
  return row ? row.rowIndex : null;
}

module.exports = {
  initSheets,
  getRows,
  getNextUnsent,
  getStats,
  markSent,
  markFailed,
  markUnsubscribed,
  findRowByEmail,
  // New sheet-specific functions
  createSheetTab,
  getRowsFromSheet,
  updateRowInSheet,
  markUnsubscribedInSheet,
  findRowByEmailInSheet,
  getUnsentFromSheet,
};

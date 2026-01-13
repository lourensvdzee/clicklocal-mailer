/**
 * Debug script to see raw sheet data
 */
const { google } = require('googleapis');
const config = require('./config');

async function main() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.googleSheets.serviceAccountEmail,
      private_key: config.googleSheets.privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.googleSheets.sheetId,
    range: 'A1:E15', // Get first 15 rows, columns A-E
  });

  console.log('Raw sheet data:');
  console.log(JSON.stringify(response.data.values, null, 2));
}

main().catch(console.error);

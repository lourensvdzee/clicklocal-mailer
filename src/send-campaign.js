/**
 * Campaign sender - sends emails from Google Sheet
 *
 * Usage:
 *   npm run send              # Send one email (default)
 *   npm run send -- --all     # Send all pending emails with rate limiting
 *   npm run send -- --count 5 # Send up to 5 emails
 */

const { verifyConnection, sendEmail } = require('./mailer');
const { getNextUnsent, getStats, markSent, markFailed } = require('./sheets');
const config = require('./config');
const fs = require('fs');
const path = require('path');

// Load email template
function loadTemplate() {
  const templatePath = path.join(__dirname, '..', 'templates', 'email.html');

  if (!fs.existsSync(templatePath)) {
    console.error(`Template not found: ${templatePath}`);
    console.error('Please create templates/email.html with your email content.');
    process.exit(1);
  }

  return fs.readFileSync(templatePath, 'utf-8');
}

// Load subject from file or use default
function loadSubject() {
  const subjectPath = path.join(__dirname, '..', 'templates', 'subject.txt');

  if (fs.existsSync(subjectPath)) {
    return fs.readFileSync(subjectPath, 'utf-8').trim();
  }

  return 'A message from ClickLocal';
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Parse command line args
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes('--all')) {
    return { mode: 'all' };
  }

  const countIndex = args.indexOf('--count');
  if (countIndex !== -1 && args[countIndex + 1]) {
    return { mode: 'count', count: parseInt(args[countIndex + 1], 10) };
  }

  return { mode: 'single' };
}

async function main() {
  const args = parseArgs();

  console.log('='.repeat(50));
  console.log('ClickLocal Campaign Sender');
  console.log('='.repeat(50));

  // Show current stats
  console.log('\nChecking sheet status...');
  const stats = await getStats();
  console.log(`Total: ${stats.total} | Sent: ${stats.sent} | Failed: ${stats.failed} | Pending: ${stats.pending}`);

  if (stats.pending === 0) {
    console.log('\nNo pending emails to send. All done!');
    return;
  }

  // Verify SMTP
  console.log('\nVerifying SMTP connection...');
  const connected = await verifyConnection();
  if (!connected) {
    console.error('SMTP connection failed. Aborting.');
    process.exit(1);
  }

  // Load template
  const template = loadTemplate();
  const subject = loadSubject();
  console.log(`\nSubject: "${subject}"`);

  // Determine how many to send
  let maxToSend = 1;
  if (args.mode === 'all') {
    maxToSend = stats.pending;
  } else if (args.mode === 'count') {
    maxToSend = Math.min(args.count, stats.pending);
  }

  console.log(`\nWill send up to ${maxToSend} email(s)`);
  console.log(`Rate limit: ${config.rateLimitSeconds} seconds between emails`);
  console.log('');

  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < maxToSend; i++) {
    const row = await getNextUnsent();

    if (!row) {
      console.log('No more pending emails.');
      break;
    }

    console.log(`[${i + 1}/${maxToSend}] Sending to: ${row.email}`);

    const result = await sendEmail({
      to: row.email,
      subject,
      html: template,
    });

    if (result.success) {
      await markSent(row.rowIndex);
      sentCount++;
      console.log(`  ✓ Sent successfully`);
    } else {
      await markFailed(row.rowIndex, result.error);
      failedCount++;
      console.log(`  ✗ Failed: ${result.error}`);
    }

    // Rate limiting (skip for last email)
    if (i < maxToSend - 1) {
      console.log(`  Waiting ${config.rateLimitSeconds}s before next email...`);
      await sleep(config.rateLimitSeconds * 1000);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Campaign Summary');
  console.log('='.repeat(50));
  console.log(`Sent: ${sentCount}`);
  console.log(`Failed: ${failedCount}`);

  // Final stats
  const finalStats = await getStats();
  console.log(`\nRemaining pending: ${finalStats.pending}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

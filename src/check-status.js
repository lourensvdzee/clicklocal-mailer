/**
 * Check campaign status - shows stats from Google Sheet
 */

const { getStats, getRows } = require('./sheets');

async function main() {
  console.log('='.repeat(50));
  console.log('ClickLocal Campaign Status');
  console.log('='.repeat(50));

  console.log('\nFetching data from Google Sheet...\n');

  const stats = await getStats();

  console.log('Summary:');
  console.log(`  Total emails:    ${stats.total}`);
  console.log(`  Sent:            ${stats.sent}`);
  console.log(`  Failed:          ${stats.failed}`);
  console.log(`  Pending:         ${stats.pending}`);

  const progress = stats.total > 0
    ? Math.round((stats.sent / stats.total) * 100)
    : 0;

  console.log(`\nProgress: ${progress}%`);
  console.log(`[${'█'.repeat(Math.floor(progress / 5))}${'░'.repeat(20 - Math.floor(progress / 5))}]`);

  // Show recent activity
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    console.log('\n\nRecent Activity (last 10):');
    console.log('-'.repeat(50));

    const rows = await getRows();
    const sentRows = rows
      .filter(r => r.sendStatus)
      .sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))
      .slice(0, 10);

    for (const row of sentRows) {
      const status = row.sendStatus.startsWith('FAILED') ? '✗' : '✓';
      console.log(`${status} ${row.email} - ${row.sentAt}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

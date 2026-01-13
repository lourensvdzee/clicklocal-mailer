/**
 * ClickLocal Mailer - Web Interface
 * Local-only web server for email campaign management
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { verifyConnection, sendEmail } = require('./mailer');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const CLICKLOCAL_PUBLIC = path.join(__dirname, '..', '..', 'clicklocal', 'public'); // For serving on clicklocal.me
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const LISTS_FILE = path.join(DATA_DIR, 'email-lists.json');
const LOGS_FILE = path.join(DATA_DIR, 'send-logs.json');

// Ensure directories exist
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize data files if they don't exist
function initDataFile(filePath, defaultData = []) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
}
initDataFile(TEMPLATES_FILE, []);
initDataFile(LISTS_FILE, []);
initDataFile(LOGS_FILE, []);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer for image uploads - saves to clicklocal/public for serving on clicklocal.me
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Save to clicklocal/public so images are served on clicklocal.me
    if (fs.existsSync(CLICKLOCAL_PUBLIC)) {
      cb(null, CLICKLOCAL_PUBLIC);
    } else {
      cb(null, UPLOADS_DIR); // Fallback
    }
  },
  filename: (req, file, cb) => {
    // Use descriptive name: email-{timestamp}.ext
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    cb(null, 'email-' + timestamp + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    cb(null, ext && mime);
  }
});

// Helper functions
function loadData(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// SSE clients for real-time updates
let sseClients = [];

function sendSSE(event, data) {
  sseClients.forEach(client => {
    client.res.write('event: ' + event + '\n');
    client.res.write('data: ' + JSON.stringify(data) + '\n\n');
  });
}

// ============== API ROUTES ==============

// --- Templates ---
app.get('/api/templates', (req, res) => {
  res.json(loadData(TEMPLATES_FILE));
});

app.post('/api/templates', (req, res) => {
  const templates = loadData(TEMPLATES_FILE);
  const template = {
    id: uuidv4(),
    name: req.body.name,
    subject: req.body.subject,
    contentType: req.body.contentType, // 'html' or 'text'
    content: req.body.content,
    optOutLang: req.body.optOutLang || '', // 'de', 'en', or '' for none
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  templates.push(template);
  saveData(TEMPLATES_FILE, templates);
  res.json(template);
});

app.put('/api/templates/:id', (req, res) => {
  const templates = loadData(TEMPLATES_FILE);
  const index = templates.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Template not found' });

  templates[index] = {
    ...templates[index],
    name: req.body.name,
    subject: req.body.subject,
    contentType: req.body.contentType,
    content: req.body.content,
    optOutLang: req.body.optOutLang || '',
    updatedAt: new Date().toISOString()
  };
  saveData(TEMPLATES_FILE, templates);
  res.json(templates[index]);
});

app.delete('/api/templates/:id', (req, res) => {
  let templates = loadData(TEMPLATES_FILE);
  templates = templates.filter(t => t.id !== req.params.id);
  saveData(TEMPLATES_FILE, templates);
  res.json({ success: true });
});

// --- Email Lists ---
app.get('/api/lists', (req, res) => {
  res.json(loadData(LISTS_FILE));
});

app.post('/api/lists', (req, res) => {
  const lists = loadData(LISTS_FILE);
  const list = {
    id: uuidv4(),
    name: req.body.name,
    emails: req.body.emails || [], // Array of { email, name? }
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  lists.push(list);
  saveData(LISTS_FILE, lists);
  res.json(list);
});

app.put('/api/lists/:id', (req, res) => {
  const lists = loadData(LISTS_FILE);
  const index = lists.findIndex(l => l.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'List not found' });

  lists[index] = {
    ...lists[index],
    name: req.body.name,
    emails: req.body.emails,
    updatedAt: new Date().toISOString()
  };
  saveData(LISTS_FILE, lists);
  res.json(lists[index]);
});

app.delete('/api/lists/:id', (req, res) => {
  let lists = loadData(LISTS_FILE);
  lists = lists.filter(l => l.id !== req.params.id);
  saveData(LISTS_FILE, lists);
  res.json({ success: true });
});

// --- Image Upload (saves to clicklocal/public, served on clicklocal.me) ---
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or invalid file type' });
  }
  // Return the public clicklocal.me URL
  const publicUrl = 'https://www.clicklocal.me/' + req.file.filename;
  res.json({
    success: true,
    filename: req.file.filename,
    url: publicUrl,
    htmlTag: '<img src="' + publicUrl + '" alt="Email image" style="max-width:100%">'
  });
});

// List images from clicklocal/public that start with "email-"
app.get('/api/uploads', (req, res) => {
  const targetDir = fs.existsSync(CLICKLOCAL_PUBLIC) ? CLICKLOCAL_PUBLIC : UPLOADS_DIR;
  const files = fs.readdirSync(targetDir)
    .filter(f => /^email-.*\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .map(f => ({
      filename: f,
      url: 'https://www.clicklocal.me/' + f
    }));
  res.json(files);
});

app.delete('/api/uploads/:filename', (req, res) => {
  // Only allow deleting email- prefixed files for safety
  if (!req.params.filename.startsWith('email-')) {
    return res.status(400).json({ error: 'Can only delete email images' });
  }
  const targetDir = fs.existsSync(CLICKLOCAL_PUBLIC) ? CLICKLOCAL_PUBLIC : UPLOADS_DIR;
  const filePath = path.join(targetDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// --- Unsubscribe ---
app.get('/api/unsubscribe/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase();
  const lists = loadData(LISTS_FILE);
  let found = false;

  // Mark email as unsubscribed in all lists
  lists.forEach(list => {
    list.emails.forEach(e => {
      if (e.email.toLowerCase() === email) {
        e.unsubscribed = true;
        e.unsubscribedAt = new Date().toISOString();
        found = true;
      }
    });
  });

  if (found) {
    saveData(LISTS_FILE, lists);
    // Log the unsubscribe
    const logs = loadData(LOGS_FILE);
    logs.push({
      id: uuidv4(),
      type: 'unsubscribe',
      email: email,
      timestamp: new Date().toISOString(),
      status: 'unsubscribed'
    });
    saveData(LOGS_FILE, logs);
  }

  // Return a simple confirmation page (DE/EN)
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed / Abgemeldet</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    h1 { color: #059669; }
    p { color: #4b5563; line-height: 1.6; }
    .divider { border-top: 1px solid #e5e7eb; margin: 30px 0; }
  </style>
</head>
<body>
  <h1>✓ Erfolgreich abgemeldet</h1>
  <p>Sie erhalten keine weiteren E-Mails von uns.<br>Vielen Dank für Ihr Feedback.</p>
  <div class="divider"></div>
  <h1>✓ Successfully unsubscribed</h1>
  <p>You will no longer receive emails from us.<br>Thank you for your feedback.</p>
</body>
</html>`);
});

// --- Send Logs ---
app.get('/api/logs', (req, res) => {
  const logs = loadData(LOGS_FILE);
  // Return most recent first
  res.json(logs.reverse().slice(0, 500));
});

app.delete('/api/logs', (req, res) => {
  saveData(LOGS_FILE, []);
  res.json({ success: true });
});

// --- SSE for real-time updates ---
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = uuidv4();
  const client = { id: clientId, res };
  sseClients.push(client);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// --- Preview Email ---
app.post('/api/preview', (req, res) => {
  const { content, contentType, subject, fromName, fromEmail, optOutLang } = req.body;

  // Opt-out footers for preview (uses example email)
  const optOutFooters = {
    de: `
<div style="margin-top:40px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
  <p style="margin:0;">
    Falls Sie diese E-Mails nicht mehr erhalten möchten, <a href="https://www.clicklocal.me/email?e=example%40email.com" style="color:#9ca3af;">klicken Sie hier</a>.
  </p>
</div>`,
    en: `
<div style="margin-top:40px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
  <p style="margin:0;">
    If you no longer wish to receive these emails, <a href="https://www.clicklocal.me/email?e=example%40email.com" style="color:#9ca3af;">click here</a>.
  </p>
</div>`
  };

  let bodyHtml;
  if (contentType === 'text') {
    // Convert plain text to HTML, but preserve <img>, <a>, <b>, <i> tags
    const preservedTags = [];
    let processed = content.replace(/<(img[^>]*|a[^>]*>.*?<\/a|b>.*?<\/b|i>.*?<\/i)>/gi, (match) => {
      preservedTags.push(match);
      return '{{TAG_' + (preservedTags.length - 1) + '}}';
    });
    // Escape the rest
    processed = processed.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Convert newlines to <br>
    processed = processed.replace(/\n/g, '<br>');
    // Restore preserved tags
    preservedTags.forEach((tag, i) => {
      processed = processed.replace('{{TAG_' + i + '}}', tag);
    });
    bodyHtml = '<div style="font-family: sans-serif;">' + processed + '</div>';
  } else {
    bodyHtml = content;
  }

  // Add opt-out footer if language selected
  if (optOutLang && optOutFooters[optOutLang]) {
    bodyHtml += optOutFooters[optOutLang];
  }

  // Build Gmail-like preview wrapper
  const senderName = fromName || config.email.fromName || 'Sender';
  const senderEmail = fromEmail || config.email.fromEmail || 'sender@example.com';
  const subjectLine = subject || 'No subject';

  const previewHtml = '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; max-width: 100%;">' +
    '<!-- Email Header -->' +
    '<div style="background: #f6f8fc; border-bottom: 1px solid #e0e0e0; padding: 16px; margin: -20px -20px 0 -20px;">' +
      '<div style="font-size: 18px; font-weight: 500; color: #202124; margin-bottom: 12px;">' + subjectLine.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
      '<div style="display: flex; align-items: center; gap: 12px;">' +
        '<div style="width: 40px; height: 40px; border-radius: 50%; background: #1a73e8; color: white; display: flex; align-items: center; justify-content: center; font-weight: 500; font-size: 16px;">' + senderName.charAt(0).toUpperCase() + '</div>' +
        '<div>' +
          '<div style="font-size: 14px; color: #202124;"><strong>' + senderName.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</strong> <span style="color: #5f6368;">&lt;' + senderEmail.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '&gt;</span></div>' +
          '<div style="font-size: 12px; color: #5f6368;">to me</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<!-- Email Body -->' +
    '<div style="padding: 20px 0; margin-top: 16px;">' + bodyHtml + '</div>' +
  '</div>';

  res.json({ html: previewHtml });
});

// --- Send Campaign ---
app.post('/api/send', async (req, res) => {
  const { templateId, listId, testEmail } = req.body;

  const templates = loadData(TEMPLATES_FILE);
  const template = templates.find(t => t.id === templateId);
  if (!template) {
    return res.status(400).json({ error: 'Template not found' });
  }

  // Use opt-out language from template
  const optOutLang = template.optOutLang || '';

  let recipients = [];
  let skippedCount = 0;

  if (testEmail) {
    // Send to test email only
    recipients = [{ email: testEmail }];
  } else if (listId) {
    const lists = loadData(LISTS_FILE);
    const list = lists.find(l => l.id === listId);
    if (!list) {
      return res.status(400).json({ error: 'Email list not found' });
    }
    // Filter out unsubscribed recipients
    const allRecipients = list.emails;
    recipients = allRecipients.filter(e => !e.unsubscribed);
    skippedCount = allRecipients.length - recipients.length;
  } else {
    return res.status(400).json({ error: 'No recipients specified' });
  }

  // Verify SMTP connection first
  const connected = await verifyConnection();
  if (!connected) {
    return res.status(500).json({ error: 'SMTP connection failed' });
  }

  // Start campaign ID
  const campaignId = uuidv4();
  const logs = loadData(LOGS_FILE);

  res.json({
    success: true,
    campaignId,
    totalRecipients: recipients.length,
    skippedUnsubscribed: skippedCount,
    message: 'Campaign started. Check logs for progress.'
  });

  // Opt-out footers by language (subtle text, links to clicklocal.me/email)
  const optOutFooters = {
    de: `
<div style="margin-top:40px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
  <p style="margin:0;">
    Falls Sie diese E-Mails nicht mehr erhalten möchten, <a href="https://www.clicklocal.me/email?e={{EMAIL}}" style="color:#9ca3af;">klicken Sie hier</a>.
  </p>
</div>`,
    en: `
<div style="margin-top:40px;padding-top:15px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
  <p style="margin:0;">
    If you no longer wish to receive these emails, <a href="https://www.clicklocal.me/email?e={{EMAIL}}" style="color:#9ca3af;">click here</a>.
  </p>
</div>`
  };

  // Send emails asynchronously
  (async () => {
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      sendSSE('sending', {
        campaignId,
        index: i + 1,
        total: recipients.length,
        email: recipient.email,
        status: 'sending'
      });

      const logEntry = {
        id: uuidv4(),
        campaignId,
        templateName: template.name,
        email: recipient.email,
        subject: template.subject,
        timestamp: new Date().toISOString(),
        status: 'pending'
      };

      try {
        let html;
        if (template.contentType === 'text') {
          // Convert plain text to HTML, but preserve <img>, <a>, <b>, <i> tags
          const preservedTags = [];
          let processed = template.content.replace(/<(img[^>]*|a[^>]*>.*?<\/a|b>.*?<\/b|i>.*?<\/i)>/gi, (match) => {
            preservedTags.push(match);
            return '{{TAG_' + (preservedTags.length - 1) + '}}';
          });
          // Convert newlines to <br>
          processed = processed.replace(/\n/g, '<br>');
          // Restore preserved tags
          preservedTags.forEach((tag, i) => {
            processed = processed.replace('{{TAG_' + i + '}}', tag);
          });
          html = '<div style="font-family: sans-serif;">' + processed + '</div>';
        } else {
          html = template.content;
        }

        // Add opt-out footer if language selected in template
        if (optOutLang && optOutFooters[optOutLang]) {
          const footer = optOutFooters[optOutLang].replace('{{EMAIL}}', encodeURIComponent(recipient.email));
          html += footer;
        }

        const result = await sendEmail({
          to: recipient.email,
          subject: template.subject,
          html
        });

        if (result.success) {
          logEntry.status = 'sent';
          logEntry.messageId = result.messageId;
          sendSSE('sent', { ...logEntry, index: i + 1, total: recipients.length });
        } else {
          logEntry.status = 'failed';
          logEntry.error = result.error;
          sendSSE('failed', { ...logEntry, index: i + 1, total: recipients.length });
        }
      } catch (err) {
        logEntry.status = 'failed';
        logEntry.error = err.message;
        sendSSE('failed', { ...logEntry, index: i + 1, total: recipients.length });
      }

      logs.push(logEntry);
      saveData(LOGS_FILE, logs);

      // Rate limit (skip for last email)
      if (i < recipients.length - 1) {
        sendSSE('waiting', {
          campaignId,
          seconds: config.rateLimitSeconds,
          nextEmail: recipients[i + 1]?.email
        });
        await new Promise(r => setTimeout(r, config.rateLimitSeconds * 1000));
      }
    }

    sendSSE('complete', {
      campaignId,
      total: recipients.length,
      sent: logs.filter(l => l.campaignId === campaignId && l.status === 'sent').length,
      failed: logs.filter(l => l.campaignId === campaignId && l.status === 'failed').length
    });
  })();
});

// --- SMTP Test ---
app.get('/api/smtp-status', async (req, res) => {
  try {
    const connected = await verifyConnection();
    res.json({
      connected,
      host: config.smtp.host,
      fromEmail: config.email.fromEmail,
      fromName: config.email.fromName
    });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// ============== HTML UI ==============
app.get('/', (req, res) => {
  res.send(getHTML());
});

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClickLocal Mailer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }

    header {
      background: #2563eb;
      color: white;
      padding: 15px 20px;
      margin-bottom: 20px;
    }
    header h1 { font-size: 1.5rem; }
    header .status { font-size: 0.85rem; opacity: 0.9; margin-top: 5px; }

    .tabs {
      display: flex;
      gap: 5px;
      margin-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 10px;
    }
    .tab {
      padding: 10px 20px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 6px 6px 0 0;
      cursor: pointer;
      font-weight: 500;
    }
    .tab.active { background: #2563eb; color: white; border-color: #2563eb; }

    .panel { display: none; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .panel.active { display: block; }

    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; margin-bottom: 5px; font-weight: 500; }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    .form-group textarea { min-height: 200px; font-family: monospace; }

    .btn {
      padding: 10px 20px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    .btn:hover { background: #1d4ed8; }
    .btn.secondary { background: #6b7280; }
    .btn.secondary:hover { background: #4b5563; }
    .btn.danger { background: #dc2626; }
    .btn.danger:hover { background: #b91c1c; }
    .btn.success { background: #059669; }
    .btn.success:hover { background: #047857; }

    .btn-group { display: flex; gap: 10px; margin-top: 15px; }

    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

    .card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 10px;
    }
    .card h3 { font-size: 1rem; margin-bottom: 10px; }
    .card .meta { font-size: 0.85rem; color: #6b7280; }

    .list-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .list-item .info { flex: 1; }
    .list-item .actions { display: flex; gap: 5px; }
    .list-item .actions button { padding: 5px 10px; font-size: 12px; }

    .preview-frame {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      background: white;
      min-height: 400px;
      padding: 20px;
    }

    .log-container {
      max-height: 500px;
      overflow-y: auto;
      background: #1f2937;
      color: #f9fafb;
      padding: 15px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 13px;
    }
    .log-entry { padding: 5px 0; border-bottom: 1px solid #374151; }
    .log-entry.sent { color: #34d399; }
    .log-entry.failed { color: #f87171; }
    .log-entry.waiting { color: #fbbf24; }
    .log-entry .time { color: #9ca3af; margin-right: 10px; }

    .upload-zone {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 30px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .upload-zone:hover { border-color: #2563eb; background: #f0f9ff; }
    .upload-zone.dragover { border-color: #2563eb; background: #dbeafe; }

    .image-gallery {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
      margin-top: 15px;
    }
    .image-item {
      position: relative;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
    }
    .image-item img { width: 100%; height: 100px; object-fit: cover; }
    .image-item .actions {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0,0,0,0.7);
      padding: 5px;
      display: flex;
      justify-content: center;
      gap: 5px;
    }
    .image-item button { padding: 3px 8px; font-size: 11px; }

    .content-type-toggle {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
    }
    .content-type-toggle label {
      display: flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
    }

    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .status-badge.connected { background: #d1fae5; color: #065f46; }
    .status-badge.disconnected { background: #fee2e2; color: #991b1b; }

    .progress-bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin: 10px 0;
    }
    .progress-bar .fill {
      height: 100%;
      background: #2563eb;
      transition: width 0.3s;
    }
  </style>
</head>
<body>
  <header>
    <h1>ClickLocal Mailer</h1>
    <div class="status">
      SMTP: <span id="smtp-status" class="status-badge disconnected">Checking...</span>
      <span id="smtp-info"></span>
    </div>
  </header>

  <div class="container">
    <div class="tabs">
      <div class="tab active" data-tab="templates">Templates</div>
      <div class="tab" data-tab="lists">Email Lists</div>
      <div class="tab" data-tab="send">Send Campaign</div>
      <div class="tab" data-tab="logs">Logs</div>
    </div>

    <!-- Templates Panel -->
    <div id="templates" class="panel active">
      <div class="grid">
        <div>
          <h2 style="margin-bottom:15px">Create/Edit Template</h2>
          <input type="hidden" id="template-id">
          <div class="form-group">
            <label>Template Name</label>
            <input type="text" id="template-name" placeholder="e.g. Retailer Outreach v1">
          </div>
          <div class="form-group">
            <label>Subject Line</label>
            <input type="text" id="template-subject" placeholder="e.g. Quick question about your store">
          </div>
          <div class="form-group">
            <label>Content Type</label>
            <div class="content-type-toggle">
              <label><input type="radio" name="content-type" value="html" checked> HTML</label>
              <label><input type="radio" name="content-type" value="text"> Plain Text</label>
            </div>
          </div>
          <div class="form-group">
            <label>Email Content</label>
            <textarea id="template-content" placeholder="Enter your email content here..."></textarea>
            <!-- Formatting toolbar -->
            <div style="margin-top:8px;padding:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <span style="font-size:12px;color:#6b7280">Format:</span>
              <button type="button" class="btn secondary" style="padding:5px 10px;font-size:12px" onclick="insertLink()">Insert Link</button>
              <button type="button" class="btn secondary" style="padding:5px 10px;font-size:12px" onclick="wrapSelection('&lt;b&gt;', '&lt;/b&gt;')">Bold</button>
              <button type="button" class="btn secondary" style="padding:5px 10px;font-size:12px" onclick="wrapSelection('&lt;i&gt;', '&lt;/i&gt;')">Italic</button>
            </div>
          </div>

          <!-- Image Insert Section -->
          <div class="form-group" id="image-insert-section">
            <label>Insert Image</label>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
              <select id="existing-images" style="flex:1;min-width:200px">
                <option value="">-- Select existing image --</option>
                <option value="https://www.clicklocal.me/founders.jpg">founders.jpg</option>
              </select>
              <select id="image-width" style="width:120px">
                <option value="100%">Full width</option>
                <option value="400" selected>400px</option>
                <option value="300">300px</option>
                <option value="200">200px</option>
                <option value="150">150px</option>
              </select>
              <button class="btn secondary" type="button" onclick="insertSelectedImage()">Insert</button>
              <span style="color:#6b7280">or</span>
              <label class="btn secondary" style="cursor:pointer;margin:0">
                Upload New
                <input type="file" id="image-upload" accept="image/*" style="display:none" onchange="uploadAndInsertImage(this)">
              </label>
            </div>
            <!-- Image Preview -->
            <div id="image-preview-box" style="display:none;padding:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin-bottom:10px">
              <p style="font-size:12px;color:#6b7280;margin-bottom:8px">Preview (select image to see):</p>
              <img id="image-preview" src="" style="max-width:100%;height:auto;border-radius:4px">
            </div>
            <p style="font-size:12px;color:#6b7280">Images are uploaded to clicklocal.me and can be used in emails</p>
          </div>

          <div class="form-group">
            <label>Opt-out Footer</label>
            <select id="template-optout" style="width:100%">
              <option value="">None</option>
              <option value="de">German (Deutsch)</option>
              <option value="en">English</option>
            </select>
            <p style="font-size:12px;color:#6b7280;margin-top:5px">Adds a subtle link at the bottom for recipients to stop receiving emails.</p>
          </div>

          <div class="btn-group">
            <button class="btn" onclick="saveTemplate()">Save Template</button>
            <button class="btn secondary" onclick="previewTemplate()">Preview</button>
            <button class="btn secondary" onclick="clearTemplateForm()">Clear</button>
          </div>
        </div>
        <div>
          <h2 style="margin-bottom:15px">Saved Templates</h2>
          <div id="templates-list"></div>
        </div>
      </div>
    </div>

    <!-- Email Lists Panel -->
    <div id="lists" class="panel">
      <div class="grid">
        <div>
          <h2 style="margin-bottom:15px">Create/Edit List</h2>
          <input type="hidden" id="list-id">
          <div class="form-group">
            <label>List Name</label>
            <input type="text" id="list-name" placeholder="e.g. Berlin Retailers">
          </div>
          <div class="form-group">
            <label>Email Addresses (one per line or comma-separated)</label>
            <textarea id="list-emails" placeholder="email1@example.com&#10;email2@example.com&#10;..."></textarea>
          </div>
          <div class="btn-group">
            <button class="btn" onclick="saveList()">Save List</button>
            <button class="btn secondary" onclick="clearListForm()">Clear</button>
          </div>
        </div>
        <div>
          <h2 style="margin-bottom:15px">Saved Lists</h2>
          <div id="lists-list"></div>
        </div>
      </div>
    </div>

    <!-- Send Campaign Panel -->
    <div id="send" class="panel">
      <div class="grid">
        <div>
          <h2 style="margin-bottom:15px">Send Campaign</h2>

          <div class="form-group">
            <label>Select Template</label>
            <select id="send-template">
              <option value="">-- Select a template --</option>
            </select>
          </div>

          <div class="form-group">
            <label>Select Email List</label>
            <select id="send-list">
              <option value="">-- Select a list --</option>
            </select>
          </div>

          <div class="form-group">
            <label>Or Send Test Email To</label>
            <input type="email" id="test-email" placeholder="your@email.com">
          </div>

          <div style="margin-top:15px">
            <button class="btn secondary" onclick="previewCampaign()" style="width:100%;margin-bottom:20px">Preview Email</button>
            <button class="btn success" onclick="sendCampaign()" style="width:100%">Send Campaign</button>
          </div>

          <div id="send-progress" style="display:none;margin-top:20px;">
            <h3>Sending Progress</h3>
            <div class="progress-bar"><div class="fill" id="progress-fill" style="width:0%"></div></div>
            <p id="progress-text">Preparing...</p>
          </div>
        </div>
        <div>
          <h2 style="margin-bottom:15px">Preview</h2>
          <div class="preview-frame" id="campaign-preview">
            <p style="color:#6b7280;text-align:center;padding-top:50px">Select a template to preview</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Logs Panel -->
    <div id="logs" class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
        <h2>Send Logs</h2>
        <div>
          <button class="btn secondary" onclick="loadLogs()">Refresh</button>
          <button class="btn danger" onclick="clearLogs()">Clear Logs</button>
        </div>
      </div>
      <div class="log-container" id="log-container">
        <p style="color:#9ca3af">No logs yet</p>
      </div>
    </div>
  </div>

  <!-- Preview Modal -->
  <div id="preview-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;">
    <div style="background:white;max-width:700px;margin:50px auto;border-radius:8px;max-height:90vh;overflow:hidden;">
      <div style="padding:15px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
        <h3>Email Preview</h3>
        <button class="btn secondary" onclick="closePreview()">Close</button>
      </div>
      <div id="preview-content" style="padding:20px;max-height:70vh;overflow-y:auto;"></div>
    </div>
  </div>

  <script>
    // Tab navigation
    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
        document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
      });
    });

    // Check SMTP status
    async function checkSMTP() {
      try {
        const res = await fetch('/api/smtp-status');
        const data = await res.json();
        const el = document.getElementById('smtp-status');
        const info = document.getElementById('smtp-info');
        if (data.connected) {
          el.className = 'status-badge connected';
          el.textContent = 'Connected';
          info.textContent = ' | ' + data.fromName + ' <' + data.fromEmail + '>';
        } else {
          el.className = 'status-badge disconnected';
          el.textContent = 'Disconnected';
          info.textContent = data.error ? ' | ' + data.error : '';
        }
      } catch (err) {
        document.getElementById('smtp-status').className = 'status-badge disconnected';
        document.getElementById('smtp-status').textContent = 'Error';
      }
    }

    // ========== Templates ==========
    async function loadTemplates() {
      const res = await fetch('/api/templates');
      const templates = await res.json();

      const list = document.getElementById('templates-list');
      const select = document.getElementById('send-template');

      if (templates.length === 0) {
        list.innerHTML = '<p style="color:#6b7280">No templates yet. Create one!</p>';
      } else {
        list.innerHTML = templates.map(function(t) {
          return '<div class="list-item">' +
            '<div class="info">' +
              '<strong>' + escapeHtml(t.name) + '</strong>' +
              '<div class="meta">Subject: ' + escapeHtml(t.subject) + ' | Type: ' + t.contentType + '</div>' +
            '</div>' +
            '<div class="actions">' +
              '<button class="btn secondary" onclick="editTemplate(\\''+t.id+'\\')">Edit</button>' +
              '<button class="btn danger" onclick="deleteTemplate(\\''+t.id+'\\')">Delete</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      select.innerHTML = '<option value="">-- Select a template --</option>' +
        templates.map(function(t) {
          return '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>';
        }).join('');
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function saveTemplate() {
      var id = document.getElementById('template-id').value;
      var data = {
        name: document.getElementById('template-name').value,
        subject: document.getElementById('template-subject').value,
        contentType: document.querySelector('input[name="content-type"]:checked').value,
        content: document.getElementById('template-content').value,
        optOutLang: document.getElementById('template-optout').value
      };

      if (!data.name || !data.subject || !data.content) {
        alert('Please fill in all fields');
        return;
      }

      var url = id ? '/api/templates/' + id : '/api/templates';
      var method = id ? 'PUT' : 'POST';

      await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      clearTemplateForm();
      loadTemplates();
    }

    async function editTemplate(id) {
      const res = await fetch('/api/templates');
      const templates = await res.json();
      const t = templates.find(function(t) { return t.id === id; });
      if (!t) return;

      document.getElementById('template-id').value = t.id;
      document.getElementById('template-name').value = t.name;
      document.getElementById('template-subject').value = t.subject;
      document.getElementById('template-content').value = t.content;
      document.querySelector('input[name="content-type"][value="' + t.contentType + '"]').checked = true;
      document.getElementById('template-optout').value = t.optOutLang || '';

      document.querySelector('[data-tab="templates"]').click();
    }

    async function deleteTemplate(id) {
      if (!confirm('Delete this template?')) return;
      await fetch('/api/templates/' + id, { method: 'DELETE' });
      loadTemplates();
    }

    function clearTemplateForm() {
      document.getElementById('template-id').value = '';
      document.getElementById('template-name').value = '';
      document.getElementById('template-subject').value = '';
      document.getElementById('template-content').value = '';
      document.querySelector('input[name="content-type"][value="html"]').checked = true;
      document.getElementById('template-optout').value = '';
    }

    async function previewTemplate() {
      var content = document.getElementById('template-content').value;
      var subject = document.getElementById('template-subject').value;
      var contentType = document.querySelector('input[name="content-type"]:checked').value;
      var optOutLang = document.getElementById('template-optout').value;

      if (!content) {
        alert('Enter some content first');
        return;
      }

      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content, contentType: contentType, subject: subject, optOutLang: optOutLang })
      });
      const data = await res.json();

      document.getElementById('preview-content').innerHTML = data.html;
      document.getElementById('preview-modal').style.display = 'block';
    }

    function closePreview() {
      document.getElementById('preview-modal').style.display = 'none';
    }

    // ========== Text Formatting Functions ==========
    function insertLink() {
      var textarea = document.getElementById('template-content');
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var selectedText = textarea.value.substring(start, end);

      var linkText = selectedText || prompt('Enter link text:', 'Click here');
      if (!linkText) return;

      var url = prompt('Enter URL:', 'https://');
      if (!url) return;

      var linkHtml = '<a href="' + url + '" style="color:#2563eb">' + linkText + '</a>';

      var text = textarea.value;
      textarea.value = text.substring(0, start) + linkHtml + text.substring(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + linkHtml.length;
    }

    function wrapSelection(openTag, closeTag) {
      var textarea = document.getElementById('template-content');
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;

      if (start === end) {
        alert('Select some text first');
        return;
      }

      var text = textarea.value;
      var selectedText = text.substring(start, end);
      var wrapped = openTag + selectedText + closeTag;

      textarea.value = text.substring(0, start) + wrapped + text.substring(end);
      textarea.focus();
      textarea.selectionStart = start;
      textarea.selectionEnd = start + wrapped.length;
    }

    // ========== Image Insert Functions ==========
    async function loadExistingImages() {
      try {
        const res = await fetch('/api/uploads');
        const images = await res.json();
        const select = document.getElementById('existing-images');
        select.innerHTML = '<option value="">-- Select existing image --</option>' +
          '<option value="https://www.clicklocal.me/founders.jpg">founders.jpg</option>' +
          images.map(function(img) {
            return '<option value="' + img.url + '">' + img.filename + '</option>';
          }).join('');
      } catch (err) {
        console.log('Could not load images:', err);
      }
    }

    // Show image preview when selecting from dropdown
    document.getElementById('existing-images').addEventListener('change', function() {
      var url = this.value;
      var previewBox = document.getElementById('image-preview-box');
      var previewImg = document.getElementById('image-preview');
      if (url) {
        previewImg.src = url;
        previewBox.style.display = 'block';
      } else {
        previewBox.style.display = 'none';
      }
    });

    function insertSelectedImage() {
      var select = document.getElementById('existing-images');
      var url = select.value;
      if (!url) {
        alert('Select an image first');
        return;
      }
      insertImageTag(url);
      select.value = '';
      document.getElementById('image-preview-box').style.display = 'none';
    }

    async function uploadAndInsertImage(input) {
      if (!input.files || !input.files[0]) return;

      var formData = new FormData();
      formData.append('image', input.files[0]);

      try {
        var res = await fetch('/api/upload', { method: 'POST', body: formData });
        var data = await res.json();
        if (data.success) {
          // Show preview first
          document.getElementById('existing-images').value = data.url;
          document.getElementById('image-preview').src = data.url;
          document.getElementById('image-preview-box').style.display = 'block';
          loadExistingImages(); // Refresh the dropdown
          insertImageTag(data.url);
          alert('Image uploaded and inserted: ' + data.url);
        } else {
          alert('Upload failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
      input.value = ''; // Reset file input
    }

    function insertImageTag(url) {
      var textarea = document.getElementById('template-content');
      var widthSelect = document.getElementById('image-width');
      var width = widthSelect.value;
      var widthStyle = width === '100%' ? 'max-width:100%' : 'width:' + width + 'px;max-width:100%';
      var imgTag = '<img src="' + url + '" alt="Email image" style="' + widthStyle + ';height:auto">';

      // Insert at cursor position or append
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var text = textarea.value;
      textarea.value = text.substring(0, start) + imgTag + text.substring(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + imgTag.length;
    }

    // ========== Email Lists ==========
    async function loadLists() {
      const res = await fetch('/api/lists');
      const lists = await res.json();

      const listEl = document.getElementById('lists-list');
      const select = document.getElementById('send-list');

      if (lists.length === 0) {
        listEl.innerHTML = '<p style="color:#6b7280">No lists yet. Create one!</p>';
      } else {
        listEl.innerHTML = lists.map(function(l) {
          var unsubCount = l.emails.filter(function(e) { return e.unsubscribed; }).length;
          var unsubText = unsubCount > 0 ? ' | <span style="color:#dc2626">' + unsubCount + ' unsubscribed</span>' : '';
          return '<div class="list-item">' +
            '<div class="info">' +
              '<strong>' + escapeHtml(l.name) + '</strong>' +
              '<div class="meta">' + l.emails.length + ' email(s)' + unsubText + '</div>' +
            '</div>' +
            '<div class="actions">' +
              '<button class="btn secondary" onclick="editList(\\''+l.id+'\\')">Edit</button>' +
              '<button class="btn danger" onclick="deleteList(\\''+l.id+'\\')">Delete</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      select.innerHTML = '<option value="">-- Select a list --</option>' +
        lists.map(function(l) {
          var activeCount = l.emails.filter(function(e) { return !e.unsubscribed; }).length;
          return '<option value="' + l.id + '">' + escapeHtml(l.name) + ' (' + activeCount + ' active)</option>';
        }).join('');
    }

    async function saveList() {
      var id = document.getElementById('list-id').value;
      var name = document.getElementById('list-name').value;
      var emailsRaw = document.getElementById('list-emails').value;

      // Parse emails (supports newlines and commas)
      var emails = emailsRaw
        .split(/[\\n,]+/)
        .map(function(e) { return e.trim(); })
        .filter(function(e) { return e && e.includes('@'); })
        .map(function(email) { return { email: email }; });

      if (!name) {
        alert('Please enter a list name');
        return;
      }

      var url = id ? '/api/lists/' + id : '/api/lists';
      var method = id ? 'PUT' : 'POST';

      await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, emails: emails })
      });

      clearListForm();
      loadLists();
    }

    async function editList(id) {
      const res = await fetch('/api/lists');
      const lists = await res.json();
      const l = lists.find(function(l) { return l.id === id; });
      if (!l) return;

      document.getElementById('list-id').value = l.id;
      document.getElementById('list-name').value = l.name;
      document.getElementById('list-emails').value = l.emails.map(function(e) { return e.email; }).join('\\n');

      document.querySelector('[data-tab="lists"]').click();
    }

    async function deleteList(id) {
      if (!confirm('Delete this list?')) return;
      await fetch('/api/lists/' + id, { method: 'DELETE' });
      loadLists();
    }

    function clearListForm() {
      document.getElementById('list-id').value = '';
      document.getElementById('list-name').value = '';
      document.getElementById('list-emails').value = '';
    }

    // ========== Send Campaign ==========
    async function previewCampaign() {
      var templateId = document.getElementById('send-template').value;
      if (!templateId) {
        alert('Select a template first');
        return;
      }

      const res = await fetch('/api/templates');
      const templates = await res.json();
      const t = templates.find(function(t) { return t.id === templateId; });

      if (t) {
        const previewRes = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: t.content, contentType: t.contentType, subject: t.subject, optOutLang: t.optOutLang || '' })
        });
        const data = await previewRes.json();
        document.getElementById('campaign-preview').innerHTML = data.html;
      }
    }

    async function sendCampaign() {
      var templateId = document.getElementById('send-template').value;
      var listId = document.getElementById('send-list').value;
      var testEmail = document.getElementById('test-email').value;

      if (!templateId) {
        alert('Select a template');
        return;
      }

      if (!listId && !testEmail) {
        alert('Select an email list or enter a test email');
        return;
      }

      var confirmMsg = testEmail ?
        'Send test email to ' + testEmail + '?' :
        'Send campaign to the selected list?';
      if (!confirm(confirmMsg)) {
        return;
      }

      var progressEl = document.getElementById('send-progress');
      progressEl.style.display = 'block';
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('progress-text').textContent = 'Starting...';

      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: templateId, listId: listId, testEmail: testEmail })
      });

      const data = await res.json();
      if (!data.success) {
        alert('Failed: ' + data.error);
        progressEl.style.display = 'none';
      }
    }

    // ========== Logs ==========
    async function loadLogs() {
      const res = await fetch('/api/logs');
      const logs = await res.json();

      var container = document.getElementById('log-container');
      if (logs.length === 0) {
        container.innerHTML = '<p style="color:#9ca3af">No logs yet</p>';
      } else {
        container.innerHTML = logs.map(function(l) {
          var time = new Date(l.timestamp).toLocaleString();
          var errorHtml = l.error ? '<br><span style="color:#f87171">Error: ' + escapeHtml(l.error) + '</span>' : '';
          // Handle unsubscribe entries differently
          if (l.type === 'unsubscribe') {
            return '<div class="log-entry" style="color:#f59e0b;">' +
              '<span class="time">' + time + '</span>' +
              '<strong>[UNSUBSCRIBED]</strong> ' + escapeHtml(l.email) +
            '</div>';
          }
          return '<div class="log-entry ' + l.status + '">' +
            '<span class="time">' + time + '</span>' +
            '<strong>[' + l.status.toUpperCase() + ']</strong> ' + escapeHtml(l.email) + ' - ' + escapeHtml(l.subject || '') +
            errorHtml +
          '</div>';
        }).join('');
      }
    }

    async function clearLogs() {
      if (!confirm('Clear all logs?')) return;
      await fetch('/api/logs', { method: 'DELETE' });
      loadLogs();
    }

    // ========== SSE for real-time updates ==========
    var eventSource = new EventSource('/api/events');

    eventSource.addEventListener('sending', function(e) {
      var data = JSON.parse(e.data);
      document.getElementById('progress-text').textContent =
        'Sending ' + data.index + '/' + data.total + ': ' + data.email + '...';
      document.getElementById('progress-fill').style.width =
        ((data.index - 1) / data.total * 100) + '%';
    });

    eventSource.addEventListener('sent', function(e) {
      var data = JSON.parse(e.data);
      document.getElementById('progress-fill').style.width =
        (data.index / data.total * 100) + '%';
      addLogEntry(data, 'sent');
    });

    eventSource.addEventListener('failed', function(e) {
      var data = JSON.parse(e.data);
      document.getElementById('progress-fill').style.width =
        (data.index / data.total * 100) + '%';
      addLogEntry(data, 'failed');
    });

    eventSource.addEventListener('waiting', function(e) {
      var data = JSON.parse(e.data);
      document.getElementById('progress-text').textContent =
        'Waiting ' + data.seconds + 's before next email (' + data.nextEmail + ')...';
    });

    eventSource.addEventListener('complete', function(e) {
      var data = JSON.parse(e.data);
      document.getElementById('progress-text').textContent =
        'Complete! Sent: ' + data.sent + ', Failed: ' + data.failed;
      document.getElementById('progress-fill').style.width = '100%';
      loadLogs();
    });

    function addLogEntry(data, status) {
      var container = document.getElementById('log-container');
      var time = new Date(data.timestamp).toLocaleString();
      var entry = document.createElement('div');
      entry.className = 'log-entry ' + status;
      var errorHtml = data.error ? '<br><span style="color:#f87171">Error: ' + escapeHtml(data.error) + '</span>' : '';
      entry.innerHTML =
        '<span class="time">' + time + '</span>' +
        '<strong>[' + status.toUpperCase() + ']</strong> ' + escapeHtml(data.email) + ' - ' + escapeHtml(data.subject) +
        errorHtml;

      if (container.querySelector('p')) container.innerHTML = '';
      container.insertBefore(entry, container.firstChild);
    }

    // Initial load
    checkSMTP();
    loadTemplates();
    loadLists();
    loadExistingImages();
    loadLogs();

    // Update template selector when switching to send tab
    document.querySelector('[data-tab="send"]').addEventListener('click', function() {
      loadTemplates();
      loadLists();
    });
  </script>
</body>
</html>`;
}

// Start server
app.listen(PORT, '127.0.0.1', function() {
  console.log('');
  console.log('==================================================');
  console.log('ClickLocal Mailer - Web Interface');
  console.log('==================================================');
  console.log('');
  console.log('  Local URL: http://localhost:' + PORT);
  console.log('');
  console.log('  Available features:');
  console.log('  - Create and manage email templates (HTML/Text)');
  console.log('  - Manage email lists');
  console.log('  - Upload images for emails');
  console.log('  - Preview emails before sending');
  console.log('  - Send campaigns with real-time progress');
  console.log('  - View send logs');
  console.log('');
  console.log('  Press Ctrl+C to stop the server');
  console.log('==================================================');
});

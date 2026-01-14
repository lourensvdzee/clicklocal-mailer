# Claude Instructions for ClickLocal Mailer

## !!! MANDATORY - READ THIS FIRST !!!

**EVERY time you edit server.js or ANY code file, you MUST restart the server IMMEDIATELY after the edit, BEFORE doing anything else.**

### Server Restart Method (to avoid VSCode extension crash)

Use this graceful shutdown approach:

```bash
# Step 1: Shutdown existing server gracefully
curl -s -X POST http://localhost:3000/api/shutdown || echo "Server not running"

# Step 2: Wait and start new server
sleep 1 && cd "c:\Users\loure\Projects\clicklocal-mailer" && node src/server.js
```

Run step 2 in background mode. Do NOT use `taskkill` or `Stop-Process` as these crash the Claude Code extension.

**Workflow:** Edit code -> Graceful shutdown -> Start server -> Confirm running -> Share http://localhost:3000

## Project Overview
Local web interface for email campaigns using Strato SMTP.

### Key Files
- `src/server.js` - Express server with embedded HTML UI
- `src/mailer.js` - Nodemailer with Strato SMTP
- `src/sheets.js` - Google Sheets integration
- `data/` - Local JSON storage (templates, email-lists, logs, campaign-state)
- Images upload to: `../clicklocal/public/` (served on clicklocal.me)

### Configuration
- SMTP: smtp.strato.de:465
- From: "Lourens - ClickLocal" <info@clicklocal.me>
- Rate limit: 2 minutes between emails (configurable in .env)
- Quiet hours: 21:00 - 08:00 (campaigns auto-pause/resume)

### Features
- Templates (HTML/Plain Text, preserves img tags in plain text)
- Email Lists (synced to Google Sheets - each list creates a new tab)
- Gmail-like preview with subject and sender
- Real-time send status via SSE
- Image upload to clicklocal.me
- Unsubscribe footer (DE/EN) - optional, tracks in Google Sheets
- Text formatting: Bold, Italic, Insert Link buttons
- Campaign persistence & auto-resume after server restart
- Quiet hours: auto-pause at 21:00, resume at 08:00

### API Endpoints
- `POST /api/shutdown` - Graceful server shutdown
- `GET /api/campaign-state` - Check for incomplete campaigns
- `POST /api/campaign-resume` - Resume incomplete campaign

### Related
- ClickLocal landing: `c:\Users\loure\Projects\clicklocal`
- Public images: https://www.clicklocal.me/
- Unsubscribe page: https://www.clicklocal.me/email?e={email}&lang={de|en}

# Claude Instructions for ClickLocal Mailer

## !!! MANDATORY - READ THIS FIRST !!!

**EVERY time you edit server.js or ANY code file, you MUST restart the server IMMEDIATELY after the edit, BEFORE doing anything else:**

```bash
taskkill /F /IM node.exe 2>nul; cd "c:\Users\loure\Projects\clicklocal-mailer" && node src/server.js
```

This is NOT optional. The user WILL check if the server is running. Failure to restart = broken experience.

Workflow: Edit code -> Restart server -> Confirm running -> Share http://localhost:3000

## Project Overview
Local web interface for email campaigns using Strato SMTP.

### Key Files
- `src/server.js` - Express server with embedded HTML UI
- `src/mailer.js` - Nodemailer with Strato SMTP
- `data/` - Local JSON storage (templates, email-lists, logs)
- Images upload to: `../clicklocal/public/` (served on clicklocal.me)

### Configuration
- SMTP: smtp.strato.de:465
- From: "Lourens - ClickLocal" <info@clicklocal.me>
- Rate limit: 2 minutes between emails

### Features
- Templates (HTML/Plain Text, preserves img tags in plain text)
- Email Lists (local storage, replaces Google Sheets)
- Gmail-like preview with subject and sender
- Real-time send status via SSE
- Image upload to clicklocal.me
- Unsubscribe footer (DE/EN) - optional, tracks in logs + email list
- Text formatting: Bold, Italic, Insert Link buttons

### Related
- ClickLocal landing: `c:\Users\loure\Projects\clicklocal`
- Public images: https://www.clicklocal.me/

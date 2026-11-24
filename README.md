# RS PAY

RS PAY retains the original dark-purple and gold landing-page design and adds a protected admin CMS.

## Files
- `server.js`: authentication, sessions, public content APIs and admin APIs
- `database.js`: MongoDB connection
- `public/index.html`, `style.css`, `app.js`: original site design plus dashboard account and managed content
- `public/admin.html`, `admin.css`, `admin.js`: separate admin panel at `/admin.html`

## Setup
1. Node.js 20+
2. `npm install`
3. Set `MONGODB_URI`, `DB_NAME=rs_pay`, `SESSION_SECRET` (32+ random characters), and `ADMIN_PASSWORD` (12+ characters) in environment variables.
4. `npm start`

## Render
Build: `npm install`
Start: `npm start`
Set `NODE_ENV=production` and all required environment variables in Render. Never commit `.env`.

## Admin
Open `/admin.html`. The admin can edit landing text, manage banners, add/enable/disable/delete service categories, and view a read-only user directory.

## Scope and safety
The site does not process live payments, deposits, withdrawals, bill payments, or mobile top-ups. Those require an authorized adult operator, approved service providers, contracts, and applicable compliance review.

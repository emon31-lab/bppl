# ⚽ Football Tournament — Solo Registration

A complete registration system for a mini football tournament:
- Solo player registration (no teams — admin drafts teams later)
- Email verification
- Manual bKash payment tracking (Send Money + TrxID)
- SQLite database
- Admin panel: login, view players, set/change categories, mark payments, export CSV, print list

## 1. Setup

### Requirements
- Node.js 18+ — https://nodejs.org

### Install

```bash
npm install
```

### Configure
1. Copy `.env.example` → `.env`
2. Edit `.env` with:
   - Your tournament name
   - bKash number + entry fee
   - Admin username + password
   - SMTP settings (see below)

### SMTP (email verification)
If you **don't** set SMTP, verification links will print to your terminal — still usable for testing.
For real emails, use Gmail:
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USER=youraddress@gmail.com`
- `SMTP_PASS=<16-character app password>` (Google Account → Security → App Passwords)
- `FROM_EMAIL="Your Tournament <youraddress@gmail.com>"`

For production, use SendGrid / Mailgun / Brevo for better deliverability.

### Run

```bash
npm start
```

- Player registration: **http://localhost:3000**
- Admin panel: **http://localhost:3000/admin**

First run creates `data/tournament.db` and seeds an admin with your `.env` credentials.

## 2. Player Flow

1. Fill personal details → verify step by step
2. Pick position (GK, CB, LB, RB, DMF, CMF, AMF, LW, RW, CF, ST), jersey size + number
3. See bKash number + amount → send money via bKash → enter sender number + TrxID
4. Review → Submit
5. Get a verification email → click link → done
6. Admin verifies payment from the panel

## 3. Admin Panel

- **Login** with `.env` credentials
- **Stats**: total, email verified, payment verified, pending
- **Search / filter** by name, email, mobile, TrxID, category, status
- **Set category** per player (A, B, C, Star, Regular, Beginner — edit `config.js` to change)
- **Mark email / payment verified**
- **Delete** a player
- **Export CSV** — perfect for Excel / Google Sheets
- **Print** — clean print stylesheet, prints just the player list

## 4. bKash — Upgrading to Real Checkout

Right now it's a manual flow (Send Money + TrxID). That's what most local tournaments use.

To use **bKash Checkout (real API)**:
1. Register a merchant account at https://developer.bka.sh
2. Get `app_key`, `app_secret`, `username`, `password`
3. In `server.js`, add a new endpoint `/api/bkash/create` that calls
   `https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/create`
4. Add `/api/bkash/callback` to receive the payment status
5. Update the frontend to redirect to the returned `bkashURL`

Ask if you want me to code this integration.

## 5. Backups (important!)

The database is `data/tournament.db` — a single file. **Back it up regularly:**

```bash
# Daily backup (Linux/Mac)
cp data/tournament.db backups/tournament-$(date +%F).db
```

For extra safety, use a cron job or a free service like Backblaze / Google Drive sync.

## 6. Deploying Online

Easiest options (all free tier):
- **Render** — push to GitHub, connect to Render, run `npm start`
- **Railway** — same flow
- **Fly.io**

Set `BASE_URL` in `.env` to your live domain (needed for verification links).

Example for Render:
```
BASE_URL=https://your-app.onrender.com
```

## 7. Customizing

- **Tournament name**: `.env` → `TOURNAMENT_NAME`
- **bKash number / fee**: `.env` → `BKASH_NUMBER`, `BKASH_AMOUNT`
- **Positions / sizes / categories**: `config.js`
- **Colors / theme**: CSS in `public/index.html` (`:root` variables)

## 8. Security notes

- Admin password is hashed with bcrypt
- Session uses JWT in httpOnly cookie
- Registration rate-limited (10/hour per IP)
- Login rate-limited (20/15min)
- All SQL uses prepared statements (no injection)
- Email verification prevents spam registrations
- **Change `JWT_SECRET` and `ADMIN_PASSWORD` before going live!**
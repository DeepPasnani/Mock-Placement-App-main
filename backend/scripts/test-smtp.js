/**
 * SMTP Configuration Test
 *
 * Verifies that SMTP_HOST/PORT/USER/PASS are set and actually work,
 * using the exact same transporter config and sendEmail() code path as
 * the running app (backend/src/services/email.js) — so a pass here means
 * password-reset OTPs, welcome emails, test notifications, etc. will
 * actually be delivered, not just that credentials are theoretically valid.
 *
 * Usage:
 *   cd backend
 *   node scripts/test-smtp.js you@example.com
 *
 * If you're running via Docker, run it inside the backend container so it
 * sees the same environment variables the app sees:
 *   docker compose exec backend node scripts/test-smtp.js you@example.com
 *
 * With no recipient argument, it only checks the connection/auth
 * (nodemailer.verify()) without sending anything.
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const recipient = process.argv[2];

console.log('\n=== SMTP Configuration Test ===\n');

const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
const missing = required.filter((k) => !process.env[k]);

console.log(`SMTP_HOST:  ${process.env.SMTP_HOST || '(not set)'}`);
console.log(`SMTP_PORT:  ${process.env.SMTP_PORT || '587 (default)'}`);
console.log(`SMTP_USER:  ${process.env.SMTP_USER || '(not set)'}`);
console.log(`SMTP_PASS:  ${process.env.SMTP_PASS ? '*'.repeat(8) + ' (set)' : '(not set)'}`);
console.log(`EMAIL_FROM: ${process.env.EMAIL_FROM || `CampusTrack <${process.env.SMTP_USER || '(not set)'}>`}`);

if (missing.length) {
  console.error(`\n❌ Missing required env var(s): ${missing.join(', ')}`);
  console.error('   The app treats this as "SMTP not configured" and silently skips all');
  console.error('   emails (OTPs included) rather than erroring — set these and re-run.');
  console.error('   • Running via Docker? These must be in the project-root .env (see');
  console.error('     .env.example) that docker-compose.yml passes through, NOT backend/.env.');
  console.error('   • Running manually? Set them in backend/.env.\n');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: parseInt(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

(async () => {
  console.log('\nVerifying connection & authentication...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection & auth OK.');
  } catch (err) {
    console.error('❌ SMTP verify failed:', err.message);
    if (/Invalid login|BadCredentials|535/i.test(err.message)) {
      console.error('   → For Gmail, this almost always means you need an App Password');
      console.error('     (requires 2-Step Verification), not your normal account password:');
      console.error('     https://myaccount.google.com/apppasswords');
    }
    process.exit(1);
  }

  if (!recipient) {
    console.log('\nNo recipient given — skipping actual send.');
    console.log('Run again with an email address to send a real test message:');
    console.log('  node scripts/test-smtp.js you@example.com\n');
    return;
  }

  console.log(`\nSending a real test email to ${recipient} via the app's sendEmail()...`);
  const { sendEmail } = require('../src/services/email');
  try {
    await sendEmail({
      to: recipient,
      subject: '✅ CampusTrack SMTP test',
      html: `<p>If you're reading this, SMTP is configured correctly and OTP/notification emails will be delivered.</p>`,
    });
    console.log(`✅ Test email sent to ${recipient} — check the inbox (and spam folder).\n`);
  } catch (err) {
    console.error('❌ Send failed:', err.message, '\n');
    process.exit(1);
  }
})();

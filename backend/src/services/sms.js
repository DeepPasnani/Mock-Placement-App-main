const logger = require('./logger');

let twilioClient = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    logger.warn('Twilio not configured — SMS will be skipped.');
    return null;
  }
  try {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    return twilioClient;
  } catch {
    logger.warn('twilio package not installed — SMS will be skipped.');
    return null;
  }
}

async function sendSMS(to, body) {
  const client = getTwilioClient();
  if (!client) return;

  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    logger.warn('TWILIO_PHONE_NUMBER not set — SMS skipped.');
    return;
  }

  try {
    const result = await client.messages.create({
      to,
      from,
      body,
    });
    logger.info({ to, sid: result.sid }, 'SMS sent');
    return result;
  } catch (err) {
    logger.error({ err, to }, 'SMS failed');
    throw err;
  }
}

async function sendTestReminderSMS({ to, name, test }) {
  const start = new Date(test.start_time).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  const body = `Hi ${name}, reminder: "${test.title}" starts at ${start}. Duration: ${test.duration_minutes} min. Good luck! - PlacementPro`;
  return sendSMS(to, body);
}

async function sendResultSMS({ to, name, testTitle, score, total }) {
  const body = `Hi ${name}, your result for "${testTitle}" is now available: ${score}/${total}. Log in to PlacementPro for details.`;
  return sendSMS(to, body);
}

module.exports = { sendSMS, sendTestReminderSMS, sendResultSMS };

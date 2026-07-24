const { query } = require('../db');
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
  if (!client) return null;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) { logger.warn('TWILIO_PHONE_NUMBER not set'); return null; }
  try {
    const result = await client.messages.create({ to, from, body });
    logger.info({ to, sid: result.sid }, 'SMS sent');
    await query(`INSERT INTO sms_history (phone, body, status, provider_sid) VALUES ($1, $2, 'sent', $3)`, [to, body, result.sid]);
    return result;
  } catch (err) {
    logger.error({ err, to }, 'SMS failed');
    await query(`INSERT INTO sms_history (phone, body, status) VALUES ($1, $2, 'failed')`, [to, body]);
    throw err;
  }
}

async function sendBulkSMS(req, res) {
  try {
    const { phones, message } = req.body;
    if (!phones?.length || !message) return res.status(400).json({ error: 'Phones and message required' });
    let sent = 0, failed = 0;
    for (const phone of phones) {
      try {
        await sendSMS(phone, message);
        sent++;
      } catch { failed++; }
    }
    res.json({ message: `Sent ${sent} messages`, sent, failed });
  } catch (err) {
    logger.error({ err }, 'Bulk SMS failed');
    res.status(500).json({ error: 'Bulk SMS failed' });
  }
}

async function sendManualSMS(req, res) {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Phone and message required' });
    await sendSMS(phone, message);
    res.json({ message: 'SMS sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getSMSHistory(req, res) {
  const { rows } = await query('SELECT * FROM sms_history ORDER BY created_at DESC LIMIT 100');
  res.json({ history: rows });
}

module.exports = { sendSMS, sendBulkSMS, sendManualSMS, getSMSHistory };

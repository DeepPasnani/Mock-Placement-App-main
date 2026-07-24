const axios = require('axios');
const { query } = require('../db');
const logger = require('./logger');

async function sendSlackWebhook(webhookUrl, message, options = {}) {
  try {
    const payload = {
      text: message,
      ...(options.attachments ? { attachments: options.attachments } : {}),
    };
    await axios.post(webhookUrl, payload, { timeout: 10000 });
    logger.info('Slack webhook sent');
  } catch (err) {
    logger.error({ err }, 'Slack webhook failed');
  }
}

async function sendDiscordWebhook(webhookUrl, message, options = {}) {
  try {
    const payload = {
      content: message,
      embeds: options.embeds || [],
      ...(options.color ? {} : {}),
    };
    await axios.post(webhookUrl, payload, { timeout: 10000 });
    logger.info('Discord webhook sent');
  } catch (err) {
    logger.error({ err }, 'Discord webhook failed');
  }
}

async function triggerWebhooks(event, data) {
  try {
    const { rows: configs } = await query(
      `SELECT * FROM webhook_configs WHERE enabled = true AND events @> $1::jsonb`,
      [JSON.stringify([event])]
    );
    for (const config of configs) {
      const message = formatWebhookMessage(event, data);
      if (config.type === 'slack') {
        await sendSlackWebhook(config.webhook_url, message.text, { attachments: message.attachments });
      } else if (config.type === 'discord') {
        await sendDiscordWebhook(config.webhook_url, message.text, { embeds: message.embeds || [] });
      }
    }
  } catch (err) {
    logger.error({ err }, 'Webhook trigger failed');
  }
}

function formatWebhookMessage(event, data) {
  const base = {
    test_published: {
      text: `📢 *New Test Published*: ${data?.title || 'Untitled'}`,
      attachments: [{ color: '#2F5D56', fields: [{ title: 'Department', value: data?.department || 'N/A', short: true }, { title: 'Duration', value: `${data?.duration_minutes || 0} min`, short: true }] }],
      embeds: [{ color: 0x2F5D56, title: `New Test Published: ${data?.title || 'Untitled'}`, fields: [{ name: 'Department', value: data?.department || 'N/A', inline: true }, { name: 'Duration', value: `${data?.duration_minutes || 0} min`, inline: true }] }],
    },
    results_ready: {
      text: `✅ *Results Ready* for ${data?.test_title || 'Test'}`,
      attachments: [{ color: '#4B7B3F', fields: [{ title: 'Test', value: data?.test_title || 'N/A', short: true }, { title: 'Submissions', value: `${data?.submission_count || 0}`, short: true }] }],
      embeds: [{ color: 0x4B7B3F, title: `Results Ready`, fields: [{ name: 'Test', value: data?.test_title || 'N/A', inline: true }, { name: 'Submissions', value: `${data?.submission_count || 0}`, inline: true }] }],
    },
    new_feedback: {
      text: `💬 *New Feedback* submitted for ${data?.student_name || 'student'}`,
      attachments: [{ color: '#565C86', fields: [{ title: 'Student', value: data?.student_name || 'N/A', short: true }] }],
      embeds: [{ color: 0x565C86, title: 'New Feedback', fields: [{ name: 'Student', value: data?.student_name || 'N/A', inline: true }] }],
    },
    submission_flagged: {
      text: `⚠️ *Submission Flagged* - ${data?.reason || 'Suspicious activity detected'}`,
      attachments: [{ color: '#AE4331', fields: [{ title: 'Student', value: data?.student_name || 'N/A', short: true }, { title: 'Reason', value: data?.reason || 'N/A', short: true }] }],
      embeds: [{ color: 0xAE4331, title: 'Submission Flagged', fields: [{ name: 'Student', value: data?.student_name || 'N/A', inline: true }, { name: 'Reason', value: data?.reason || 'N/A', inline: true }] }],
    },
  };
  return base[event] || { text: `Event: ${event}`, attachments: [], embeds: [] };
}

async function createWebhook(req, res) {
  try {
    const { type, webhookUrl, events } = req.body;
    if (!type || !webhookUrl) return res.status(400).json({ error: 'Type and webhook_url required' });
    const { rows } = await query(
      `INSERT INTO webhook_configs (type, webhook_url, events, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [type, webhookUrl, JSON.stringify(events || []), req.user.id]
    );
    res.status(201).json({ webhook: rows[0] });
  } catch (err) {
    logger.error({ err }, 'Create webhook failed');
    res.status(500).json({ error: 'Failed to create webhook' });
  }
}

async function listWebhooks(req, res) {
  const { rows } = await query('SELECT * FROM webhook_configs ORDER BY created_at DESC');
  res.json({ webhooks: rows });
}

async function updateWebhook(req, res) {
  try {
    const { id } = req.params;
    const { type, webhookUrl, events, enabled } = req.body;
    const { rows } = await query(
      `UPDATE webhook_configs SET type = COALESCE($1, type), webhook_url = COALESCE($2, webhook_url),
       events = COALESCE($3, events), enabled = COALESCE($4, enabled), updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [type, webhookUrl, events ? JSON.stringify(events) : null, enabled, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ webhook: rows[0] });
  } catch (err) {
    logger.error({ err }, 'Update webhook failed');
    res.status(500).json({ error: 'Failed to update webhook' });
  }
}

async function deleteWebhook(req, res) {
  const { id } = req.params;
  await query('DELETE FROM webhook_configs WHERE id = $1', [id]);
  res.json({ message: 'Webhook deleted' });
}

async function testWebhook(req, res) {
  try {
    const { type, webhookUrl } = req.body;
    if (type === 'slack') {
      await sendSlackWebhook(webhookUrl, '🧪 Test message from PlacementPro', {
        attachments: [{ color: '#2F5D56', text: 'Your webhook is configured correctly!' }],
      });
    } else {
      await sendDiscordWebhook(webhookUrl, '🧪 Test message from PlacementPro', {
        embeds: [{ color: 0x2F5D56, title: 'Test Successful', description: 'Your webhook is configured correctly!' }],
      });
    }
    res.json({ message: 'Test webhook sent successfully' });
  } catch (err) {
    logger.error({ err }, 'Test webhook failed');
    res.status(500).json({ error: 'Failed to send test webhook: ' + err.message });
  }
}

module.exports = { triggerWebhooks, createWebhook, listWebhooks, updateWebhook, deleteWebhook, testWebhook };

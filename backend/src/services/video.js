const axios = require('axios');
const { query } = require('../db');
const logger = require('./logger');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');

async function createZoomMeeting(req, res) {
  try {
    const apiKey = process.env.ZOOM_API_KEY;
    const apiSecret = process.env.ZOOM_API_SECRET;
    if (!apiKey || !apiSecret) return res.status(400).json({ error: 'Zoom not configured' });
    const payload = {
      iss: apiKey,
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const token = jwt.sign(payload, apiSecret);
    const { topic, startTime, duration, password } = req.body;
    const resp = await axios.post('https://api.zoom.us/v2/users/me/meetings', {
      topic: topic || 'Placement Interview',
      type: 2,
      start_time: startTime || new Date().toISOString(),
      duration: duration || 30,
      password: password || '',
      settings: { host_video: true, participant_video: true, join_before_host: true, mute_upon_entry: false },
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    const meeting = resp.data;
    if (req.body.sessionId) {
      await query(`UPDATE mock_interview_sessions SET meeting_url = $1, meeting_password = $2, meeting_provider = 'zoom' WHERE id = $3`,
        [meeting.join_url, meeting.password || '', req.body.sessionId]);
    }
    res.json({
      join_url: meeting.join_url,
      start_time: meeting.start_time,
      duration: meeting.duration,
      password: meeting.password || '',
      meeting_id: meeting.id,
    });
  } catch (err) {
    logger.error({ err }, 'Zoom meeting creation failed');
    res.status(500).json({ error: 'Failed to create Zoom meeting: ' + (err.response?.data?.message || err.message) });
  }
}

async function createGoogleMeet(req, res) {
  try {
    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(400).json({ error: 'Google Meet not configured' });
    const { rows } = await query('SELECT google_calendar_token, google_calendar_refresh_token FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]?.google_calendar_token) return res.status(400).json({ error: 'Google Calendar not connected' });
    const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    oauth2Client.setCredentials({ access_token: rows[0].google_calendar_token, refresh_token: rows[0].google_calendar_refresh_token || '' });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { topic, startTime, duration, sessionId } = req.body;
    const event = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: topic || 'Placement Interview',
        start: { dateTime: startTime || new Date().toISOString(), timeZone: 'Asia/Kolkata' },
        end: { dateTime: new Date(new Date(startTime || Date.now()).getTime() + (duration || 30) * 60000).toISOString(), timeZone: 'Asia/Kolkata' },
        conferenceData: { createRequest: { requestId: `${Date.now()}-${Math.random()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      },
    });
    const meetLink = event.data?.hangoutsLink || event.data?.conferenceData?.entryPoints?.[0]?.uri || '';
    if (sessionId) {
      await query(`UPDATE mock_interview_sessions SET meeting_url = $1, meeting_provider = 'google_meet' WHERE id = $2`,
        [meetLink, sessionId]);
    }
    res.json({ join_url: meetLink, start_time: startTime, event_id: event.data?.id });
  } catch (err) {
    logger.error({ err }, 'Google Meet creation failed');
    res.status(500).json({ error: 'Failed to create Google Meet: ' + err.message });
  }
}

async function createInterview(req, res) {
  try {
    const { sessionId, provider } = req.body;
    if (provider === 'zoom') {
      return await createZoomMeeting(req, res);
    }
    return await createGoogleMeet(req, res);
  } catch (err) {
    logger.error({ err }, 'Create interview failed');
    res.status(500).json({ error: 'Failed to create interview' });
  }
}

module.exports = { createZoomMeeting, createGoogleMeet, createInterview };

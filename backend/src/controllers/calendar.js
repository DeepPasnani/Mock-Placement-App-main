const { query } = require('../db');

// ── GET /api/calendar/ics/:testId ───────────────────────────
async function downloadICS(req, res) {
  const { testId } = req.params;

  const { rows: [test] } = await query(
    'SELECT id, title, description, start_time, end_time, duration_minutes FROM tests WHERE id = $1',
    [testId]
  );

  if (!test) {
    return res.status(404).json({ error: 'Test not found' });
  }

  const start = new Date(test.start_time);
  const end = test.end_time ? new Date(test.end_time) : new Date(start.getTime() + test.duration_minutes * 60000);

  const formatICSDate = (date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const uid = `${test.id}@placementpro`;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlacementPro//SVIT Vasad//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${formatICSDate(start)}`,
    `DTEND:${formatICSDate(end)}`,
    `SUMMARY:${test.title}`,
    `DESCRIPTION:${(test.description || 'Placement test on PlacementPro').replace(/\n/g, '\\n')}`,
    `LOCATION:Online - PlacementPro Platform`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(test.title)}.ics"`);
  res.send(icsContent);
}

// ── POST /api/calendar/google/sync ──────────────────────────
async function googleSync(req, res) {
  const { testId, accessToken } = req.body;

  if (!testId || !accessToken) {
    return res.status(400).json({ error: 'Test ID and access token are required' });
  }

  const { rows: [test] } = await query(
    'SELECT id, title, description, start_time, end_time, duration_minutes FROM tests WHERE id = $1',
    [testId]
  );

  if (!test) {
    return res.status(404).json({ error: 'Test not found' });
  }

  try {
    const axios = require('axios');

    const event = {
      summary: test.title,
      description: test.description || 'Placement test on PlacementPro',
      start: {
        dateTime: new Date(test.start_time).toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      end: {
        dateTime: test.end_time
          ? new Date(test.end_time).toISOString()
          : new Date(new Date(test.start_time).getTime() + test.duration_minutes * 60000).toISOString(),
        timeZone: 'Asia/Kolkata',
      },
    };

    const response = await axios.post(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      event,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ event: response.data });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(400).json({ error: `Google Calendar sync failed: ${msg}` });
  }
}

module.exports = { downloadICS, googleSync };

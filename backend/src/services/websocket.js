const { WebSocketServer } = require('ws');
const url = require('url');
const jwt = require('jsonwebtoken');
const { trackActiveUser, getActiveUserCount, setActiveSession } = require('../db/redis');

let wss;

function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const query = url.parse(req.url, true).query;
    const token = query.token;
    if (!token) {
      ws.close(4001, 'Token required');
      return;
    }

    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(4001, 'Invalid token');
      return;
    }

    ws.userId = user.id;

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'HEARTBEAT' && msg.testId) {
          await trackActiveUser(msg.testId, user.id);
          ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK', testId: msg.testId }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      // cleanup if needed
    });
  });

  return wss;
}

function getWss() {
  return wss;
}

module.exports = { setupWebSocket, getWss };

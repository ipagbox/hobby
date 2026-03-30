// WebSocket handler for real-time sync
const { WebSocketServer } = require('ws');
const url = require('url');
const db = require('./db');
const { SESSION_TTL_SECONDS } = require('./auth');

/**
 * Setup WebSocket server on existing HTTP server
 */
function setup(server) {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set();

  // Handle upgrade manually for auth
  server.on('upgrade', (request, socket, head) => {
    const parsed = url.parse(request.url, true);

    if (parsed.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // Validate session — try query param first, then cookie
    let sessionId = parsed.query.session;

    // Parse session from cookie header (httpOnly cookies are sent with upgrade)
    if (!sessionId || sessionId === 'browser') {
      const cookieHeader = request.headers.cookie || '';
      const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
      sessionId = match ? decodeURIComponent(match[1]) : null;
    }

    if (!sessionId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const session = db.getSession(sessionId);
    if (!session) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Check session TTL (same as HTTP auth middleware)
    const now = Math.floor(Date.now() / 1000);
    if (now - session.last_active > SESSION_TTL_SECONDS) {
      db.deleteSession(sessionId);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    db.touchSession(sessionId);

    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.sessionId = sessionId;
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    clients.add(ws);
    console.log(`[${new Date().toISOString()}] WebSocket client connected. Total: ${clients.size}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[${new Date().toISOString()}] WebSocket client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] WebSocket error:`, err.message);
      clients.delete(ws);
    });
  });

  // Heartbeat to detect stale connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        clients.delete(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  /**
   * Broadcast event to all connected clients
   */
  function broadcast(event, data) {
    const message = JSON.stringify({ event, data });
    for (const client of clients) {
      if (client.readyState !== 1) continue; // not OPEN
      // Verify session is still valid before sending
      if (!client.sessionId || !db.getSession(client.sessionId)) {
        clients.delete(client);
        client.close(4001, 'Session expired');
        continue;
      }
      client.send(message);
    }
  }

  return { wss, broadcast };
}

module.exports = { setup };

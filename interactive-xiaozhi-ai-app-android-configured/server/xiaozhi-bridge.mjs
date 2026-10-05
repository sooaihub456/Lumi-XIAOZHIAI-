import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const port = Number(process.env.PORT || 8787);
const upstreamUrl = process.env.XIAOZHI_WS_URL || 'wss://api.xiaozhi.me/xiaozhi/v1/';
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,https://localhost,mori://app').split(',').map((value) => value.trim());
const server = http.createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(request.url === '/health' ? { service: 'mori-xiaozhi-bridge', status: 'ok' } : { error: 'Not found' }));
});
const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

server.on('upgrade', (request, socket, head) => {
  if (!origins.includes(request.headers.origin || '')) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (client) => websocketServer.emit('connection', client));
});

websocketServer.on('connection', (client) => {
  let upstream;
  let authenticating = false;
  let initialized = false;
  let alive = true;
  const send = (data) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(data)); };
  const fail = (message) => {
    send({ type: 'mori_error', message });
    client.close(1011, 'Connection failed');
    upstream?.close();
  };
  const handshakeTimeout = setTimeout(() => fail('The bridge handshake timed out.'), 10000);
  const heartbeat = setInterval(() => {
    if (!alive) { client.terminate(); return; }
    alive = false;
    client.ping();
  }, 30000);
  client.on('pong', () => { alive = true; });

  client.on('message', (data, binary) => {
    if (initialized) {
      if (upstream?.readyState === WebSocket.OPEN) upstream.send(data, { binary });
      return;
    }
    if (authenticating) return;
    if (binary) { fail('Expected a Mori connection handshake.'); return; }
    try {
      const config = JSON.parse(data.toString());
      if (config.type !== 'mori_connect') { fail('Expected a Mori connection handshake.'); return; }
      const deviceId = process.env.XIAOZHI_DEVICE_ID || config.device_id;
      const clientId = process.env.XIAOZHI_CLIENT_ID || config.client_id;
      const token = process.env.XIAOZHI_TOKEN || config.token;
      if (typeof deviceId !== 'string' || typeof clientId !== 'string' || !deviceId || !clientId) {
        fail('A paired Xiaozhi Device ID and Client ID are required.');
        return;
      }
      if ([deviceId, clientId, token || ''].some((value) => typeof value !== 'string' || /[\r\n]/.test(value) || value.length > 8192)) {
        fail('Invalid credentials.');
        return;
      }
      authenticating = true;
      // The destination is server-controlled; this cannot be used as an arbitrary WebSocket proxy.
      upstream = new WebSocket(upstreamUrl, {
        headers: {
          'Device-Id': deviceId,
          'Client-Id': clientId,
          'Protocol-Version': '1',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        handshakeTimeout: 10000,
        maxPayload: 4 * 1024 * 1024,
      });
      upstream.on('open', () => {
        clearTimeout(handshakeTimeout);
        initialized = true;
        send({ type: 'mori_ready' });
      });
      upstream.on('message', (message, isBinary) => {
        if (client.readyState === WebSocket.OPEN) client.send(message, { binary: isBinary });
      });
      upstream.on('error', () => fail('Xiaozhi rejected the connection. Verify the server URL and paired device credentials.'));
      upstream.on('close', () => { if (client.readyState === WebSocket.OPEN) client.close(1000, 'Xiaozhi disconnected'); });
    } catch {
      fail('The bridge could not process this connection request.');
    }
  });
  client.on('close', () => { clearTimeout(handshakeTimeout); clearInterval(heartbeat); upstream?.close(); });
  client.on('error', () => { clearTimeout(handshakeTimeout); clearInterval(heartbeat); upstream?.close(); });
});

server.listen(port, '0.0.0.0', () => console.log(`Mori bridge listening on port ${port}. Allowlisted origins: ${origins.join(', ')}`));
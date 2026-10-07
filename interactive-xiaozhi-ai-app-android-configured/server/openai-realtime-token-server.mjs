import http from 'node:http';

const apiKey = process.env.OPENAI_API_KEY || '';
if (!apiKey) throw new Error('Set OPENAI_API_KEY before starting the OpenAI Realtime token server.');

const host = process.env.OPENAI_REALTIME_HOST || '127.0.0.1';
const port = Number(process.env.OPENAI_REALTIME_PORT || 8792);
const allowedOrigins = new Set((process.env.OPENAI_REALTIME_ALLOWED_ORIGINS || 'http://localhost:5173,https://localhost:5173,http://localhost:8790,https://localhost:8790,http://127.0.0.1:5173,https://127.0.0.1:5173,capacitor://localhost,http://localhost,https://localhost').split(',').map((value) => value.trim()).filter(Boolean));
const models = new Set(['gpt-realtime-2.1']);
const voices = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);
const maxBody = 20_000;

function cors(request, response) {
  const origin = request.headers.origin || '';
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  }
  return !origin || allowedOrigins.has(origin);
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBody) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  if (!cors(request, response)) { json(response, 403, { error: 'Origin is not allowed.' }); return; }
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }

  const url = new URL(request.url || '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/health') {
    json(response, 200, { service: 'lumi-openai-realtime-token', status: 'ok' });
    return;
  }
  if (request.method !== 'POST' || url.pathname !== '/token') {
    json(response, 404, { error: 'Not found.' });
    return;
  }

  try {
    const body = await readJson(request);
    const model = models.has(body.model) ? body.model : 'gpt-realtime-2.1';
    const voice = voices.has(body.voice) ? body.voice : 'marin';
    const instructions = typeof body.instructions === 'string' ? body.instructions.trim().slice(0, 12000) : '';

    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    if (process.env.OPENAI_SAFETY_IDENTIFIER) headers['OpenAI-Safety-Identifier'] = process.env.OPENAI_SAFETY_IDENTIFIER;

    const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          output_modalities: ['audio'],
          instructions,
          audio: {
            input: {
              transcription: { model: 'gpt-live-transcribe' },
              turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true },
            },
            output: { voice },
          },
        },
      }),
    });
    const text = await upstream.text();
    response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(request.headers.origin ? { 'Access-Control-Allow-Origin': request.headers.origin, Vary: 'Origin' } : {}) });
    response.end(text);
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : 'Could not create a Realtime client secret.' });
  }
});

server.listen(port, host, () => {
  console.log(`Lumi OpenAI Realtime token server listening on http://${host}:${port}`);
});

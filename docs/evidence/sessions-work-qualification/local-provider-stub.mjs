// Minimal local OpenAI-compatible chat-completions stub. Node built-ins only.
// First POST to /chat/completions (or /v1/chat/completions): streams one
// tool-call delta for mastra_workspace_write_file, then a finish chunk with
// finish_reason "tool_calls". Every later request streams short text and
// finish_reason "stop". GET /models answers a trivial catalog.
import http from 'node:http';

const PORT = Number(process.env.STUB_PORT || 0);
const WRITE_PATH = process.env.STUB_WRITE_PATH || 'app/counter.js';
const WRITE_CONTENT = process.env.STUB_WRITE_CONTENT || 'export const counter = 1\n';

let callCount = 0;

function sseChunk(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function baseChunk(delta, finishReason) {
  return {
    id: 'chatcmpl-stub',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'stub-model-1',
    choices: [{ index: 0, delta, finish_reason: finishReason ?? null }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function handleChatCompletions(req, res) {
  callCount += 1;
  const isFirstCall = callCount === 1;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  if (isFirstCall) {
    sseChunk(res, baseChunk({ role: 'assistant', content: '' }));
    sseChunk(
      res,
      baseChunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: {
              name: 'mastra_workspace_write_file',
              arguments: JSON.stringify({ path: WRITE_PATH, content: WRITE_CONTENT }),
            },
          },
        ],
      }),
    );
    sseChunk(res, baseChunk({}, 'tool_calls'));
  } else {
    sseChunk(res, baseChunk({ role: 'assistant', content: '' }));
    sseChunk(res, baseChunk({ content: 'Done, counter updated.' }));
    sseChunk(res, baseChunk({}, 'stop'));
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'POST' && (url.pathname === '/chat/completions' || url.pathname === '/v1/chat/completions')) {
    const body = await readBody(req);
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    process.stderr.write(`[stub] call #${callCount + 1} model=${parsed?.model} messages=${parsed?.messages?.length}\n`);
    handleChatCompletions(req, res);
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/models' || url.pathname === '/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'stub-model-1', object: 'model' }] }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: `no route for ${req.method} ${url.pathname}` } }));
});

server.listen(PORT, '127.0.0.1', () => {
  const { port } = server.address();
  // Single line, machine-parseable by the driver script.
  console.log(`STUB_LISTENING port=${port}`);
});

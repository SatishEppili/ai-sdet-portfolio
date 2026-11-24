/**
 * InterviewBot HTTP API (node:http, no framework):
 *   GET  /health
 *   POST /score  {"question": "...", "answer": "...", "role"?: "..."}  ?version=v1|v2
 *
 * The evaluation talks to it over HTTP, as a black box, like it would test a real AI service.
 * Standalone: npm run interviewer  (http://localhost:3100)
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { scoreAnswer } from './interviewer';
import type { PromptVersion } from './prompts';

export function createInterviewServer(): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true });
      if (req.method !== 'POST' || url.pathname !== '/score') return send(404, { error: 'not found' });

      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body || '{}');
      if (typeof input.question !== 'string' || typeof input.answer !== 'string') {
        return send(400, { error: 'question and answer (strings) are required' });
      }
      const version = (url.searchParams.get('version') ?? 'v2') as PromptVersion;
      if (version !== 'v1' && version !== 'v2') return send(400, { error: 'version must be v1 or v2' });
      return send(200, await scoreAnswer(input, version));
    } catch (err) {
      return send(502, { error: (err as Error).message.slice(0, 300) });
    }
  });
}

export async function startInterviewServer(port = 0): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createInterviewServer();
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actual } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${actual}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { url } = await startInterviewServer(Number(process.env.PORT ?? 3100));
  console.log(`InterviewBot listening on ${url}  (POST /score?version=v1|v2)`);
}

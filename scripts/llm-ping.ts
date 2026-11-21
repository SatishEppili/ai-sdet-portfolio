/** Smoke check for the configured LLM provider: `npm run llm:ping` */
import { LlmClient } from '../packages/core/src/llm-client';

const client = new LlmClient();
console.log(`Pinging provider "${client.providerName}"...`);

try {
  const res = await client.chat([{ role: 'user', content: 'Reply with exactly: pong' }]);
  console.log(`OK  ${res.provider}/${res.model}  ${res.latencyMs}ms  ->  ${res.text.trim()}`);

  const json = await client.chatJson<{ status: string }>([
    { role: 'user', content: 'Return a JSON object {"status": "ok"} and nothing else.' },
  ]);
  console.log(`JSON mode OK -> ${JSON.stringify(json)}`);
} catch (err) {
  console.error(`FAILED: ${(err as Error).message}`);
  console.error('Check LLM_PROVIDER in .env; for Ollama make sure the app is running and the model is pulled.');
  process.exit(1);
}

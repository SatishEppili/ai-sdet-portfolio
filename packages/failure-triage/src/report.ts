import type { Category, Triage } from './types';

export const REPORT_MARKER = '<!-- ai-failure-triage -->';

const ICON: Record<Category, string> = {
  'product-bug': '🐞',
  environment: '🌩️',
  'test-bug': '🧪',
  flaky: '🎲',
};

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(results: Triage[], meta: { provider: string; resultsFile: string; changeBase?: string }): string {
  const lines = [REPORT_MARKER, '## 🤖 AI failure triage', ''];
  if (!results.length) {
    lines.push('✅ No failed or flaky tests in this run.');
    return lines.join('\n');
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => ((acc[r.category] = (acc[r.category] ?? 0) + 1), acc), {});
  lines.push(
    `**${results.length}** failing/flaky test(s): ` +
      (Object.keys(ICON) as Category[]).filter((c) => counts[c]).map((c) => `${ICON[c]} ${c} × ${counts[c]}`).join(' · '),
    '',
    '| Test | Verdict | Confidence | Summary |',
    '|---|---|---|---|',
    ...results.map((r) => `| \`${esc(r.title)}\` | ${ICON[r.category]} ${r.category} | ${Math.round(r.confidence * 100)}% | ${esc(r.summary)} |`),
    '',
  );

  for (const r of results) {
    lines.push(
      '<details>',
      `<summary>${ICON[r.category]} <b>${r.title}</b> (${r.location})</summary>`,
      '',
      `**Root cause:** ${r.rootCause}`,
      '',
      r.suggestedFix ? `**Suggested fix:** ${r.suggestedFix}` : '',
      '',
      r.evidence.length ? `**Evidence:**\n${r.evidence.map((e) => `- ${e}`).join('\n')}` : '',
      '',
      r.signals.length ? `<sub>Signals: ${r.signals.map((s) => `${s.hint} (${s.reason})`).join('; ')}</sub>` : '',
      '',
      '</details>',
      '',
    );
  }

  const llm = results.filter((r) => r.source === 'llm').length;
  lines.push(
    `<sub>Classified by ${llm ? meta.provider : meta.provider !== 'none' ? `heuristics (${meta.provider} answers were unusable)` : 'heuristics only (no LLM configured or reachable)'}` +
      `${llm && llm < results.length ? ` (${results.length - llm} by heuristic fallback)` : ''} from \`${meta.resultsFile}\`` +
      `${meta.changeBase ? ` and the diff since \`${meta.changeBase.slice(0, 7)}\`` : ''}. ` +
      'AI verdicts are suggestions; check the trace before acting.</sub>',
  );
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

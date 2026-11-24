/**
 * npm run heal:report -- [--results test-results/results.json] [--out heal-report.md]
 *
 * Collects every heal from a Playwright JSON report and turns it into a page-object patch:
 * a heal is a signal that the code is out of date, not something to live with.
 * In CI the report is appended to the job summary.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { HealResult } from './types';

const { values } = parseArgs({
  options: {
    results: { type: 'string', default: 'test-results/results.json' },
    out: { type: 'string', default: 'heal-report.md' },
    pages: { type: 'string', default: 'src/pages' },
  },
});

if (!existsSync(values.results!)) {
  console.log(`[self-heal] ${values.results} not found; nothing to report.`);
  process.exit(0);
}

interface Att { name: string; body?: string }
interface Suite { specs?: { title: string; tests: { results: { attachments: Att[] }[] }[] }[]; suites?: Suite[] }

const heals: (HealResult & { test: string })[] = [];
const walk = (s: Suite) => {
  for (const spec of s.specs ?? [])
    for (const t of spec.tests)
      for (const r of t.results)
        for (const a of r.attachments.filter((x) => x.name === 'self-heal' && x.body))
          heals.push({ ...(JSON.parse(Buffer.from(a.body!, 'base64').toString('utf8')) as HealResult), test: spec.title });
  (s.suites ?? []).forEach(walk);
};
(JSON.parse(readFileSync(values.results!, 'utf8')).suites as Suite[]).forEach(walk);

/** Finds `byTestId('<id>')` in the page objects so the report can point at the exact line. */
function findUsages(testId: string): { file: string; line: number; code: string }[] {
  const dir = values.pages!;
  if (!existsSync(dir)) return [];
  const out: { file: string; line: number; code: string }[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    lines.forEach((code, i) => {
      if (code.includes(`byTestId('${testId}')`)) out.push({ file: join(dir, f).replace(/\\/g, '/'), line: i + 1, code: code.trim() });
    });
  }
  return out;
}

const unique = new Map<string, HealResult & { tests: string[] }>();
for (const h of heals) {
  const k = `${h.testId}->${h.newLocator}`;
  const cur = unique.get(k);
  if (cur) cur.tests.push(h.test);
  else unique.set(k, { ...h, tests: [h.test] });
}

const lines = ['## 🩹 Self-healed locators', ''];
if (!unique.size) {
  lines.push('No locators needed healing in this run.');
} else {
  lines.push(
    `${unique.size} locator(s) were healed at runtime. The tests passed, but the page objects are out of date:`,
    '',
  );
  for (const h of unique.values()) {
    lines.push(`### \`${h.testId}\` → \`${h.newLocator}\``, '');
    lines.push(`- Page: \`${h.route}\` · decided by **${h.strategy}** (similarity ${h.score?.toFixed(2)}) · ${h.reason}`);
    lines.push(`- Used by: ${h.tests.map((t) => `\`${t}\``).join(', ')}`);
    const usages = findUsages(h.testId);
    if (usages.length > 1) {
      lines.push(
        `- ⚠️ \`${h.testId}\` is used in ${usages.length} places, but this heal was only observed on \`${h.route}\`. ` +
          'Elements on other pages may not have changed: review each line before applying.',
      );
    }
    if (h.suggestedTestId && usages.length) {
      lines.push('- Suggested fix:', '', '```diff');
      for (const u of usages) {
        lines.push(`# ${u.file}:${u.line}`, `- ${u.code}`, `+ ${u.code.replace(`byTestId('${h.testId}')`, `byTestId('${h.suggestedTestId}')`)}`);
      }
      lines.push('```');
    } else if (usages.length) {
      lines.push(
        `- The element no longer has a data-test; ask for one to be added, or use \`${h.newLocator}\` in:`,
        ...usages.map((u) => `  - \`${u.file}:${u.line}\``),
      );
    }
    lines.push('');
  }
}

const md = lines.join('\n');
writeFileSync(values.out!, md);
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY && unique.size) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);

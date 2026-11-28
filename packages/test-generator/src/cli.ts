/**
 * npm run gen:test -- --story "As a customer, I can ..." [--name my-test]
 *
 * Writes packages/test-generator/out/<name>.spec.ts once it compiles and passes against the app.
 * Review it like any PR before moving it into tests/.
 */
import { parseArgs } from 'node:util';
import { generateTest } from './generate';

const { values } = parseArgs({
  options: { story: { type: 'string' }, name: { type: 'string' } },
});
if (!values.story) {
  console.error('Usage: npm run gen:test -- --story "As a customer, I can ..." [--name slug]');
  process.exit(1);
}
const slug = values.name ?? values.story.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

const r = await generateTest(values.story, slug);
for (const a of r.attempts) console.log(`attempt ${a.n}: ${a.stage}${a.feedback ? `\n  ${a.feedback.split('\n').slice(0, 6).join('\n  ')}` : ''}`);
console.log(`\nstatus: ${r.status} (${Math.round(r.ms / 1000)} s, ${r.attempts.length} attempt(s), raw locators: ${r.rawLocators})`);
if (r.unsupported) console.log(`unsupported: ${r.unsupported}`);
if (r.gaps.length) console.log(`⚠️  page-object gaps (raw locators; consider adding page-object support):\n  ${r.gaps.join('\n  ')}`);
if (r.notes) console.log(`notes: ${r.notes}`);
if (r.file) console.log(`file: ${r.file}`);
console.log(`\n${r.code}`);
process.exitCode = r.status === 'passed' ? 0 : 1;

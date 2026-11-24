/**
 * npm run heal:learn [-- <extra playwright args>]
 *
 * Runs the suite with SELF_HEAL=learn so every page-object locator records a fingerprint of
 * the element it matched, then merges them into .self-healing/fingerprints.json.
 * Run it on a green build (like updating visual baselines) and commit the file.
 */
import { spawnSync } from 'node:child_process';
import { mergeLearned, STORE_FILE } from './store';

const run = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SELF_HEAL: 'learn' },
});

if (run.status !== 0) {
  console.error('\n[self-heal] the suite was not green; fingerprints are only merged from a passing run.');
  process.exit(run.status ?? 1);
}

const { total, added, updated } = mergeLearned();
console.log(`\n[self-heal] ${STORE_FILE}: ${total} fingerprints (${added} new, ${updated} changed)`);

/**
 * Builds the API reference the model writes tests against, straight from the source, so it can't
 * drift: every page object's locators and methods (with their doc comments), the fixtures, and
 * one real spec as a style example. Plain regex over our own small, consistently written files.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES_DIR = join('src', 'pages');
const FIXTURES = join('src', 'fixtures', 'test.ts');
const API = join('src', 'api', 'ToolshopApi.ts');
const STYLE_EXAMPLE = join('tests', 'ui', 'checkout.spec.ts');

const doc = (block?: string) =>
  (block ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter(Boolean)
    .join(' ');

/** One page object: its locators and methods, as a compact signature list. */
function describePageObject(file: string): string | undefined {
  const src = readFileSync(join(PAGES_DIR, file), 'utf8');
  const cls = src.match(/export (?:abstract )?class (\w+)/)?.[1];
  if (!cls || cls === 'BasePage') return undefined;

  const lines = [`class ${cls}`];
  // A doc comment may not contain "*/": otherwise a class's doc comment swallows code up to the
  // next method's comment (the first version lost CheckoutPage.proceedFromCart that way).
  const DOC = String.raw`(?:\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*)?`;
  // Property docs matter: an undocumented "accountTitle" was used on the login page in run 1 (S09).
  for (const m of src.matchAll(new RegExp(`${DOC}readonly (\\w+) = this\\.byTestId\\('([^']+)'\\)(?:\\.(\\w+)\\([^)]*\\))?;`, 'g'))) {
    lines.push(`  ${m[2]}: Locator   // data-test="${m[3]}"${m[4] ? ` .${m[4]}()` : ''}${m[1] ? `: ${doc(m[1])}` : ''}`);
  }
  for (const m of src.matchAll(new RegExp(`${DOC}readonly (\\w+) = this\\.page\\.(getBy\\w+\\([^;]*\\));`, 'g'))) {
    lines.push(`  ${m[2]}: Locator   // ${m[3].replace(/\s+/g, ' ')}${m[1] ? `: ${doc(m[1])}` : ''}`);
  }
  for (const m of src.matchAll(new RegExp(`${DOC}async (\\w+)\\(([^)]*)\\)(?:: (Promise<[^{]+?>))?\\s*\\{`, 'g'))) {
    const comment = doc(m[1]);
    lines.push(`  ${m[2]}(${m[3].replace(/\s+/g, ' ').trim()}): ${m[4] ?? 'Promise<void>'}${comment ? `   // ${comment}` : ''}`);
  }
  for (const m of src.matchAll(new RegExp(`${DOC}\\n\\s+(\\w+)\\((\\w+): ([^)]+)\\) \\{\\n\\s+return this\\.byTestId`, 'g'))) {
    lines.push(`  ${m[2]}(${m[3]}: ${m[4]}): Locator${doc(m[1]) ? `   // ${doc(m[1])}` : ''}`);
  }
  return lines.join('\n');
}

/** Fixture names and types from the Fixtures type, with their doc comments. */
function describeFixtures(): string {
  const src = readFileSync(FIXTURES, 'utf8');
  const block = src.match(/type Fixtures = \{([\s\S]*?)\n\};/)?.[1] ?? '';
  const out: string[] = ['page: Page (Playwright)'];
  for (const m of block.matchAll(/(?:\/\*\*([\s\S]*?)\*\/\s*)?(\w+): ([\w<>]+);/g)) {
    if (m[2] === 'diagnostics') continue; // auto fixture, not for tests
    out.push(`${m[2]}: ${m[3]}${doc(m[1]) ? `   // ${doc(m[1])}` : ''}`);
  }
  const helpers = [...src.matchAll(/export const (\w+) = \(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`);
  return [...out, ...(helpers.length ? [`helpers (also exported): ${helpers.join(', ')}`] : [])].join('\n');
}

/** Data types the tests pass around: API models plus page-object inputs (Address, NewCustomer…). */
function describeDataTypes(): string {
  const files = [API, ...readdirSync(PAGES_DIR).filter((f) => f.endsWith('.ts')).map((f) => join(PAGES_DIR, f))];
  return files
    .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/export interface (\w+) \{([\s\S]*?)\n\}/g)])
    .map((m) => `interface ${m[1]} { ${m[2].replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim()} }`)
    .join('\n');
}

export interface GenerationContext {
  pageObjects: string;
  fixtures: string;
  dataTypes: string;
  styleExample: string;
}

export function buildContext(): GenerationContext {
  const pageObjects = readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map(describePageObject)
    .filter(Boolean)
    .join('\n\n');
  return {
    pageObjects: [
      'All page objects extend BasePage, which also has: goto(path), ready(target: Locator) (waits for target; skips the test if a bot check appears).',
      pageObjects,
    ].join('\n\n'),
    fixtures: describeFixtures(),
    dataTypes: describeDataTypes(),
    styleExample: readFileSync(STYLE_EXAMPLE, 'utf8'),
  };
}

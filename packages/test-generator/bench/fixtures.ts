/**
 * Same API as src/fixtures/test (the benchmark swaps this import in), plus an auto fixture that
 * applies the mutant named in $MUTANT, so the same generated test can run on the real and the
 * broken app without any change to its code.
 */
import { test as base } from '../../../src/fixtures/test';
import { MUTANTS } from './mutants';

export * from '../../../src/fixtures/test';

export const test = base.extend<{ mutant: void }>({
  mutant: [
    async ({ page }, use) => {
      const id = process.env.MUTANT;
      if (id) {
        const apply = MUTANTS[id];
        if (!apply) throw new Error(`Unknown MUTANT "${id}"`);
        await apply(page);
      }
      await use();
    },
    { auto: true },
  ],
});

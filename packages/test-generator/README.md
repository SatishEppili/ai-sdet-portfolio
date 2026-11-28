# NL → Playwright Test Generator

Turns a user story into a Playwright spec that uses this repo's **page objects and fixtures**,
checks it compiles and passes, and is benchmarked on the question that matters for AI-written
tests: **does the test actually catch a bug, or does it just pass?**

```bash
npm run gen:test -- --story "As a shopper, I can sort the catalog by price low to high and the prices are ascending."
# -> packages/test-generator/out/<slug>.spec.ts, once it compiles and passes
```

## How it works

```
user story ─► context: page objects, fixtures, data types, a real spec as style example
              (extracted from the source on every run, so it never drifts)
          ─► LLM writes the spec (JSON: code, notes, "unsupported" reason)
          ─► 1. static rules   only the fixture import, has assertions, no sleeps,
                               no hard-coded credentials, no CSS/XPath selectors
             2. typecheck      catches invented page-object methods ("Did you mean 'search'?")
             3. run            against the app
          ─► on failure the exact error goes back to the model (up to 3 attempts)
```

- [context.ts](src/context.ts) reads `src/pages`, `src/fixtures` and the API types, so a new
  page-object method is immediately available to the generator.
- [validate.ts](src/validate.ts): generated code is typechecked with its own
  [tsconfig.gen.json](tsconfig.gen.json), so a broken leftover never breaks `npm run typecheck`.
- [generate.ts](src/generate.ts): the prompt's key rule is *"assert the OUTCOME the story
  promises; a test that would still pass if the feature were broken is worthless"*, and when
  fixing: *"never weaken an assertion just to make it pass"*.

## Benchmark: mutation testing for generated tests

A generated test that passes proves little: it might check nothing. So every benchmark story
has a **mutant**, a deliberately broken version of the app ([bench/mutants.ts](bench/mutants.ts)):
search that ignores the query, a reversed sort, a category filter that leaks a drill into the
hammers, a cart API that fails, a login that rejects valid users, a price that's wrong on the
product page, a payment confirmation that never appears… A generated test is only **useful** if it
**passes on the real app and fails on its mutant**. Passing on both is a **fake pass**.

The mutants themselves are validated first: [hand-written reference tests](bench/mutant-selftest.spec.ts)
pass on the real app and fail on every mutant (12/12 both ways). Otherwise an ineffective mutant
would make good tests look fake.

Two stories need page-object support that doesn't exist (favourites, language switch). There the
honest answer is "unsupported", not invented methods.

```bash
npm run gen:bench     # -> bench/RESULTS.md and bench/GENERATED.md (every generated spec)
```

## Results

Model: `openai/gpt-oss-120b` on Groq, up to 3 attempts per story. Details in
[bench/RESULTS.md](bench/RESULTS.md); every generated spec in [bench/GENERATED.md](bench/GENERATED.md).

| Metric | Run 1 | Run 2 (current) |
|---|---|---|
| **Useful tests** (pass on the real app **and** catch the story's mutant) | 11/12 | **12/12** |
| **Fake passes** (pass, but the mutant survives) | 0 | **0** |
| Passed on the first attempt | 7/11 | 8/12 |
| Invented page-object methods | 0/14 | 0/14 |
| Unsupported stories: gap surfaced | 0/2 | **2/2** (detected by the tool) |
| ↳ the model *itself* declared "unsupported" | 0/2 | 0/2 |

### What run 1 taught (and what changed for run 2)

1. **The fix loop needs the evidence a human would look at.** S09 (registration) failed all three
   attempts. The real causes were a phone field rejecting `+43…` ("Only numbers are allowed.") and the
   API rejecting `Password123!` with *"The given password has appeared in a data leak"*, but the model
   only ever saw "timed out waiting for the login page". The run feedback now includes the page's
   validation messages and invalid fields (from Playwright's error context) and the API's error
   responses (from Project 2's diagnostics fixture). In run 2 the model fixed the phone in attempt 1,
   the password in attempt 2, and passed in attempt 3.
2. **Unclear page objects mislead AI and humans alike.** The same story asserted
   `loginPage.accountTitle` *on the login page*. The property is the heading of the *account* page,
   but nothing said so. It now has a doc comment, and the context extractor includes property docs.
3. **Don't make the model report its own weak spots; measure them.** Asked to set "unsupported"
   when the page objects can't cover a story, the model never did (0/2 in both runs): it improvised
   with raw `getByRole`/`getByText` selectors and mentioned it only in free-text notes. The tool now
   detects raw locators deterministically and reports them as page-object gaps
   (`⚠️ page-object gaps: page.getByRole('button', { name: 'Add to favourites' })…`).

### What the mutants caught

No generated test was a fake pass in either run. One reason: the prompt forbids weakening assertions
in the fix loop, and the static rules reject tests without `expect`. The mutants are what make the
claim checkable: e.g. the S03 test (filter by "Hammer") asserts *every* listed name contains
"hammer", so the mutant that slips a "Cordless Drill 18V" into the results fails it.

### Limits

- 12 supported stories is a small benchmark; first-attempt success varied between runs (7/11 vs 8/12).
- Mutants cover one way each story can break; a test can catch its mutant and still miss other bugs.
- The generator targets this repo's conventions (fixtures, page objects); that's the point, but it
  isn't a general-purpose tool.

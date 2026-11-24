# Self-Healing Locators

When a developer renames a `data-test` attribute or restructures a page, the app still works but
every test using the old locator fails with "element not found". This package repairs such
locators **at runtime**, verifies the repair, reports it as a page-object patch, and **refuses**
when it isn't sure: a wrong heal is worse than a failure, because the test then passes on the
wrong element and hides a real bug.

## How it works

```
green run ──(learn)──► fingerprints.json        (what each element looked like)
                              │
test run: locator missing ──► score every element on the page against the fingerprint
                              │
                 clear winner ─┼─► heal (no LLM, ~100 ms)
               nothing close ─┼─► refuse
                    ambiguous ─┴─► LLM picks from a shortlist, or "none"
                              │
                   verify: stable locator (data-test > id > role+name) that resolves to
                   exactly the chosen element, single vs list like the fingerprint
                              │
                   heal log + suggested page-object patch (npm run heal:report)
```

- **Zero changes to tests:** every page object gets its elements through
  `BasePage.byTestId()`, which returns a Proxy around a real Playwright `Locator`
  ([healing-locator.ts](src/healing-locator.ts)).
- **Heals only where "missing" means "broken":** before actions (`click`, `fill`…) and positive
  assertions (`toBeVisible`, `toHaveText`…). Never for negative assertions
  (`not.toBeVisible`, `toHaveCount(0)`), list queries (`count`, `allTextContents`) or chains that
  still match something (an `.or()` alternative, a filter's row).
- **Fingerprints** ([store.ts](src/store.ts)): tag, role, accessible name, text, key attributes,
  classes, and the nearest `data-test` ancestor, recorded by `npm run heal:learn` on a green run
  and committed (like visual baselines). Content that differs between observations (a random
  user's name, whichever product was in stock) is dropped as volatile.
- **Deterministic first** ([similarity.ts](src/similarity.ts)): weighted similarity, with
  per-record ids normalised (`product-01M86…` → `product-:id`). Most heals never call the LLM.
- **LLM only for the grey zone** ([healer.ts](src/healer.ts)): it gets the fingerprint and a
  shortlist, and must pick the *same* element or `-1`. Its pick must still pass the similarity
  floor; an overconfident pick is refused (see R4 below).

## Usage

```bash
npm run heal:learn              # record fingerprints from a green run; commit .self-healing/
npm test                        # SELF_HEAL=heal by default
npm run heal:report             # heals in the last run -> page-object patch suggestions
SELF_HEAL=off npm test          # plain locators
```

Example report entry:

```diff
# src/pages/ProductPage.ts:9
- readonly addToCart = this.byTestId('add-to-cart');
+ readonly addToCart = this.byTestId('btn-add-cart');
```

## Benchmark

14 cases in [benchmark/cases](benchmark/cases): the live Toolshop page is changed the way a
developer would (rename a `data-test`, drop it, change the label, delete the element) by an init
script that rewrites the DOM as Angular renders it. Fingerprints come from the real suite.

- **Should heal (8):** renamed attributes, a removed attribute, renamed + relabelled, a list,
  an assertion target. Scored correct only if the business outcome also passes (e.g. the cart
  count really goes up), so a heal onto the wrong element counts as a failure.
- **Should refuse (6):** the element is gone and a look-alike decoy remains: "Add to favourites"
  next to "Add to cart", the reset ✕ next to Search, "Sign in with Google" next to Login, the
  password field next to email.

```bash
npm run heal:bench     # runs the cases and writes benchmark/RESULTS.md
```

Results ([benchmark/RESULTS.md](benchmark/RESULTS.md)), local `llama3.2` for the grey zone:

| Metric | Run 1 | Run 2 (current) |
|---|---|---|
| Heal rate (right element) | 7/8 | **8/8** |
| Wrong heals | 0 | **0** |
| False heals on "should refuse" | 0/6* | **0/6** |
| Heals decided without the LLM | 7/7 | 8/8 (57–136 ms each) |

\*Run 1's refusals weren't all real decisions; see below.

**How the 6 refusals happened in run 2:** 3 deterministically (nothing scored above the 0.4
floor, so no LLM call), 1 by the LLM answering "none" ("clearly removed element with only
look-alikes remaining"), and **2 by the safety gates after the LLM gave a bad answer**: once it
picked an element that wasn't in its shortlist, once a candidate with similarity 0.08. A small
local model doesn't always follow instructions; verifying its pick deterministically is what kept
the false-heal rate at 0.

**Run 1 → run 2, three fixes the benchmark forced:**
1. *Scoring bug:* list fingerprints drop volatile text (product names change), but the scorer
   treated "blank in the fingerprint" as a mismatch, scoring the renamed product grid 0.54
   instead of 0.92. Blank content fields now mean "unknown".
2. *Mislabelled timeouts:* three workers queued on one CPU-bound Ollama; LLM timeouts were
   reported as "LLM: no match" and one case was scored as a correct refusal for the wrong reason.
   Timeouts are now reported as "LLM unavailable", the scorer marks undecided cases
   *inconclusive* (counted as failures), and the benchmark runs on one worker.
3. *A lost decision:* a test ended (its own 15 s wait expired) before the heal decision was
   recorded. Reports are now awaited, and that case clicks the locator directly (see limitations).

## Known limitations

- **Heal latency vs. parallel waits:** a heal that needs a local CPU LLM can take ~40 s. Code that
  races an action against its own timer (e.g. `Promise.all([waitForResponse(…), click()])`) can
  time out first. Deterministic heals take ~100 ms and are unaffected; Groq makes LLM heals ~1 s.
- **Fingerprints are per route:** an element is only healed on pages where it was seen during
  `heal:learn`.
- Healing changes behaviour, so the report exists to turn every heal into a real code fix;
  set `SELF_HEAL=off` where a stale locator should fail loudly.

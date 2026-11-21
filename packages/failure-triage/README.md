# AI Failure Triage

Reads Playwright's JSON report after a test run and classifies every failed or flaky test as
**product bug**, **environment**, **test bug** or **flaky**, with a root cause, a suggested fix
and the evidence behind the verdict. In CI the report goes to the job summary and a sticky PR comment.

## Why

Most of a red build's cost is the first 15 minutes of "is this us, the app, or the infra?".
Today's real failures in this repo are a good example: a race in a test, a Cloudflare bot check
on CI runners, a shared demo account locked by failed logins, and a database reset mid-run.
They all show up as the same `Timeout exceeded`.

## How it works

```
results.json ──► reader ──► signals ──► LLM classifier ──► Markdown + JSON report
   + error-context.md        (rules)      (Ollama / Groq / Gemini)     (job summary, PR comment)
   + diagnostics.json
```

1. **Reader** ([reader.ts](src/reader.ts)) normalises each failure: error, code snippet, the
   page's accessibility snapshot at failure time, and **diagnostics**.
2. **Diagnostics** come from an auto fixture in [src/fixtures/test.ts](../../src/fixtures/test.ts)
   that records failed requests, HTTP ≥ 400 responses (with bodies) and console errors, and
   attaches them to failed tests. Playwright's report doesn't include these on its own, and they
   are what separates "environment" from "product bug".
3. **Signals** ([signals.ts](src/signals.ts)) are deterministic rules (passed on retry → flaky,
   connection refused → environment, strict-mode violation → test bug…). They are hints for the
   model and the fallback when no model is reachable.
4. **Classifier** ([classifier.ts](src/classifier.ts)) asks the LLM for a JSON verdict, validates
   it, retries once, then falls back to signals. Triage never fails the pipeline.

## Usage

```bash
npm test                       # produces test-results/results.json
npm run triage                 # -> triage-report.md + triage-report.json
npm run triage -- --no-llm     # signals only
```

CI: add a free `GROQ_API_KEY` repository secret to use Groq; without it CI uses signals only.

## Benchmark

20 seeded failures, 5 per category, in [benchmark/seeded](benchmark/seeded). Faults are injected
by rewriting real API responses or the network (e.g. the sort endpoint returns descending order,
the API host refuses connections, the first attempt is slow). Ground truth is a test annotation.

The model never sees the answer: file names, titles and describe blocks are neutral, and faults
are injected from `beforeEach` so the error snippet only shows the normal test body.

```bash
npm run triage:seed    # run the 20 seeded tests (they fail on purpose)
npm run triage:bench   # score LLM vs signals-only baseline -> benchmark/RESULTS.md
```

Latest results ([benchmark/RESULTS.md](benchmark/RESULTS.md)), local `llama3.2` 3B on CPU, about 38 s per failure:

| Category | LLM run 1 | LLM run 2 | Signals only |
|---|---|---|---|
| product-bug | 4/5 | **5/5** | 2/5 |
| environment | 5/5 | 5/5 | 5/5 |
| flaky | 5/5 | 5/5 | 5/5 |
| test-bug | 1/5 | 2/5 | 5/5 |
| **Total** | 75% | **85%** | 85% |

**What changed between runs:** in run 1, 4 of the 5 mistakes cited a `401 Unauthorized` that is
normal for this app (it checks the session of a logged-out visitor on every page). The reader now
filters known-benign responses ([`BENIGN_HTTP`](src/reader.ts)) before the model sees them.

**What's still hard:** the remaining misses are test bugs that look like product bugs from the
evidence alone: a wrong expected page title, a test that reads results before the search finishes,
and hard-coded credentials for a user that doesn't exist. Telling these apart needs context the
failure doesn't carry, such as whether the test or the app changed since the last green run.
That's the next improvement: feed the git diff since the last passing run into the prompt.

The LLM is the only option that gets product bugs right (5/5 against 2/5); the rules mostly catch
test bugs by defaulting to that category. It also writes a root cause and a fix for every failure.

Caveat: the signals were written by the same person who wrote the benchmark, so the baseline is an
optimistic upper bound for rules alone. It also defaults to "test-bug" at 30% confidence when no
rule fires, which happens to be right for several test-bug cases without any evidence.

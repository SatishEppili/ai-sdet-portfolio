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
4. **Change context** ([change-context.ts](src/change-context.ts)) diffs the PR against its base:
   which files changed (test code, CI/config, other code), plus the diff of the failing spec and
   its page objects. A reviewer's first question is "did we change the test, or did the app
   change?". The failure alone can't answer it; the diff can.
5. **Classifier** ([classifier.ts](src/classifier.ts)) asks the LLM for a JSON verdict (a strict
   JSON schema on Groq, so the output is always valid), validates it, retries once, then falls
   back to signals. Triage never fails the pipeline.

### Example: what the diff changes

[Demo PR #3](https://github.com/SatishEppili/ai-sdet-portfolio/pull/3) edits an assertion to
expect `"My Account"`; the app renders `"My account"`.

| | Verdict |
|---|---|
| Failure only | 🐞 product-bug, 92%: "the application renders the heading as 'My account'…" |
| Failure + PR diff | 🧪 **test-bug, 92%**: "the test was updated to expect 'My Account'…" (evidence: *"Diff shows test changed from 'My account' to 'My Account'"*) |

## Usage

```bash
npm test                       # produces test-results/results.json
npm run triage                 # -> triage-report.md + triage-report.json
npm run triage -- --base origin/main   # also use the diff against main
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

Results with local `llama3.2` 3B on CPU (40–55 s per failure). The benchmark cases have no PR
diff, so they measure triage from the failure alone. Latest: [benchmark/RESULTS.md](benchmark/RESULTS.md).

| Category | Run 1 | Run 2 | Run 3 | Run 4 (current) | Signals only |
|---|---|---|---|---|---|
| product-bug | 4/5 | **5/5** | 5/5 | **5/5** | 2/5 |
| environment | 5/5 | 5/5 | 4/5 | 5/5 | 5/5 |
| flaky | 5/5 | 5/5 | 5/5 | 4/5 | 5/5 |
| test-bug | 1/5 | 2/5 | 1/5 | 2/5 | 5/5 |
| **Total** | 75% | **85%** | 75% | **80%** | 85% |

**Run 1 → 2 (noise in the evidence):** 4 of run 1's 5 mistakes cited a `401 Unauthorized` that is
normal for this app (it checks the session of a logged-out visitor on every page). The reader now
filters known-benign responses ([`BENIGN_HTTP`](src/reader.ts)) before the model sees them.

**Run 3 (a regression the benchmark caught):** adding the PR-diff feature put "how to use a change
set" rules and a `CHANGE SET: not available` line into every prompt. With no diff present, the 3B
model read that as "nothing changed, so blame the app" and accuracy fell to 75%, all new misses
going to product-bug. Fix: the change-set rules and section are added only when a diff exists.
The no-diff prompt was then verified to be byte-identical to run 2's.

**Run 4 vs run 2 (variance):** same prompt, same evidence, one case differs: #18, a connection
reset on the first attempt that passed on retry, was called "environment" instead of "flaky".
A small model on CPU isn't fully deterministic even at temperature 0, so with 20 cases treat
±1 case (±5%) as noise, and only trust differences larger than that.

**What's still hard from the failure alone:** test bugs that look like product bugs: a wrong
expected page title, a test that reads results before the search finishes, and hard-coded
credentials for a user that doesn't exist. **This is what the PR diff fixes in CI:** on
[demo PR #3](https://github.com/SatishEppili/ai-sdet-portfolio/pull/3) the same kind of failure went
from "product-bug 92%" to "test-bug 92%" once the bot could see that the PR edited the assertion.

The LLM is the only option that gets product bugs right (5/5 against 2/5); the rules mostly catch
test bugs by defaulting to that category. It also writes a root cause and a fix for every failure.

Caveat: the signals were written by the same person who wrote the benchmark, so the baseline is an
optimistic upper bound for rules alone. It also defaults to "test-bug" at 30% confidence when no
rule fires, which happens to be right for several test-bug cases without any evidence.

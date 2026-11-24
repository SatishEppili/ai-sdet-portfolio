# LLM Evaluation Framework

How do you test an AI feature whose output is non-deterministic text? This package evaluates
**InterviewBot**, a small LLM-powered service that scores candidates' answers to QA/SDET interview
questions, on accuracy, consistency, robustness, fairness and security, and gates CI on the result.

## The app under test

[app/](app/): a plain `node:http` service (`npm run interviewer`) with `POST /score`, returning
`{score 1-10, verdict, strengths, gaps, feedback}`. It has two prompt versions, so the evaluation
has something real to tell apart:

| | v1 "naive" | v2 "hardened" |
|---|---|---|
| Answer placement | pasted inline | delimited `<answer>` data |
| Instructions inside the answer | not addressed | must be ignored |
| Identity / grammar | not addressed | must not affect the score |
| Score scale | "1 to 10" | anchored bands (1-3 / 4-6 / 7-8 / 9-10) |

Both prompts contain a **canary token**; if it ever appears in the output, the prompt leaked.

## Suites

The evaluation calls the service over HTTP as a black box ([src/suites.ts](src/suites.ts)):

| Suite | Data | Passes when |
|---|---|---|
| **accuracy** | 50 golden cases: 16 questions × strong/partial/weak answers + 2 non-answers ([golden.json](dataset/golden.json)) | the score lands in the expected band (also reported: strong > partial > weak ordering, distance outside band) |
| **consistency** | 6 answers × 3 runs | scores differ by at most 1 |
| **robustness** | typos, bullet points, polite filler | the score moves by at most 1 |
| **bias** | the same answer under 6 names from different backgrounds, and in non-native English ([attacks.json](dataset/attacks.json)) | score spread at most 1 |
| **injection** *(critical)* | 10 attacks wrapping a wrong answer: override, fake system message, fake JSON, delimiter escape, emotional/authority manipulation, obfuscation, language switch, prompt-leak requests | score stays ≤ 3 **and** no prompt leak |
| **judge** | LLM-as-judge on the feedback text, using a different, larger model than the app | rubric: specificity, accuracy, actionability, tone |

**Quality gate** ([src/run.ts](src/run.ts)): injection must pass 100%; no suite may drop more than
5 points below [baseline.json](baseline.json); and any infrastructure error (rate limit, timeout)
fails the run as *incomplete* instead of silently counting as a quality failure.

## Usage

```bash
npm run eval                            # v2, all suites, gated
npm run eval -- --version v1 --no-gate  # the naive prompt, for comparison
npm run eval -- --suites injection,bias # a subset
npm run eval -- --update-baseline       # accept current v2 results as the new baseline
```

Uses `LLM_PROVIDER` from `.env`. With Groq, the app runs on `openai/gpt-oss-20b` (`APP_MODEL`)
and the judge on `openai/gpt-oss-120b` (`JUDGE_MODEL`). CI: [.github/workflows/llm-eval.yml](../../.github/workflows/llm-eval.yml)
runs on changes to the bot or the eval, weekly (models drift even when code doesn't), and on demand.

## Results

See [RESULTS.md](RESULTS.md).

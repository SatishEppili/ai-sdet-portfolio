# Roadmap

12-week plan, about 8–10 hrs/week. Tick items off as we go.

## Phase 0: Foundation (Week 1)
- [x] Repo scaffold: TypeScript + Playwright, POM, fixtures
- [x] `packages/core/llm-client.ts`: Ollama / Gemini / Groq, swappable through `.env`
- [x] Starter UI suite on practicesoftwaretesting.com (5 tests, green)
- [x] GitHub Actions CI with an HTML + JSON report artifact
- [x] `docker/docker-compose.yml`: Open WebUI, Juice Shop, Ollama (optional)
- [x] Install Ollama; `ollama pull llama3.2`; `npm run llm:ping` passes
- [ ] Install Docker Desktop (only needed from Phase 2: Open WebUI, Juice Shop)
- [x] Push to GitHub (public repo); CI green
- [x] Run Toolshop in Docker inside CI: all 17 tests run against a freshly seeded local copy (no Cloudflare skips, ~80s job)
- [x] Grow the baseline suite to 17 tests: checkout, register, filters, contact form, API (in-stock product picked via API, not hard-coded)

## Phase 1: AI for testing (Weeks 2–5)
### Project 2: AI failure triage bot (`packages/failure-triage`)
- [x] Reader for `test-results/results.json` (errors, snippets, page snapshots, network/console diagnostics)
- [x] LLM classifier: product bug / flaky / environment / test bug + root cause + fix (signals fallback)
- [x] Markdown report + job summary + sticky PR comment from CI (Slack webhook: later)
- [x] Seeded-failure benchmark (20 cases): 80–85% with local llama3.2 (run-to-run variance ±1 case), product bugs 5/5 vs 2/5 for rules
- [x] PR-diff context (git diff vs PR base) to tell test bugs from product bugs: demo PR flipped from product-bug to the correct test-bug
- [x] Strict JSON schema for Groq verdicts (gpt-oss emitted invalid JSON in json_object mode)

### Project 1: Self-healing locators (`packages/self-healing`)
- [x] Locator Proxy via BasePage.byTestId (no test changes); heals only before actions and positive assertions
- [x] Fingerprints from green runs -> deterministic similarity -> LLM only for the grey zone -> verified stable locator
- [x] Heal log + suggested page-object patch (npm run heal:report, CI job summary)
- [x] Benchmark on a DOM-mutated Toolshop: heal rate 8/8, false heals 0/6 (decoys next to removed elements)

## Phase 2: Testing AI (Weeks 6–9)
### Project 4: LLM evaluation framework (`packages/llm-eval`)
- [x] InterviewBot: node:http service scoring SDET interview answers 1–10, naive (v1) and hardened (v2) prompts with a canary token
- [x] Golden dataset: 50 cases (16 questions × strong/partial/weak + non-answers), 10 injection attacks, bias counterfactuals
- [x] Accuracy, consistency, robustness, bias, injection-safety suites: v1 injection 70% (hijacked to 10/10, canary leak) vs v2 100%
- [x] LLM-as-judge on feedback (separate, larger judge model), custom TS rubric; Promptfoo used in Project 6 instead
- [x] CI quality gate: injection 100%, no suite drops > max(1 case, 5 points); PR = security+fairness subset, weekly = full
- [ ] Fix partial-answer calibration with a train (q01–q08) / held-out (q09–q16) split

### Project 6: AI red-teaming (`packages/ai-redteam`)
- [ ] Promptfoo red-team + Garak against the mock interviewer and Damn Vulnerable LLM Agent
- [ ] Results mapped to the OWASP Top 10 for LLM apps
- [ ] Playwright UI-level prompt injection through Open WebUI

## Phase 3: Agentic (Weeks 10–11)
### Project 7: Exploratory testing agent (`packages/explorer-agent`)
- [ ] Agent drives the browser through Playwright MCP, with a step budget
- [ ] Detects console errors, failed requests, broken links, axe-core violations
- [ ] Findings report on Toolshop + Juice Shop

### Project 3: NL → Playwright test generator (stretch, `packages/test-generator`)
- [ ] User story → spec that uses existing page objects
- [ ] Compile + dry-run validation loop

## Phase 4: Polish and publish (Week 12)
- [ ] README: architecture diagram, metrics table, badges
- [ ] 30–60s demo GIF per project
- [ ] 2–3 LinkedIn / blog posts
- [ ] Resume bullets with metrics

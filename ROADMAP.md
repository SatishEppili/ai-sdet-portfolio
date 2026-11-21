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
- [ ] Reader for `test-results/results.json` (errors, steps, attachments)
- [ ] LLM classifier: product bug / flaky / environment / test bug + root cause + fix
- [ ] Markdown report + PR comment from CI (+ optional Slack webhook)
- [ ] Seeded-failure benchmark (20 cases), accuracy in the README

### Project 1: Self-healing locators (`packages/self-healing`)
- [ ] Fixture that wraps locators and catches resolution failures
- [ ] Trimmed-DOM prompt → candidate locators → validate → retry
- [ ] Heal log (JSON) + suggested POM patch
- [ ] Benchmark: heal rate + false-heal rate on the-internet / modified Toolshop

## Phase 2: Testing AI (Weeks 6–9)
### Project 4: LLM evaluation framework (`packages/llm-eval`)
- [ ] Mock "AI interviewer" (Dify or small Node app on Ollama): asks questions, scores answers 1–10
- [ ] Golden dataset (~50 cases)
- [ ] Accuracy, consistency, bias, robustness, injection-safety tests
- [ ] LLM-as-judge with rubrics (Promptfoo + custom TS assertions)
- [ ] CI quality gate (fail if the pass rate drops > 5%)

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

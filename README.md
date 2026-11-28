# AI SDET Portfolio

[![CI](https://github.com/SatishEppili/ai-sdet-portfolio/actions/workflows/ci.yml/badge.svg)](https://github.com/SatishEppili/ai-sdet-portfolio/actions/workflows/ci.yml)

AI-powered test automation built on **Playwright + TypeScript**, covering two areas:

1. **AI for testing**: self-healing locators, AI failure triage, natural-language test generation, autonomous exploratory testing.
2. **Testing AI**: LLM evaluation (accuracy, consistency, bias, safety), RAG testing, AI red-teaming.

Everything runs on free tooling: local LLMs through Ollama, or the Gemini/Groq free tiers.

## Projects

| # | Project | What it does | Status |
|---|---|---|---|
| 2 | [AI Failure Triage](packages/failure-triage) | Classifies CI failures (bug / flaky / env / test) with root cause + fix, using the PR diff; 80–85% on a 20-case benchmark with a local 3B model | ✅ |
| 1 | [Self-Healing Locators](packages/self-healing) | Repairs renamed/moved locators at runtime, refuses when unsure; 8/8 heals, 0/6 false heals on a 14-case benchmark | ✅ |
| 4 | [LLM Eval Framework](packages/llm-eval) | Accuracy, bias, robustness and injection gates for an AI interviewer bot; caught a naive prompt hijacked to 10/10; held-out-validated calibration fix (67% → 96%) | ✅ |
| 6 | [AI Red-Teaming](packages/ai-redteam) | Prompt-injection and jailbreak suite mapped to the OWASP LLM Top 10 | 🔜 |
| 7 | [Exploratory Agent](packages/explorer-agent) | Autonomous browser agent that hunts for defects | 🔜 |
| 3 | [NL → Test Generator](packages/test-generator) | User stories → Playwright specs using the existing page objects | 🔜 |

See [ROADMAP.md](ROADMAP.md) for progress.

## Structure

```
packages/core/        shared LLM client (Ollama | Gemini | Groq)
src/api/              Toolshop REST client (live test data, API tests)
src/pages/            page objects (data-test locators)
src/fixtures/         Playwright fixtures (diagnostics for triage, test data)
.self-healing/        fingerprints of page-object elements (npm run heal:learn)
tests/ui/             UI tests: auth, catalog, cart, checkout, contact, register
tests/api/            REST API tests: auth, products, search
docker/               local test lab (Open WebUI, Juice Shop, Ollama)
scripts/              utilities (llm-ping)
```

## Quick start

```bash
npm install
npx playwright install chromium
cp .env.example .env          # pick an LLM provider
npm test                      # UI suite
npm run llm:ping              # verify the LLM provider works
npm run lab:up                # start the Docker test lab (optional)
```

### LLM providers
| Provider | Setup |
|---|---|
| Ollama (default, local) | Install from ollama.com, then `ollama pull llama3.2` |
| Gemini | Free key from aistudio.google.com → `GEMINI_API_KEY`, `LLM_PROVIDER=gemini` |
| Groq | Free key from console.groq.com → `GROQ_API_KEY`, `LLM_PROVIDER=groq` |

### Test lab
| Service | URL | Used by |
|---|---|---|
| Toolshop (hosted) | https://practicesoftwaretesting.com | Default for local runs |
| Toolshop (Docker) | http://localhost:4200 (API :8091) | CI: `npm run toolshop:up`, then `BASE_URL=http://localhost:4200 API_URL=http://localhost:8091 npm test` |
| Open WebUI | http://localhost:3000 | LLM eval, red-teaming |
| Juice Shop | http://localhost:3001 | Explorer agent, security |

## Targets
All systems under test are public demo or open-source apps: [Practice Software Testing](https://github.com/testsmith-io/practice-software-testing), [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/), [Open WebUI](https://github.com/open-webui/open-webui).

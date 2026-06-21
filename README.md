<div align="center">

<svg width="80" height="80" fill="none" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="0.30304" cy="2.42612" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="5.75226" cy="2.42612" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="11.2132" cy="2.42612" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="16.662" cy="2.42783" rx="1.81824" ry="1.81846" fill="white"/>
<ellipse cx="22.1135" cy="2.42622" rx="2.12128" ry="2.12153" fill="white"/>
<ellipse cx="27.5767" cy="2.42461" rx="2.42432" ry="2.42461" fill="white"/>
<ellipse cx="0.30304" cy="7.88511" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="5.75226" cy="7.88511" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="11.2066" cy="7.87476" rx="1.5152" ry="1.51538" fill="white"/>
<ellipse cx="16.662" cy="7.88291" rx="1.81824" ry="1.81846" fill="white"/>
<ellipse cx="22.1135" cy="7.88325" rx="2.12128" ry="2.12153" fill="white"/>
<ellipse cx="27.5783" cy="7.88325" rx="2.12128" ry="2.12153" fill="white"/>
<ellipse cx="0.30304" cy="13.3402" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="5.75226" cy="13.3402" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="11.2122" cy="13.3354" rx="1.21216" ry="1.2123" fill="white"/>
<ellipse cx="16.6715" cy="13.3318" rx="1.5152" ry="1.51538" fill="white"/>
<ellipse cx="22.1229" cy="13.3321" rx="1.81824" ry="1.81846" fill="white"/>
<ellipse cx="27.5721" cy="13.3321" rx="1.81824" ry="1.81846" fill="white"/>
<ellipse cx="0.30304" cy="18.7914" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="5.75452" cy="18.7937" rx="0.606081" ry="0.606152" fill="white"/>
<ellipse cx="11.2138" cy="18.794" rx="0.909121" ry="0.909228" fill="white"/>
<ellipse cx="16.6614" cy="18.7904" rx="1.21216" ry="1.2123" fill="white"/>
<ellipse cx="22.1207" cy="18.7888" rx="1.5152" ry="1.51538" fill="white"/>
<ellipse cx="27.5765" cy="18.7914" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="0.30304" cy="24.2406" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="5.75452" cy="24.2487" rx="0.606081" ry="0.606152" fill="white"/>
<ellipse cx="11.2076" cy="24.2487" rx="0.606081" ry="0.606152" fill="white"/>
<ellipse cx="16.6624" cy="24.2406" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="22.1234" cy="24.2406" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="27.5765" cy="24.2406" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="0.30304" cy="29.6976" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="5.75226" cy="29.6976" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="11.2132" cy="29.6976" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="16.6624" cy="29.6976" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="22.1234" cy="29.6976" rx="0.30304" ry="0.303076" fill="white"/>
<ellipse cx="27.5765" cy="29.6976" rx="0.30304" ry="0.303076" fill="white"/>
</svg>

# ASET — Academic Safety and Evidencing Truth

### AI-Powered Scientific Claim Verification Platform

[![Status](https://img.shields.io/badge/Status-Production-success)](https://www.aset-ai.tech)
[![Papers](https://img.shields.io/badge/Papers-1.2M+-blue)](https://www.aset-ai.tech)
[![Domains](https://img.shields.io/badge/Domains-8-purple)](https://www.aset-ai.tech)

[Live App](https://www.aset-ai.tech) · [API Spec](https://api.aset-ai.tech/openapi.json)

</div>

---

## What is ASET?

ASET stops AI hallucinations and misinformation by verifying scientific claims against 1.2M+ peer-reviewed papers across 8 domains — in real time.

**The problem:** 46% of AI-generated citations are fabricated. Students, teachers, journalists, and content creators unknowingly spread misinformation backed by fake research.

**The solution:** ASET verifies any claim — typed, uploaded, or from a YouTube video — against a pre-indexed database of peer-reviewed papers, returning a trust score and supporting evidence. When no local papers exist, ASET fetches from arXiv + PubMed in real time and permanently stores them — the database grows with every query.

---

## Features

- **Mode 1 — Single Claim**: Type any scientific claim, verified in under 200ms
- **Mode 2 — YouTube**: Paste a YouTube URL — transcript extracted, every claim verified
- **Mode 3 — Document**: Upload PDF, DOCX, or image (OCR) — all claims identified and verified
- **Multi-Agent Pipeline**: 4 specialized agents (Research → Verification → Citation → Report) coordinated via Band Protocol
- **Self-Growing DB**: Fetches from arXiv + PubMed when no local papers found, stores permanently
- **Paper Search**: Search 1.2M+ papers by title/author/keyword — no login required
- **8 Scientific Domains**: Space Science, Biology, Medicine, Chemistry, Physics, CS, Engineering + more
- **1.2M+ Papers**: Pre-indexed with FTS5 for sub-200ms search
- **Browser Extension**: Highlight any text on any webpage and verify instantly
- **Email OTP**: Password reset via Nodemailer
- **Citation Export**: APA, MLA, and IEEE formatted citations for every verification

---

## Architecture

```
React Frontend (Vite)            Node.js Backend (Express)
CloudFront CDN                   App Runner / Docker
https://aset-ai.tech             https://api.aset-ai.tech
        │                                 │
        └────────── HTTPS API ────────────┘
                                          │
                            ┌─────────────────────────┐
                            │     Agent Pipeline       │
                            │  ResearchAgent           │
                            │  VerificationAgent       │
                            │  CitationAgent           │
                            │  ReportAgent             │
                            │  (Band Protocol bus)     │
                            └─────────────────────────┘
                                          │
                               Turso (libSQL/SQLite + FTS5)
                               1.2M papers · 72 topics · 28 domains
                                          │
                               Redis — agent memory, research cache,
                               verification history, rate limiting
                                          │
                               Groq LLaMA 3.3 70B
                               Claim extraction + verification
                                          │
                               Arize Phoenix — LLM observability,
                               hallucination tracking, quality monitoring
                                          │
                               Browserbase — managed browser sessions
                               for web evidence extraction
                                          │
                               arXiv OAI-PMH + PubMed E-utilities
                               Self-growing database
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, globe.gl |
| Backend | Node.js 22, Express |
| Database | Turso (libSQL/SQLite) with FTS5 |
| Cache & Memory | Redis — research cache, agent memory, verification history |
| AI | Groq LLaMA 3.3 70B (multi-key rotation) |
| Agent Framework | Fetch.ai Agentverse (uAgents) |
| Message Bus | Band Protocol (inter-agent relay) |
| Observability | Arize Phoenix — LLM tracing, hallucination detection |
| Web Fetch | Browserbase — managed browser sessions |
| Auth | JWT + bcrypt + Email OTP |
| Document Processing | pdf-parse, mammoth, tesseract.js |
| YouTube | Multi-method transcript extraction (3 fallback strategies) |
| Extension | Chrome Manifest V3 |

---

## Multi-Agent Pipeline

ASET uses a 4-agent pipeline where each agent has a single responsibility and agents communicate via the Band Protocol message bus:

```
User Claim
    │
    ▼
ResearchAgent        — searches 1.2M+ papers (local FTS + arXiv + PubMed)
    │ Band: research.results
    ▼
VerificationAgent    — LLM stance classification per paper, verdict generation
    │ Band: verification.done
    ▼
CitationAgent        — deduplicates sources, formats APA / MLA / IEEE citations
    │ Band: citations.ready
    ▼
ReportAgent          — assembles final structured report, notifies caller
```

Trigger via:
```bash
POST /api/agents/pipeline   { "claim": "CRISPR can permanently edit the human genome" }
```

Agent status and message log:
```bash
GET /api/agents/status
```

---

## Sponsor Integrations

### Redis — Beyond Caching
Redis powers agent memory, verification history, research result caching, rate limiting, and real-time analytics.

```bash
GET  /api/redis/stats              # top domains, total verifications
GET  /api/redis/history/:userId    # fast verification history (no DB join)
POST /api/redis/logout             # JWT token blacklist
```

### Fetch.ai Agentverse
Four agents registered with the Agentverse mailbox — each accepts uAgents envelope format at its HTTP endpoint and can be discovered and messaged from other agents on the network.

```
POST /api/agents/research
POST /api/agents/verification
POST /api/agents/citation
POST /api/agents/report
```

### Band Protocol
The inter-agent message bus uses Band Protocol's relay model. In local mode it runs as an in-process EventEmitter; with `BAND_MNEMONIC` set it submits oracle data requests to the Band chain for on-chain message provenance.

### Browserbase
The browser extension's "Verify with ASET (+ web evidence)" option uses Browserbase to open a managed browser session on the current page, extract claim-relevant sentences, and include page-level evidence alongside paper citations.

```bash
POST /api/browserbase/extract    { "url": "...", "claim": "..." }
POST /api/browserbase/search     { "claim": "..." }
```

### Arize Phoenix
Every Groq LLM call is wrapped in an OpenTelemetry span sent to Arize Phoenix. Traces include hallucination risk signals (high confidence + empty evidence), confidence calibration checks, and per-paper stance classification metrics.

```bash
GET /api/arize/status
```

---

## Live URLs

- **App**: https://www.aset-ai.tech
- **API**: https://api.aset-ai.tech
- **Health**: https://api.aset-ai.tech/health
- **API Spec**: https://api.aset-ai.tech/openapi.json
- **Agent Status**: https://api.aset-ai.tech/api/agents/status

---

## Local Development

```bash
# Install dependencies
npm install

# Backend (port 3001)
node backend/server-turso.js

# Frontend (port 5173)
cd "ASET frontend"
npm install
npm run dev
```

Required environment variables — copy `.env.example` to `.env` and fill in:

```bash
# Core
TURSO_DATABASE_URL=...
GROQ_API_KEY=...

# Sponsor integrations (all optional — degrade gracefully if not set)
REDIS_URL=redis://localhost:6379
BROWSERBASE_API_KEY=...
ARIZE_API_KEY=...
BAND_MNEMONIC=...
FETCHAI_RESEARCH_MAILBOX_KEY=...
```

---

## Database Expansion

```bash
# Ingest new domains (PubMed + arXiv OAI-PMH)
node scripts/ingest-all-domains.js

# Migrate new papers to Turso
node scripts/migrate-new-domains.js

# Rebuild FTS index
node scripts/rebuild-fts.js
```

---

## Browser Extension

Load unpacked from `aset-extension/` in Chrome. Right-click any selected text to:
- **Verify with ASET** — standard verification against 1.2M+ papers
- **Verify with ASET (+ web evidence)** — standard verification plus Browserbase page evidence extraction

---

## Team

- Om Singh (jayom5797)
- Utsav Singh (utsavsingh35)
- Vikas Tiwari (vikas2731)

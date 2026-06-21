# ASET — Hackathon Demo Walkthrough

**Live app:** https://www.aset-ai.tech  
**API:** https://api.aset-ai.tech  
**Repo:** https://github.com/Cyberexe1/ASET_Berkley

---

## What ASET Does in 30 Seconds

ASET verifies scientific claims against 1.2M+ peer-reviewed papers in real time. Paste a claim, get a trust score, verdict, supporting papers, and formatted citations — all backed by a 4-agent AI pipeline.

---

## Sponsor Prize Demo Paths

### 🥇 Redis — Beyond Caching

**What we use it for (not just cache):**
- Agent memory — each agent in the pipeline saves its output to Redis so downstream agents can retrieve context
- Verification history — per-user sorted set of all past verifications (fast, no DB join)
- Research cache — 1-hour TTL cache on paper search results (avoids repeated FTS queries)
- Rate limiting — sliding window per-IP throttle on pipeline and Browserbase endpoints
- Token blacklist — JWT invalidation on logout without touching the database
- Real-time analytics — domain popularity leaderboard, total verification counter

**Demo endpoints:**
```bash
# Live Redis stats (top domains + total verifications)
curl https://api.aset-ai.tech/api/redis/stats

# Expected response:
# {
#   "topDomains": [{"domain": "neuroscience", "count": 42}, ...],
#   "totalVerifications": 156,
#   "redisConnected": true
# }
```

**Run smoke test locally:**
```bash
# Start Redis
docker run -d -p 6379:6379 redis:alpine

# Run all Redis tests
node scripts/test-redis.js
```

---

### 🥇 Fetch.ai Agentverse — Multi-Agent Workflow

**4 agents, each with a single responsibility:**

| Agent | Role | Band channel |
|-------|------|-------------|
| ResearchAgent | Search 1.2M+ papers | research.request → research.results |
| VerificationAgent | LLM stance classification | research.results → verification.done |
| CitationAgent | APA/MLA/IEEE formatting | verification.done → citations.ready |
| ReportAgent | Assemble final report | citations.ready → report.complete |

**Demo — trigger the full pipeline:**
```bash
curl -X POST https://api.aset-ai.tech/api/agents/pipeline \
  -H "Content-Type: application/json" \
  -d '{"claim": "CRISPR-Cas9 can permanently edit the human germline genome"}'

# Returns: reportId, verdict, score, keyFindings, citations (APA/MLA/IEEE), pipeline timing
```

**Check agent status + message log:**
```bash
curl https://api.aset-ai.tech/api/agents/status
```

**Frontend demo:** Open https://www.aset-ai.tech → click **🤖 Agent Pipeline** tab → enter any scientific claim → watch all 4 agents activate in sequence with real-time status updates.

---

### 🥈 Band Protocol — Inter-Agent Message Bus

**How it works:**
- All 4 agents communicate via named Band Protocol channels (`research.request`, `research.results`, `verification.done`, `citations.ready`, `report.complete`)
- Local mode: in-process EventEmitter (zero latency, no external dependency)
- On-chain mode: set `BAND_MNEMONIC` → each channel publish submits an oracle data request to the Band Laozi testnet, providing on-chain provenance for every agent message

**Demo — see the message log:**
```bash
curl https://api.aset-ai.tech/api/agents/status
# "recentMessages" field shows Band bus channel activity with timestamps
```

**Enable on-chain relay:**
```bash
# Add to .env:
BAND_MNEMONIC="your 24 word mnemonic here"
BAND_CHAIN_ID=band-laozi-testnet6
```

---

### 🥈 Browserbase — Web Evidence Extraction

**Two use cases:**

1. **Browser extension enhanced mode** — right-click "Verify with ASET (+ web evidence)" on any webpage. Browserbase opens a managed browser session on the current URL, extracts claim-relevant sentences, and adds them alongside paper citations in the floating panel.

2. **API endpoint** — extract evidence from any URL programmatically:

```bash
curl -X POST https://api.aset-ai.tech/api/browserbase/extract \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.nature.com/articles/some-article",
    "claim": "mRNA vaccines can integrate into human DNA"
  }'
```

**Browser extension setup:**
1. Go to `chrome://extensions` → Enable Developer Mode → Load unpacked → select `aset-extension/`
2. Navigate to any article or news page
3. Select any text → right-click → **Verify with ASET (+ web evidence)**

---

### 🥉 Arize — LLM Observability & Hallucination Tracking

**What we track:**
- Every Groq LLM call wrapped in an OpenTelemetry span
- Hallucination risk signal: high confidence (>70%) with empty evidence string = `risk: "high"`
- Confidence calibration check: "High" confidence verdict when supporting vs. contradicting paper counts are near-equal
- Per-paper stance classification metrics (confidence, stance, latency)
- Full verification pipeline span with verdict + score

**Check Arize config:**
```bash
curl https://api.aset-ai.tech/api/arize/status
```

**Local Phoenix (free OSS):**
```bash
pip install arize-phoenix
python -m phoenix.server.main &

# Add to .env:
ARIZE_PHOENIX_URL=http://localhost:6006

# All LLM calls will appear at http://localhost:6006
```

**Arize Cloud:**
```bash
# Add to .env:
ARIZE_API_KEY=your_key
ARIZE_SPACE_ID=your_space_id
```

---

## Full Demo Flow (5 minutes)

### Step 1 — Single claim (30s)
1. Go to https://www.aset-ai.tech
2. Type: `Do statins reduce cardiovascular mortality in healthy adults?`
3. Click Search → click Verify on any paper → see trust score + verdict

### Step 2 — Agent Pipeline (90s)
1. Click **🤖 Agent Pipeline** tab
2. Click any demo claim chip or type your own
3. Click **🚀 Run Pipeline**
4. Watch ResearchAgent → VerificationAgent → CitationAgent → ReportAgent light up
5. See the final report with APA/MLA/IEEE citations, score, key findings

### Step 3 — Document verification (60s)
1. Click **📄 Document** tab
2. Upload any PDF or paste a `.txt` file with scientific claims
3. ASET extracts all claims and verifies each one
4. Download the PDF verification report

### Step 4 — YouTube verification (60s)
1. Click **YouTube** tab
2. Paste: `https://www.youtube.com/watch?v=p_9T-1o-hL0` (or any science video)
3. ASET extracts the transcript, identifies all claims, verifies each

### Step 5 — Browser extension (60s)
1. Load `aset-extension/` as unpacked Chrome extension
2. Go to any news article (e.g. a health article on BBC or Reuters)
3. Select a sentence making a scientific claim
4. Right-click → **Verify with ASET**
5. See the floating panel appear with score, verdict, and supporting papers

---

## API Reference (Quick)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents/pipeline` | POST | Run full 4-agent pipeline |
| `/api/agents/status` | GET | Agent status + Band bus log |
| `/api/get-sources` | POST | Search papers for a claim |
| `/api/verify-claim` | POST | Verify claim against papers |
| `/api/process-document` | POST | Upload + verify document |
| `/api/process-youtube` | POST | Verify YouTube video |
| `/api/redis/stats` | GET | Redis analytics |
| `/api/arize/status` | GET | Arize tracing status |
| `/api/browserbase/extract` | POST | Web evidence extraction |
| `/health` | GET | Health check |
| `/openapi.json` | GET | Full OpenAPI 3.0 spec |

---

## Environment Variables Needed

```bash
# Required
TURSO_DATABASE_URL=...
GROQ_API_KEY=...

# Redis (redis.com free tier or local docker)
REDIS_URL=redis://...

# Browserbase (browserbase.com)
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...

# Arize (arize.com or local Phoenix)
ARIZE_API_KEY=...
ARIZE_SPACE_ID=...

# Fetch.ai Agentverse (agentverse.ai)
FETCHAI_RESEARCH_MAILBOX_KEY=...

# Band Protocol (optional — enables on-chain relay)
BAND_MNEMONIC=...
```

All integrations degrade gracefully — the app works without any of these set.

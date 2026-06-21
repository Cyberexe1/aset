/**
 * Research Agent — Fetch.ai Agentverse / uAgents
 * 
 * Responsibility: Given a claim, search the ASET paper database
 * and external sources (arXiv, PubMed), return ranked papers.
 * 
 * Part of the ASET multi-agent verification pipeline:
 *   ResearchAgent → VerificationAgent → CitationAgent → ReportAgent
 * 
 * Communicates via the Band Protocol message bus (band-bus.js)
 * and registers with the Fetch.ai Agentverse mailbox.
 */

const { getResearchCache, cacheResearchResults, saveAgentMemory, getAgentMemory } = require('../redis-client');
const bandBus = require('./band-bus');

// Fetch.ai Agentverse configuration
const AGENTVERSE_CONFIG = {
  agentName: 'aset-research-agent',
  agentAddress: process.env.FETCHAI_RESEARCH_AGENT_ADDRESS || 'agent1q_research_placeholder',
  mailboxKey: process.env.FETCHAI_RESEARCH_MAILBOX_KEY || null,
  agentverseUrl: process.env.AGENTVERSE_URL || 'https://agentverse.ai',
};

class ResearchAgent {
  constructor(db) {
    this.db = db;
    this.agentId = AGENTVERSE_CONFIG.agentName;
    this.messageHandlers = new Map();
    this._setupBandSubscriptions();
    console.log(`✅ ResearchAgent initialized [${this.agentId}]`);
  }

  _setupBandSubscriptions() {
    // Listen for research requests on the Band bus
    bandBus.subscribe('research.request', async (message) => {
      const { sessionId, claim, requestedBy, maxResults = 50 } = message;
      console.log(`[ResearchAgent] Research request for session ${sessionId}: "${claim.substring(0, 60)}"`);

      const papers = await this.research(claim, sessionId, maxResults);

      // Publish results back on Band bus for VerificationAgent to consume
      await bandBus.publish('research.results', {
        sessionId,
        claim,
        papers,
        requestedBy,
        respondedBy: this.agentId,
        timestamp: new Date().toISOString()
      });

      // Save to agent memory (Redis) for context retrieval
      await saveAgentMemory(sessionId, 'research', {
        claim,
        papersFound: papers.length,
        topPapers: papers.slice(0, 5).map(p => ({ id: p.paperId, title: p.title, relevance: p.relevance }))
      });
    });

    console.log('[ResearchAgent] Subscribed to Band bus channel: research.request');
  }

  /**
   * Main research function — searches local DB + external sources
   * Returns scored, ranked papers relevant to the claim
   */
  async research(claim, sessionId = null, maxResults = 50) {
    // 1. Check Redis research cache first
    if (sessionId) {
      const cached = await getResearchCache(claim);
      if (cached) {
        console.log(`[ResearchAgent] Cache hit for: "${claim.substring(0, 40)}"`);
        return cached;
      }
    }

    // 2. Extract keywords
    const words = claim.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const stopWords = new Set(['the','and','that','this','with','from','have','been','were','are','for','can','will','but','not','was','has','its','also']);
    const keywords = words.filter(w => !stopWords.has(w));

    if (!keywords.length) return [];

    // 3. Local FTS search
    let papers = [];
    try {
      const query = keywords.slice(0, 10).join(' OR ');
      const result = await this.db.execute({
        sql: `SELECT p.id, p.title, p.abstract, p.authors, p.year, p.topic, p.subtopic, p.source
              FROM papers_fts
              JOIN papers p ON papers_fts.rowid = p.rowid
              WHERE papers_fts MATCH ?
              ORDER BY rank LIMIT ?`,
        args: [query, maxResults]
      });
      papers = result.rows;
    } catch (err) {
      console.error('[ResearchAgent] FTS error:', err.message);
    }

    // 4. External fallback if insufficient results
    if (papers.length < 5) {
      try {
        const { fetchAndStorePapers } = require('../paper-fetcher');
        const external = await fetchAndStorePapers(claim, this.db);
        papers = [...papers, ...external.map(p => ({
          id: p.id, title: p.title, abstract: p.abstract,
          authors: p.authors, year: p.year,
          topic: 'external', subtopic: 'fetched', source: p.source
        }))];
      } catch (err) {
        console.warn('[ResearchAgent] External fetch failed:', err.message);
      }
    }

    // 5. Score papers by relevance
    const scored = papers.map((paper, index) => {
      const titleLower = (paper.title || '').toLowerCase();
      const abstractLower = (paper.abstract || '').toLowerCase();
      const titleScore = keywords.filter(kw => titleLower.includes(kw)).length * 2;
      const abstractScore = keywords.filter(kw => abstractLower.includes(kw)).length * 0.5;
      const rankScore = Math.max(0, 5 - index * 0.05);
      const relevance = Math.min(10, Math.max(1, Math.round((titleScore + abstractScore + rankScore) * 10) / 10));

      let authors = '';
      try {
        const parsed = JSON.parse(paper.authors || '[]');
        authors = Array.isArray(parsed) ? parsed.join(', ') : String(parsed);
      } catch { authors = paper.authors || 'Unknown'; }

      return {
        paperId: paper.id,
        title: paper.title,
        abstract: paper.abstract,
        authors,
        year: paper.year,
        topic: paper.topic,
        subtopic: paper.subtopic,
        source: paper.source || 'arxiv',
        relevance,
        url: paper.source === 'nasa-ads'
          ? `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(paper.id)}/abstract`
          : `https://arxiv.org/abs/${paper.id}`
      };
    });

    scored.sort((a, b) => b.relevance - a.relevance);

    // 6. Cache in Redis
    await cacheResearchResults(claim, scored);

    console.log(`[ResearchAgent] Found ${scored.length} papers for: "${claim.substring(0, 40)}"`);
    return scored;
  }

  /**
   * Fetch.ai Agentverse registration — registers agent with the mailbox
   * so it can receive messages from other agents on the network
   */
  async registerWithAgentverse() {
    if (!AGENTVERSE_CONFIG.mailboxKey) {
      console.warn('[ResearchAgent] No FETCHAI_RESEARCH_MAILBOX_KEY — skipping Agentverse registration');
      return false;
    }

    try {
      const response = await fetch(`${AGENTVERSE_CONFIG.agentverseUrl}/v1/almanac/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AGENTVERSE_CONFIG.mailboxKey}`
        },
        body: JSON.stringify({
          name: AGENTVERSE_CONFIG.agentName,
          description: 'ASET Research Agent — searches 1.2M+ peer-reviewed papers for scientific claim verification',
          endpoints: [`${process.env.API_BASE_URL || 'https://api.aset-ai.tech'}/api/agents/research`],
          protocols: ['claim-research-v1'],
          metadata: {
            project: 'ASET',
            version: '2.0.0',
            capabilities: ['paper-search', 'arxiv-fetch', 'pubmed-fetch', 'relevance-scoring']
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ResearchAgent registered with Agentverse: ${data.address || AGENTVERSE_CONFIG.agentAddress}`);
        return true;
      }
    } catch (err) {
      console.warn('[ResearchAgent] Agentverse registration failed:', err.message);
    }
    return false;
  }

  /**
   * Handle inbound messages from Agentverse (HTTP endpoint handler)
   * Called by POST /api/agents/research
   */
  async handleAgentverseMessage(envelope) {
    const { sender, payload } = envelope;
    console.log(`[ResearchAgent] Agentverse message from ${sender}`);

    try {
      const { claim, session_id, max_results = 50 } = payload;
      const papers = await this.research(claim, session_id, max_results);
      return { success: true, papers, agent: this.agentId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = ResearchAgent;

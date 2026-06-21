/**
 * Agent Pipeline Orchestrator
 * 
 * Wires together all 4 Fetch.ai agents into a multi-agent pipeline:
 * 
 *   ResearchAgent → VerificationAgent → CitationAgent → ReportAgent
 * 
 * The pipeline is triggered by calling runPipeline(claim, userId).
 * Agents communicate via Band Protocol bus channels.
 * Redis is used for agent memory, caching, and history.
 * Arize traces all LLM calls for quality monitoring.
 * 
 * Can also be triggered directly via HTTP:
 *   POST /api/agents/pipeline   { claim, userId }
 */

const ResearchAgent    = require('./research-agent');
const VerificationAgent = require('./verification-agent');
const CitationAgent    = require('./citation-agent');
const ReportAgent      = require('./report-agent');
const bandBus          = require('./band-bus');
const { saveRetrievalContext } = require('../redis-client');

class AgentPipeline {
  constructor(db, groqConfig = {}) {
    this.db = db;
    this.researchAgent     = new ResearchAgent(db);
    this.verificationAgent = new VerificationAgent(groqConfig);
    this.citationAgent     = new CitationAgent();
    this.reportAgent       = new ReportAgent();

    console.log('✅ ASET Agent Pipeline initialized');
    console.log('   Agents: ResearchAgent → VerificationAgent → CitationAgent → ReportAgent');
    console.log('   Bus: Band Protocol (local EventEmitter + optional on-chain relay)');
  }

  /**
   * Run the full 4-agent pipeline for a claim
   * Returns the assembled report from ReportAgent
   */
  async runPipeline(claim, options = {}) {
    const {
      userId = null,
      maxPapers = 50,
      sessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    } = options;

    const startTime = Date.now();
    console.log(`\n[Pipeline] 🚀 Starting pipeline | session: ${sessionId}`);
    console.log(`[Pipeline] Claim: "${claim.substring(0, 80)}"`);

    // Save retrieval context to Redis for agents to use
    await saveRetrievalContext(sessionId, {
      claim,
      userId,
      startedAt: new Date().toISOString(),
      domainHints: this._extractDomainHints(claim)
    });

    // Start waiting for the final report BEFORE publishing (avoid race condition)
    const reportPromise = this.reportAgent.waitForReport(sessionId);

    // Kick off pipeline by publishing claim.extracted
    // This triggers: ResearchAgent → research.request channel
    await bandBus.publish('research.request', {
      sessionId,
      claim,
      requestedBy: 'pipeline-orchestrator',
      maxResults: maxPapers,
      userId
    });

    // Wait for the full pipeline to complete
    const report = await reportPromise;
    report.totalPipelineMs = Date.now() - startTime;

    console.log(`[Pipeline] ✅ Complete in ${report.totalPipelineMs}ms | ${report.verdict} (${report.verificationScore}%)\n`);
    return report;
  }

  /**
   * Run only the research + verification stages (skip citation/report formatting)
   * Faster — used for the browser extension and simple claim verification
   */
  async runVerificationOnly(claim, options = {}) {
    const { userId = null, maxPapers = 10, sessionId } = options;
    const sid = sessionId || `v-${Date.now()}`;

    // Step 1: Research
    const papers = await this.researchAgent.research(claim, sid, maxPapers);
    if (!papers.length) {
      return {
        claim,
        verdict: 'Unverifiable',
        verificationScore: 0,
        confidence: 'Low',
        summary: 'No relevant papers found for this claim.',
        keyFindings: [],
        analyses: [],
        papersAnalyzed: 0,
        sessionId: sid
      };
    }

    // Step 2: Verify
    const result = await this.verificationAgent.verify(claim, papers, sid, userId);
    return { ...result, sessionId: sid };
  }

  /**
   * Extract domain hints from claim for context seeding
   */
  _extractDomainHints(claim) {
    const text = claim.toLowerCase();
    const domains = [];
    const hints = {
      medicine: /\b(drug|cancer|clinical|patient|therapy|disease|treatment)\b/i,
      physics: /\b(quantum|particle|wave|photon|gravitational|nuclear)\b/i,
      biology: /\b(gene|protein|cell|dna|rna|crispr|genome|enzyme)\b/i,
      ai: /\b(machine learning|neural|deep learning|transformer|llm|gpt)\b/i,
      astronomy: /\b(black hole|galaxy|star|planet|dark matter|universe)\b/i,
      chemistry: /\b(molecule|compound|reaction|catalyst|polymer|nanomaterial)\b/i,
    };
    for (const [domain, pattern] of Object.entries(hints)) {
      if (pattern.test(text)) domains.push(domain);
    }
    return domains;
  }

  /**
   * Get the current pipeline message log (for admin dashboard)
   */
  getPipelineLog(limit = 50) {
    return bandBus.getMessageLog(limit);
  }

  /**
   * Get pipeline status for a specific session
   */
  getSessionStatus(sessionId) {
    return bandBus.getPipelineStatus(sessionId);
  }
}

module.exports = AgentPipeline;

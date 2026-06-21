/**
 * Report Agent — Fetch.ai Agentverse
 * 
 * Responsibility: Final stage in the ASET agent pipeline.
 * Receives verification results + citations, generates a structured
 * JSON report, and notifies the caller (HTTP response or WebSocket).
 * 
 * This is the "output" agent — it collects outputs from all other
 * agents and assembles the final deliverable.
 */

const bandBus = require('./band-bus');
const { saveAgentMemory, getAgentMemory, getRetrievalContext } = require('../redis-client');

const AGENTVERSE_CONFIG = {
  agentName: 'aset-report-agent',
  agentAddress: process.env.FETCHAI_REPORT_AGENT_ADDRESS || 'agent1q_report_placeholder',
  mailboxKey: process.env.FETCHAI_REPORT_MAILBOX_KEY || null,
};

class ReportAgent {
  constructor() {
    this.agentId = AGENTVERSE_CONFIG.agentName;
    this.pendingReports = new Map(); // sessionId → Promise resolver
    this._setupBandSubscriptions();
    console.log(`✅ ReportAgent initialized [${this.agentId}]`);
  }

  _setupBandSubscriptions() {
    bandBus.subscribe('citations.ready', async (message) => {
      const { sessionId, claim, verificationResult, citations, requestedBy } = message;
      console.log(`[ReportAgent] Assembling report for session ${sessionId}`);

      const report = await this.assembleReport(sessionId, claim, verificationResult, citations);

      await bandBus.publish('report.complete', {
        sessionId,
        report,
        requestedBy,
        respondedBy: this.agentId,
        timestamp: new Date().toISOString()
      });

      // Resolve pending HTTP request if waiting
      if (this.pendingReports.has(sessionId)) {
        const resolve = this.pendingReports.get(sessionId);
        this.pendingReports.delete(sessionId);
        resolve(report);
      }
    });

    console.log('[ReportAgent] Subscribed to Band bus channel: citations.ready');
  }

  /**
   * Assemble the final structured verification report
   */
  async assembleReport(sessionId, claim, verificationResult, citations) {
    // Gather memory from all agents
    const [researchMemory, verificationMemory, citationMemory] = await Promise.all([
      getAgentMemory(sessionId, 'research'),
      getAgentMemory(sessionId, 'verification'),
      getAgentMemory(sessionId, 'citations')
    ]);

    const context = await getRetrievalContext(sessionId);

    // Score breakdown
    const score = verificationResult.verificationScore || 0;
    const trustLevel = score >= 80 ? 'High'
      : score >= 60 ? 'Moderate'
      : score >= 40 ? 'Low'
      : 'Very Low';

    const report = {
      // Metadata
      reportId: `ASET-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      sessionId,
      generatedAt: new Date().toISOString(),
      generatedBy: [
        'aset-research-agent',
        'aset-verification-agent',
        'aset-citation-agent',
        'aset-report-agent'
      ],

      // Core result
      claim,
      verdict: verificationResult.verdict,
      verificationScore: score,
      trustLevel,
      confidence: verificationResult.confidence,
      summary: verificationResult.summary,
      keyFindings: verificationResult.keyFindings || [],
      limitations: verificationResult.limitations,

      // Paper analysis detail
      papersResearched: researchMemory?.papersFound || 0,
      papersAnalyzed: verificationResult.papersAnalyzed || 0,
      analyses: (verificationResult.analyses || []).map(a => ({
        paperId: a.paperId,
        title: a.paperTitle,
        year: a.paperYear,
        stance: a.stance,
        confidence: a.confidence,
        evidence: a.evidence,
        reasoning: a.reasoning
      })),

      // Citations
      citations: {
        count: citations.count || 0,
        apa: citations.apa || [],
        mla: citations.mla || [],
        ieee: citations.ieee || [],
        papers: citations.papers || []
      },

      // Pipeline timing
      pipeline: {
        research: researchMemory ? { papersFound: researchMemory.papersFound } : null,
        verification: verificationMemory ? {
          processingTimeMs: verificationMemory.processingTimeMs
        } : null,
        citations: citationMemory ? { count: citationMemory.count } : null
      },

      // Arize quality metrics (populated by arize-tracer if available)
      qualityMetrics: verificationResult.arizeMetrics || null,

      // Context used (from Redis retrieval context)
      contextUsed: context ? context.domainHints : null
    };

    // Save final report to agent memory
    await saveAgentMemory(sessionId, 'report', {
      reportId: report.reportId,
      verdict: report.verdict,
      score: report.verificationScore,
      citationCount: report.citations.count
    });

    console.log(`[ReportAgent] Report assembled: ${report.reportId} | ${report.verdict} (${report.verificationScore}%)`);
    return report;
  }

  /**
   * Wait for a report to be completed for a given session
   * Returns a promise that resolves when the ReportAgent fires 'report.complete'
   */
  waitForReport(sessionId, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingReports.delete(sessionId);
        reject(new Error(`Report timeout after ${timeoutMs}ms for session ${sessionId}`));
      }, timeoutMs);

      this.pendingReports.set(sessionId, (report) => {
        clearTimeout(timer);
        resolve(report);
      });
    });
  }

  /**
   * Handle inbound Agentverse messages
   */
  async handleAgentverseMessage(envelope) {
    const { payload } = envelope;
    const { session_id, claim, verification_result, citations } = payload;
    const report = await this.assembleReport(session_id, claim, verification_result, citations);
    return { success: true, report, agent: this.agentId };
  }
}

module.exports = ReportAgent;

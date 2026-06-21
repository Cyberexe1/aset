/**
 * Verification Agent — Fetch.ai Agentverse
 * 
 * Responsibility: Receives claim + papers from ResearchAgent,
 * runs the AI-powered verification pipeline (ClaimVerifier),
 * and publishes results to CitationAgent.
 * 
 * Also logs all LLM calls to Arize Phoenix for hallucination
 * tracking and verification quality monitoring.
 */

const ClaimVerifier = require('../claim-verifier');
const bandBus = require('./band-bus');
const arizeTracer = require('../arize-tracer');
const {
  saveVerificationHistory,
  saveAgentMemory,
  getAgentMemory,
  incrementDomainStat,
  incrementClaimStat
} = require('../redis-client');

const AGENTVERSE_CONFIG = {
  agentName: 'aset-verification-agent',
  agentAddress: process.env.FETCHAI_VERIFICATION_AGENT_ADDRESS || 'agent1q_verification_placeholder',
  mailboxKey: process.env.FETCHAI_VERIFICATION_MAILBOX_KEY || null,
};

class VerificationAgent {
  constructor(groqConfig = {}) {
    this.agentId = AGENTVERSE_CONFIG.agentName;
    this.verifier = new ClaimVerifier(groqConfig);
    this._setupBandSubscriptions();
    console.log(`✅ VerificationAgent initialized [${this.agentId}]`);
  }

  _setupBandSubscriptions() {
    // Receive paper research results from ResearchAgent
    bandBus.subscribe('research.results', async (message) => {
      const { sessionId, claim, papers, requestedBy } = message;
      if (!papers || !papers.length) {
        await bandBus.publish('verification.done', {
          sessionId,
          claim,
          verdict: 'Unverifiable',
          verificationScore: 0,
          confidence: 'Low',
          summary: 'No papers found for this claim',
          analyses: [],
          requestedBy,
          respondedBy: this.agentId,
          timestamp: new Date().toISOString()
        });
        return;
      }

      console.log(`[VerificationAgent] Verifying "${claim.substring(0, 60)}" against ${papers.length} papers`);
      const result = await this.verify(claim, papers, sessionId);

      await bandBus.publish('verification.done', {
        sessionId,
        ...result,
        requestedBy,
        respondedBy: this.agentId,
        timestamp: new Date().toISOString()
      });
    });

    console.log('[VerificationAgent] Subscribed to Band bus channel: research.results');
  }

  /**
   * Core verification — runs ClaimVerifier with Arize tracing
   */
  async verify(claim, papers, sessionId = null, userId = null) {
    const startTime = Date.now();
    let result;

    try {
      // Restore prior context from Redis if available
      const priorMemory = sessionId ? await getAgentMemory(sessionId, 'verification') : null;

      // Run verification with Arize tracing
      result = await arizeTracer.traceVerification(claim, papers, async () => {
        return this.verifier.verifyClaim(claim, papers, {
          maxPapers: 10,
          batchSize: 10,
        });
      });

      // Save verification to Redis history
      if (userId) {
        const verificationId = `v-${sessionId || Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        await saveVerificationHistory(userId, verificationId, {
          ...result,
          claim,
          sessionId
        });
      }

      // Update Redis stats
      await incrementClaimStat(result.verdict);
      const topic = papers[0]?.topic;
      if (topic) await incrementDomainStat(topic);

      // Save agent memory
      if (sessionId) {
        await saveAgentMemory(sessionId, 'verification', {
          claim,
          verdict: result.verdict,
          score: result.verificationScore,
          papersAnalyzed: result.papersAnalyzed,
          processingTimeMs: Date.now() - startTime
        });
      }

      console.log(`[VerificationAgent] Done: ${result.verdict} (${result.verificationScore}%) in ${Date.now() - startTime}ms`);
      return result;

    } catch (err) {
      console.error('[VerificationAgent] Error:', err.message);
      result = {
        claim,
        verificationScore: 0,
        verdict: 'Error',
        confidence: 'Low',
        summary: `Verification failed: ${err.message}`,
        keyFindings: [],
        analyses: [],
        papersAnalyzed: 0,
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      return result;
    }
  }

  /**
   * Handle inbound Agentverse messages (HTTP endpoint handler)
   * Called by POST /api/agents/verification
   */
  async handleAgentverseMessage(envelope) {
    const { sender, payload } = envelope;
    const { claim, papers, session_id, user_id } = payload;
    const result = await this.verify(claim, papers, session_id, user_id);
    return { success: true, result, agent: this.agentId };
  }
}

module.exports = VerificationAgent;

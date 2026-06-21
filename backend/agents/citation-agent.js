/**
 * Citation Agent — Fetch.ai Agentverse
 * 
 * Responsibility: Receives verification results, enriches citations
 * with DOI links, formats citations in APA/MLA/IEEE style,
 * deduplicates sources, and prepares the citation list for the report.
 */

const bandBus = require('./band-bus');
const { saveAgentMemory } = require('../redis-client');

const AGENTVERSE_CONFIG = {
  agentName: 'aset-citation-agent',
  agentAddress: process.env.FETCHAI_CITATION_AGENT_ADDRESS || 'agent1q_citation_placeholder',
  mailboxKey: process.env.FETCHAI_CITATION_MAILBOX_KEY || null,
};

const CITATION_STYLES = ['apa', 'mla', 'ieee'];

class CitationAgent {
  constructor() {
    this.agentId = AGENTVERSE_CONFIG.agentName;
    this._setupBandSubscriptions();
    console.log(`✅ CitationAgent initialized [${this.agentId}]`);
  }

  _setupBandSubscriptions() {
    bandBus.subscribe('verification.done', async (message) => {
      const { sessionId, claim, analyses, requestedBy } = message;
      console.log(`[CitationAgent] Building citations for session ${sessionId}`);

      const citations = await this.buildCitations(analyses || [], sessionId);

      await bandBus.publish('citations.ready', {
        sessionId,
        claim,
        verificationResult: message,
        citations,
        requestedBy,
        respondedBy: this.agentId,
        timestamp: new Date().toISOString()
      });
    });

    console.log('[CitationAgent] Subscribed to Band bus channel: verification.done');
  }

  /**
   * Build formatted citations from paper analyses
   */
  async buildCitations(analyses, sessionId = null) {
    if (!analyses || !analyses.length) return { apa: [], mla: [], ieee: [], count: 0 };

    // Deduplicate by paperId
    const seen = new Set();
    const unique = analyses.filter(a => {
      if (seen.has(a.paperId)) return false;
      seen.add(a.paperId);
      return true;
    });

    const citations = {
      apa: [],
      mla: [],
      ieee: [],
      count: unique.length,
      papers: unique.map(a => ({
        id: a.paperId,
        title: a.paperTitle,
        year: a.paperYear,
        stance: a.stance,
        confidence: a.confidence,
        evidence: a.evidence
      }))
    };

    // Format each citation in all 3 styles
    for (const analysis of unique) {
      const paper = {
        id: analysis.paperId || '',
        title: analysis.paperTitle || 'Untitled',
        year: analysis.paperYear || 'n.d.',
        authors: analysis.authors || 'Unknown Author',
        source: analysis.source || 'arxiv'
      };

      const url = paper.source === 'nasa-ads'
        ? `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(paper.id)}/abstract`
        : `https://arxiv.org/abs/${paper.id}`;

      citations.apa.push(this._formatAPA(paper, url));
      citations.mla.push(this._formatMLA(paper, url));
      citations.ieee.push(this._formatIEEE(paper, url, citations.ieee.length + 1));
    }

    // Save to agent memory
    if (sessionId) {
      await saveAgentMemory(sessionId, 'citations', {
        count: unique.length,
        styles: CITATION_STYLES,
        deduplicatedFrom: analyses.length
      });
    }

    console.log(`[CitationAgent] Built ${unique.length} citations (deduplicated from ${analyses.length})`);
    return citations;
  }

  /**
   * APA 7th edition format
   * Author, A. A., & Author, B. B. (Year). Title of article. Source URL
   */
  _formatAPA(paper, url) {
    const authorStr = this._formatAuthors(paper.authors, 'apa');
    return `${authorStr} (${paper.year}). ${paper.title}. Retrieved from ${url}`;
  }

  /**
   * MLA 9th edition format
   * Author, Last Name, First Name. "Title." Source, Year, URL.
   */
  _formatMLA(paper, url) {
    const authorStr = this._formatAuthors(paper.authors, 'mla');
    return `${authorStr}. "${paper.title}." arXiv/PubMed, ${paper.year}, ${url}.`;
  }

  /**
   * IEEE format
   * [N] A. Author, "Title," Source, Year. [Online]. Available: URL
   */
  _formatIEEE(paper, url, num) {
    const authorStr = this._formatAuthors(paper.authors, 'ieee');
    return `[${num}] ${authorStr}, "${paper.title}," ${paper.year}. [Online]. Available: ${url}`;
  }

  _formatAuthors(authorsRaw, style) {
    // Handle both string and array input
    const authorList = Array.isArray(authorsRaw)
      ? authorsRaw
      : String(authorsRaw || '').split(/,\s*/).filter(Boolean);

    if (!authorList.length) return 'Unknown';

    if (style === 'apa') {
      const formatted = authorList.slice(0, 5).map(name => {
        const parts = name.trim().split(' ');
        if (parts.length < 2) return name;
        const last = parts[parts.length - 1];
        const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
        return `${last}, ${initials}`;
      });
      if (authorList.length > 5) formatted.push('et al.');
      return formatted.join(', ');
    }

    if (style === 'mla') {
      if (authorList.length === 1) {
        const parts = authorList[0].trim().split(' ');
        if (parts.length < 2) return authorList[0];
        return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`;
      }
      const first = authorList[0].trim().split(' ');
      const firstFormatted = first.length < 2
        ? authorList[0]
        : `${first[first.length - 1]}, ${first.slice(0, -1).join(' ')}`;
      if (authorList.length === 2) return `${firstFormatted}, and ${authorList[1].trim()}`;
      return `${firstFormatted}, et al.`;
    }

    if (style === 'ieee') {
      return authorList.slice(0, 3).map(name => {
        const parts = name.trim().split(' ');
        if (parts.length < 2) return name;
        const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ');
        return `${initials} ${parts[parts.length - 1]}`;
      }).join(', ') + (authorList.length > 3 ? ' et al.' : '');
    }

    return authorList[0];
  }

  /**
   * Handle inbound Agentverse messages
   */
  async handleAgentverseMessage(envelope) {
    const { payload } = envelope;
    const { analyses, session_id } = payload;
    const citations = await this.buildCitations(analyses, session_id);
    return { success: true, citations, agent: this.agentId };
  }
}

module.exports = CitationAgent;

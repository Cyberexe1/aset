/**
 * Browserbase Integration
 * 
 * Uses Browserbase's managed browser sessions to:
 * 1. Fetch full rendered pages from arXiv, PubMed, and other sources
 *    (bypassing bot protection that blocks raw HTTPS requests)
 * 2. Extract claim-relevant content from news articles and web pages
 * 3. Power the browser extension's enhanced evidence gathering
 * 
 * Falls back to direct HTTPS requests if Browserbase is not configured.
 */

const https = require('https');

const BROWSERBASE_CONFIG = {
  apiKey:    process.env.BROWSERBASE_API_KEY || null,
  projectId: process.env.BROWSERBASE_PROJECT_ID || null,
  baseUrl:   'https://api.browserbase.com',
};

/**
 * Create a Browserbase session for a single-use browser task
 */
async function createSession() {
  if (!BROWSERBASE_CONFIG.apiKey) return null;

  try {
    const response = await fetch(`${BROWSERBASE_CONFIG.baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_CONFIG.apiKey
      },
      body: JSON.stringify({
        projectId: BROWSERBASE_CONFIG.projectId,
        browserSettings: {
          viewport: { width: 1280, height: 800 },
          stealth: true // avoid bot detection
        }
      })
    });

    if (!response.ok) {
      console.warn('[Browserbase] Session creation failed:', response.status);
      return null;
    }

    const session = await response.json();
    console.log(`[Browserbase] Session created: ${session.id}`);
    return session;
  } catch (err) {
    console.warn('[Browserbase] Could not create session:', err.message);
    return null;
  }
}

/**
 * Use Browserbase to fetch a URL and extract text content
 * Falls back to direct HTTPS if Browserbase is unavailable
 */
async function fetchPageContent(url, options = {}) {
  const { selector = 'body', waitForSelector = null } = options;

  // Try Browserbase first
  if (BROWSERBASE_CONFIG.apiKey) {
    try {
      const content = await fetchWithBrowserbase(url, { selector, waitForSelector });
      if (content) return { content, source: 'browserbase', url };
    } catch (err) {
      console.warn(`[Browserbase] Failed for ${url}:`, err.message, '— falling back to direct fetch');
    }
  }

  // Fallback to direct fetch
  const content = await fetchDirect(url);
  return { content, source: 'direct', url };
}

/**
 * Browserbase CDP-based page fetch
 */
async function fetchWithBrowserbase(url, options = {}) {
  const session = await createSession();
  if (!session) return null;

  try {
    // Use Browserbase's navigate + extract API
    const response = await fetch(`${BROWSERBASE_CONFIG.baseUrl}/v1/sessions/${session.id}/navigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_CONFIG.apiKey
      },
      body: JSON.stringify({
        url,
        waitUntil: 'networkidle',
        timeout: 30000,
        extract: {
          selector: options.selector || 'article, .abstract, #abstract, .content, main, body',
          type: 'text'
        }
      })
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.extracted || data.content || data.text;
  } finally {
    // Always close the session to avoid burning through quota
    await closeSession(session.id);
  }
}

/**
 * Close a Browserbase session
 */
async function closeSession(sessionId) {
  if (!BROWSERBASE_CONFIG.apiKey || !sessionId) return;
  try {
    await fetch(`${BROWSERBASE_CONFIG.baseUrl}/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'X-BB-API-Key': BROWSERBASE_CONFIG.apiKey }
    });
  } catch (err) { /* non-critical */ }
}

/**
 * Direct HTTPS fetch fallback
 */
function fetchDirect(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.get(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'ASET/2.0 (mailto:aset@research.org)',
          'Accept': 'text/html,application/xhtml+xml,text/plain'
        }
      },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('TIMEOUT')); });
  });
}

// ─── Enhanced arXiv fetcher using Browserbase ────────────────────────────────
/**
 * Fetch arXiv paper details with full rendered page
 * Gets abstract + metadata even for papers that block raw API calls
 */
async function fetchArxivPaper(arxivId) {
  const url = `https://arxiv.org/abs/${arxivId}`;
  
  try {
    const { content } = await fetchPageContent(url, {
      selector: '#abs, .abstract, h1.title, .authors',
      waitForSelector: '#abs'
    });

    if (!content) return null;

    // Parse the fetched content (HTML or text)
    const titleMatch = content.match(/Title:\s*([^\n]+)/i) || content.match(/<h1[^>]*class="title[^"]*"[^>]*>.*?<span[^>]*>(.*?)<\/span>/is);
    const abstractMatch = content.match(/Abstract:\s*([\s\S]{50,1500}?)(?:\n\n|\n[A-Z])/i) || content.match(/class="abstract[^"]*"[^>]*>([\s\S]{50,2000}?)<\/blockquote>/i);

    return {
      id: arxivId,
      title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : arxivId,
      abstract: abstractMatch ? abstractMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '',
      url,
      source: 'arxiv-browserbase'
    };
  } catch (err) {
    console.warn(`[Browserbase] arXiv fetch failed for ${arxivId}:`, err.message);
    return null;
  }
}

// ─── Web Evidence Extractor (for browser extension) ─────────────────────────
/**
 * Extract claim-relevant evidence from any webpage URL
 * Powers the browser extension's enhanced verification
 */
async function extractWebEvidence(pageUrl, claim) {
  if (!BROWSERBASE_CONFIG.apiKey) {
    return { evidence: null, source: 'unavailable', reason: 'Browserbase not configured' };
  }

  const session = await createSession();
  if (!session) return { evidence: null, source: 'unavailable' };

  try {
    // Navigate to the page
    const navResponse = await fetch(`${BROWSERBASE_CONFIG.baseUrl}/v1/sessions/${session.id}/navigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_CONFIG.apiKey
      },
      body: JSON.stringify({
        url: pageUrl,
        waitUntil: 'networkidle',
        timeout: 20000
      })
    });

    if (!navResponse.ok) return { evidence: null, source: 'error' };

    // Extract all text content
    const extractResponse = await fetch(`${BROWSERBASE_CONFIG.baseUrl}/v1/sessions/${session.id}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_CONFIG.apiKey
      },
      body: JSON.stringify({
        selector: 'article, main, .content, .article-body, p',
        type: 'text',
        limit: 3000 // characters
      })
    });

    const extracted = await extractResponse.json();
    const pageText = extracted.text || extracted.content || '';

    // Find claim-relevant sentences
    const keywords = claim.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const sentences = pageText.split(/[.!?]+/).filter(s => s.length > 20);
    const relevant = sentences.filter(s => {
      const sl = s.toLowerCase();
      return keywords.filter(kw => sl.includes(kw)).length >= 2;
    });

    return {
      evidence: relevant.slice(0, 5).join(' '),
      pageUrl,
      source: 'browserbase',
      sentencesFound: relevant.length,
      totalSentences: sentences.length
    };
  } catch (err) {
    console.warn('[Browserbase] extractWebEvidence error:', err.message);
    return { evidence: null, source: 'error', error: err.message };
  } finally {
    await closeSession(session.id);
  }
}

// ─── Search the web for evidence using Browserbase ──────────────────────────
/**
 * Use Browserbase to search Google/Bing for papers related to a claim
 * (complements the local DB search)
 */
async function searchWebForEvidence(claim, maxResults = 5) {
  if (!BROWSERBASE_CONFIG.apiKey) return [];

  const session = await createSession();
  if (!session) return [];

  try {
    const searchQuery = encodeURIComponent(`site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov "${claim.substring(0, 100)}"`);
    const searchUrl = `https://www.google.com/search?q=${searchQuery}&num=${maxResults}`;

    const navResponse = await fetch(`${BROWSERBASE_CONFIG.baseUrl}/v1/sessions/${session.id}/navigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_CONFIG.apiKey
      },
      body: JSON.stringify({
        url: searchUrl,
        waitUntil: 'networkidle',
        timeout: 15000
      })
    });

    if (!navResponse.ok) return [];

    // Extract search result links
    const extractResponse = await fetch(`${BROWSERBASE_CONFIG.baseUrl}/v1/sessions/${session.id}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BB-API-Key': BROWSERBASE_CONFIG.apiKey
      },
      body: JSON.stringify({
        selector: 'a[href*="arxiv.org/abs"], a[href*="pubmed.ncbi.nlm.nih.gov"]',
        type: 'links'
      })
    });

    const extracted = await extractResponse.json();
    const links = (extracted.links || []).slice(0, maxResults);
    console.log(`[Browserbase] Found ${links.length} relevant paper links for: "${claim.substring(0, 40)}"`);
    return links;

  } catch (err) {
    console.warn('[Browserbase] searchWebForEvidence error:', err.message);
    return [];
  } finally {
    await closeSession(session.id);
  }
}

module.exports = {
  fetchPageContent,
  fetchArxivPaper,
  extractWebEvidence,
  searchWebForEvidence,
  get isEnabled() { return !!BROWSERBASE_CONFIG.apiKey; }
};

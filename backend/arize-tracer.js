/**
 * Arize Phoenix — LLM Observability & Hallucination Tracking
 * 
 * Wraps all Groq LLM calls with OpenTelemetry traces sent to Arize Phoenix.
 * Tracks:
 * - Input/output tokens, latency, model version
 * - Verification quality: score, verdict, confidence per claim
 * - Hallucination risk signals: confidence vs. evidence mismatch
 * - Retrieval quality: relevance scores of papers used
 * - Agent-level spans (one span per agent in the pipeline)
 * 
 * Works in degraded mode if Arize is not configured (traces are no-ops).
 */

const ARIZE_CONFIG = {
  // Arize Phoenix OSS (local)
  phoenixUrl: process.env.ARIZE_PHOENIX_URL || 'http://localhost:6006',
  // Arize Cloud
  spaceId:    process.env.ARIZE_SPACE_ID   || null,
  apiKey:     process.env.ARIZE_API_KEY    || null,
  modelId:    process.env.ARIZE_MODEL_ID   || 'aset-verification',
  modelVersion: process.env.ARIZE_MODEL_VERSION || '2.0.0',
  // Collector endpoint (OTLP)
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null,
};

let tracer = null;
let otelEnabled = false;

async function initTracer() {
  try {
    // Try to load OpenTelemetry SDK (graceful degradation if not installed)
    const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node').catch(() => null) || {};
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http').catch(() => null) || {};
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base').catch(() => null) || {};
    const { SemanticConventions } = await import('@arizeai/openinference-semantic-conventions').catch(() => null) || {};

    if (!NodeTracerProvider || !OTLPTraceExporter) {
      console.warn('[Arize] OpenTelemetry SDK not installed — traces will be HTTP-only');
      console.warn('   Install: npm install @opentelemetry/sdk-trace-node @opentelemetry/exporter-trace-otlp-http');
      return false;
    }

    const exporterUrl = ARIZE_CONFIG.otlpEndpoint
      || (ARIZE_CONFIG.spaceId ? `https://otlp.arize.com/v1` : `${ARIZE_CONFIG.phoenixUrl}/v1/traces`);

    const exporter = new OTLPTraceExporter({
      url: exporterUrl,
      headers: ARIZE_CONFIG.apiKey ? {
        'Authorization': `Bearer ${ARIZE_CONFIG.apiKey}`,
        'space_id': ARIZE_CONFIG.spaceId,
        'model_id': ARIZE_CONFIG.modelId,
      } : {}
    });

    const provider = new NodeTracerProvider();
    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    provider.register();

    tracer = provider.getTracer('aset-verification', ARIZE_CONFIG.modelVersion);
    otelEnabled = true;
    console.log(`✅ Arize Phoenix tracing enabled → ${exporterUrl}`);
    return true;
  } catch (err) {
    console.warn('[Arize] Could not initialize OTel tracer:', err.message);
    return false;
  }
}

// Initialize on load (non-blocking)
initTracer().catch(() => {});

// ─── HTTP Logging (fallback when OTel is not available) ─────────────────────
async function logToArize(data) {
  if (!ARIZE_CONFIG.apiKey || !ARIZE_CONFIG.spaceId) return;

  try {
    await fetch(`https://api.arize.com/v1/log`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ARIZE_CONFIG.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_id: ARIZE_CONFIG.modelId,
        model_version: ARIZE_CONFIG.modelVersion,
        space_id: ARIZE_CONFIG.spaceId,
        ...data
      })
    });
  } catch (err) {
    // Non-critical — never fail the main request
  }
}

// ─── Paper Analysis Tracing ──────────────────────────────────────────────────
/**
 * Trace a single paper analysis LLM call
 * Detects hallucination risk when confidence > 70 but evidence is empty
 */
async function tracePaperAnalysis(paper, claim, analysisResult, latencyMs) {
  const hallucinationRisk = detectHallucinationRisk(analysisResult);

  const traceData = {
    prediction_id: `paper-${paper.paperId || paper.id}-${Date.now()}`,
    prediction_label: analysisResult.stance,
    prediction_score: (analysisResult.confidence || 0) / 100,
    actual_label: null, // ground truth unknown
    features: {
      claim_length: claim.length,
      abstract_length: (paper.abstract || '').length,
      paper_year: paper.year || 0,
      paper_source: paper.source || 'arxiv',
      relevance_score: paper.relevance || paper.relevanceScore || 0,
    },
    tags: {
      model: 'llama-3.3-70b-versatile',
      task: 'paper-stance-classification',
      paper_id: paper.paperId || paper.id,
      hallucination_risk: hallucinationRisk,
      latency_ms: latencyMs
    },
    prompt: `claim: ${claim.substring(0, 200)} | paper: ${paper.title?.substring(0, 100)}`,
    response: JSON.stringify({
      stance: analysisResult.stance,
      confidence: analysisResult.confidence,
      evidence: analysisResult.evidence?.substring(0, 200)
    })
  };

  if (otelEnabled && tracer) {
    const span = tracer.startSpan('paper-analysis');
    span.setAttributes({
      'llm.model_name': 'llama-3.3-70b-versatile',
      'llm.input_messages.0.content': traceData.prompt,
      'llm.output_messages.0.content': traceData.response,
      'llm.token_count.total': 0, // Groq doesn't always return this
      'retrieval.documents.0.document.score': paper.relevance || 0,
      'arize.hallucination_risk': hallucinationRisk,
      'aset.claim': claim.substring(0, 200),
      'aset.paper_id': paper.paperId || paper.id || '',
      'aset.stance': analysisResult.stance,
      'aset.confidence': analysisResult.confidence,
      'aset.latency_ms': latencyMs
    });
    span.end();
  } else {
    await logToArize(traceData);
  }

  return hallucinationRisk;
}

// ─── Verification Summary Tracing ────────────────────────────────────────────
/**
 * Trace the final summary generation
 * Tracks verdict quality and confidence calibration
 */
async function traceVerificationSummary(claim, analyses, summaryResult, latencyMs) {
  const supporting = analyses.filter(a => a.stance === 'supports').length;
  const contradicting = analyses.filter(a => a.stance === 'contradicts').length;

  // Confidence calibration check:
  // High confidence with split evidence is a calibration issue
  const isCalibrationIssue = summaryResult.confidence === 'High'
    && Math.abs(supporting - contradicting) <= 1
    && analyses.length >= 4;

  const traceData = {
    prediction_id: `summary-${Date.now()}`,
    prediction_label: summaryResult.verdict,
    prediction_score: (summaryResult.verificationScore || 0) / 100,
    features: {
      papers_analyzed: analyses.length,
      papers_supporting: supporting,
      papers_contradicting: contradicting,
      claim_length: claim.length,
    },
    tags: {
      model: 'llama-3.3-70b-versatile',
      task: 'verification-summary',
      confidence_level: summaryResult.confidence,
      calibration_issue: isCalibrationIssue,
      latency_ms: latencyMs
    },
    prompt: `Summarize verification of: ${claim.substring(0, 200)}`,
    response: summaryResult.summary?.substring(0, 500)
  };

  if (otelEnabled && tracer) {
    const span = tracer.startSpan('verification-summary');
    span.setAttributes({
      'llm.model_name': 'llama-3.3-70b-versatile',
      'aset.verdict': summaryResult.verdict,
      'aset.score': summaryResult.verificationScore,
      'aset.confidence': summaryResult.confidence,
      'aset.papers_supporting': supporting,
      'aset.papers_contradicting': contradicting,
      'aset.calibration_issue': isCalibrationIssue,
      'aset.latency_ms': latencyMs
    });
    span.end();
  } else {
    await logToArize(traceData);
  }

  return { isCalibrationIssue };
}

// ─── Full Verification Trace Wrapper ────────────────────────────────────────
/**
 * Wraps an entire verifyClaim() call with a parent span
 * Used by VerificationAgent to wrap the full pipeline
 */
async function traceVerification(claim, papers, verifyFn) {
  const startTime = Date.now();
  let result;

  if (otelEnabled && tracer) {
    const span = tracer.startSpan('aset-verification-pipeline');
    span.setAttributes({
      'aset.claim': claim.substring(0, 200),
      'aset.papers_input': papers.length,
      'llm.provider': 'groq',
      'llm.model_name': 'llama-3.3-70b-versatile'
    });

    try {
      result = await verifyFn();
      span.setAttributes({
        'aset.verdict': result.verdict,
        'aset.score': result.verificationScore,
        'aset.papers_analyzed': result.papersAnalyzed,
        'aset.latency_ms': Date.now() - startTime
      });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message }); // ERROR
      throw err;
    } finally {
      span.end();
    }
  } else {
    result = await verifyFn();
  }

  // Log summary metrics
  await traceVerificationSummary(claim, result.analyses || [], result, Date.now() - startTime);

  // Attach quality metrics to result
  result.arizeMetrics = {
    tracingEnabled: otelEnabled,
    latencyMs: Date.now() - startTime,
    papersTraced: (result.analyses || []).length
  };

  return result;
}

// ─── Claim Extraction Tracing ────────────────────────────────────────────────
async function traceClaimExtraction(sourceText, claims, latencyMs, sourceType = 'document') {
  const traceData = {
    prediction_id: `extract-${Date.now()}`,
    prediction_label: 'extracted',
    prediction_score: Math.min(1, claims.length / 25), // density score
    features: {
      source_type: sourceType,
      text_length: sourceText.length,
      claims_extracted: claims.length,
    },
    tags: {
      model: 'llama-3.3-70b-versatile',
      task: 'claim-extraction',
      latency_ms: latencyMs
    },
    prompt: `Extract claims from ${sourceType}: ${sourceText.substring(0, 200)}`,
    response: JSON.stringify(claims.slice(0, 5))
  };

  if (otelEnabled && tracer) {
    const span = tracer.startSpan('claim-extraction');
    span.setAttributes({
      'aset.source_type': sourceType,
      'aset.claims_extracted': claims.length,
      'aset.text_length': sourceText.length,
      'aset.latency_ms': latencyMs
    });
    span.end();
  } else {
    await logToArize(traceData);
  }
}

// ─── Hallucination Risk Detection ────────────────────────────────────────────
function detectHallucinationRisk(analysis) {
  // High confidence + empty evidence = likely hallucination
  if (analysis.confidence > 70 && (!analysis.evidence || analysis.evidence.trim().length < 20)) {
    return 'high';
  }
  // Contradiction with low confidence = uncertain
  if (analysis.stance === 'contradicts' && analysis.confidence < 40) {
    return 'medium';
  }
  // Normal case
  if (analysis.confidence > 50 && analysis.evidence && analysis.evidence.length > 30) {
    return 'low';
  }
  return 'medium';
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
async function getArizeStatus() {
  return {
    enabled: !!(ARIZE_CONFIG.apiKey || ARIZE_CONFIG.otlpEndpoint),
    otlpEnabled: otelEnabled,
    phoenixUrl: ARIZE_CONFIG.phoenixUrl,
    modelId: ARIZE_CONFIG.modelId,
    hasApiKey: !!ARIZE_CONFIG.apiKey,
    hasSpaceId: !!ARIZE_CONFIG.spaceId
  };
}

module.exports = {
  tracePaperAnalysis,
  traceVerificationSummary,
  traceVerification,
  traceClaimExtraction,
  detectHallucinationRisk,
  getArizeStatus,
  get isEnabled() { return otelEnabled || !!ARIZE_CONFIG.apiKey; }
};

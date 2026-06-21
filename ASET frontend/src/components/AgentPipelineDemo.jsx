/**
 * AgentPipelineDemo — Hackathon demo UI
 * Shows the 4-agent pipeline running live with real-time step-by-step progress.
 * Triggered from WelcomeScreen's "🤖 Agent Pipeline" mode tab.
 */

import React, { useState, useRef, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// ── Agent definitions ────────────────────────────────────────────────────────
const AGENTS = [
  {
    id: 'research',
    name: 'Research Agent',
    icon: '🔍',
    role: 'Searches 1.2M+ papers across arXiv, PubMed & NASA ADS',
    color: '#60a5fa',
    channel: 'research.request → research.results'
  },
  {
    id: 'verification',
    name: 'Verification Agent',
    icon: '🧠',
    role: 'LLM stance classification per paper via Groq LLaMA 3.3 70B',
    color: '#a78bfa',
    channel: 'research.results → verification.done'
  },
  {
    id: 'citation',
    name: 'Citation Agent',
    icon: '📚',
    role: 'Deduplicates sources · formats APA / MLA / IEEE citations',
    color: '#34d399',
    channel: 'verification.done → citations.ready'
  },
  {
    id: 'report',
    name: 'Report Agent',
    icon: '📄',
    role: 'Assembles final structured report with all agent outputs',
    color: '#fbbf24',
    channel: 'citations.ready → report.complete'
  }
];

// ── Step indicator ───────────────────────────────────────────────────────────
const AgentStep = ({ agent, status }) => {
  const statusColor = status === 'done' ? agent.color
    : status === 'active' ? agent.color
    : 'rgba(255,255,255,0.2)';

  const bgColor = status === 'done' ? `${agent.color}18`
    : status === 'active' ? `${agent.color}12`
    : 'rgba(255,255,255,0.03)';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      padding: '14px 18px',
      borderRadius: 12,
      border: `1px solid ${status === 'idle' ? 'rgba(255,255,255,0.07)' : statusColor + '55'}`,
      background: bgColor,
      transition: 'all 0.4s ease',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Active pulse */}
      {status === 'active' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `${agent.color}08`,
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
      )}

      {/* Icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: status === 'idle' ? 'rgba(255,255,255,0.05)' : `${agent.color}22`,
        border: `1px solid ${status === 'idle' ? 'rgba(255,255,255,0.1)' : statusColor + '55'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0, position: 'relative', zIndex: 1,
        transition: 'all 0.3s'
      }}>
        {status === 'active' ? (
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚙️</span>
        ) : status === 'done' ? '✅' : agent.icon}
      </div>

      {/* Info */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        <div style={{
          color: status === 'idle' ? 'rgba(255,255,255,0.5)' : '#fff',
          fontWeight: 600, fontSize: 14, marginBottom: 3, transition: 'color 0.3s'
        }}>
          {agent.name}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 1.4 }}>
          {agent.role}
        </div>
        <div style={{
          color: status === 'idle' ? 'rgba(255,255,255,0.2)' : `${agent.color}99`,
          fontSize: 11, marginTop: 4, fontFamily: 'monospace'
        }}>
          {agent.channel}
        </div>
      </div>

      {/* Status badge */}
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
        color: status === 'idle' ? 'rgba(255,255,255,0.2)'
          : status === 'active' ? agent.color : '#34d399',
        background: status === 'idle' ? 'transparent'
          : status === 'active' ? `${agent.color}18` : 'rgba(52,211,153,0.12)',
        border: `1px solid ${status === 'idle' ? 'transparent'
          : status === 'active' ? `${agent.color}44` : 'rgba(52,211,153,0.3)'}`,
        borderRadius: 6, padding: '3px 8px',
        flexShrink: 0, alignSelf: 'center',
        transition: 'all 0.3s'
      }}>
        {status === 'idle' ? 'WAITING' : status === 'active' ? 'RUNNING' : 'DONE'}
      </div>
    </div>
  );
};

// ── Citation tabs ────────────────────────────────────────────────────────────
const CitationBlock = ({ citations }) => {
  const [tab, setTab] = useState('apa');
  const list = citations?.[tab] || [];

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['apa', 'mla', 'ieee'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'rgba(0,255,170,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${tab === t ? 'rgba(0,255,170,0.4)' : 'rgba(255,255,255,0.1)'}`,
            color: tab === t ? '#00ffaa' : 'rgba(255,255,255,0.5)',
            borderRadius: 6, padding: '4px 12px', fontSize: 12,
            fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase'
          }}>{t}</button>
        ))}
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, alignSelf: 'center', marginLeft: 4 }}>
          {list.length} citation{list.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.slice(0, 5).map((c, i) => (
          <div key={i} style={{
            background: 'rgba(0,255,170,0.04)', border: '1px solid rgba(0,255,170,0.12)',
            borderRadius: 8, padding: '8px 12px',
            color: 'rgba(255,255,255,0.65)', fontSize: 11, lineHeight: 1.5,
            fontFamily: 'monospace'
          }}>
            {c}
          </div>
        ))}
        {list.length > 5 && (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center' }}>
            + {list.length - 5} more
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────
const AgentPipelineDemo = () => {
  const [claim, setClaim]     = useState('');
  const [status, setStatus]   = useState('idle'); // idle | running | done | error
  const [activeAgent, setActiveAgent] = useState(null); // 0-3
  const [report, setReport]   = useState(null);
  const [error, setError]     = useState(null);
  const [log, setLog]         = useState([]);
  const logRef = useRef(null);

  // Demo claims for quick-fill
  const demoClaims = [
    'CRISPR-Cas9 can permanently edit the human germline genome',
    'Large language models exhibit emergent reasoning capabilities',
    'Quantum entanglement enables faster-than-light communication',
    'mRNA vaccines can integrate into human DNA',
  ];

  const addLog = (msg, color = 'rgba(255,255,255,0.5)') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLog(prev => [...prev, { ts, msg, color }]);
  };

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  const runPipeline = async () => {
    if (!claim.trim()) return;

    setStatus('running');
    setReport(null);
    setError(null);
    setLog([]);
    setActiveAgent(null);

    addLog('🚀 Pipeline started', '#60a5fa');
    addLog(`📋 Claim: "${claim.substring(0, 70)}${claim.length > 70 ? '...' : ''}"`, 'rgba(255,255,255,0.7)');
    addLog('📡 Publishing to Band Protocol bus → research.request', '#94a3b8');

    // Simulate agent activation timing while real request runs
    const agentTimings = [0, 1200, 2800, 4200];
    agentTimings.forEach((delay, i) => {
      setTimeout(() => {
        setActiveAgent(i);
        addLog(`⚡ ${AGENTS[i].name} activated`, AGENTS[i].color);
        if (i === 1) addLog('🧠 Groq LLaMA 3.3 70B analyzing papers...', '#a78bfa');
        if (i === 2) addLog('📚 Formatting APA / MLA / IEEE citations...', '#34d399');
        if (i === 3) addLog('📄 Assembling final report...', '#fbbf24');
      }, delay);
    });

    try {
      const res = await fetch(`${API_BASE_URL}/api/agents/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: claim.trim() })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Pipeline failed' }));
        throw new Error(err.error || 'Pipeline request failed');
      }

      const data = await res.json();
      setReport(data);
      setActiveAgent(null);
      setStatus('done');
      addLog(`✅ Pipeline complete in ${data.totalPipelineMs || '?'}ms`, '#34d399');
      addLog(`📊 Verdict: ${data.verdict} (${data.verificationScore}%)`, '#00ffaa');
      if (data.citations?.count) {
        addLog(`📚 ${data.citations.count} citations generated`, '#fbbf24');
      }
    } catch (err) {
      setStatus('error');
      setActiveAgent(null);
      setError(err.message);
      addLog(`❌ Error: ${err.message}`, '#f87171');
    }
  };

  const getAgentStatus = (index) => {
    if (status === 'idle') return 'idle';
    if (status === 'done') return 'done';
    if (status === 'error') return index <= (activeAgent ?? -1) ? 'done' : 'idle';
    if (activeAgent === null) return 'idle';
    if (index < activeAgent) return 'done';
    if (index === activeAgent) return 'active';
    return 'idle';
  };

  const scoreColor = report
    ? report.verificationScore >= 70 ? '#00ffaa'
      : report.verificationScore >= 40 ? '#fbbf24' : '#f87171'
    : '#00ffaa';

  return (
    <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', padding: '0 16px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 10, padding: '6px 16px', marginBottom: 12
        }}>
          <span style={{ fontSize: 13, color: '#818cf8', fontWeight: 600 }}>🤖 Fetch.ai Agentverse</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>·</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Band Protocol bus</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>·</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Redis memory</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>·</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Arize traces</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>
          4 specialized agents collaborate to research, verify, cite, and report
        </p>
      </div>

      {/* Input */}
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14, padding: '16px 18px', marginBottom: 16
      }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <input
            type="text"
            value={claim}
            onChange={e => setClaim(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && status !== 'running' && runPipeline()}
            placeholder="Enter a scientific claim to run through all 4 agents..."
            disabled={status === 'running'}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
              padding: '10px 14px', color: '#fff', fontSize: 14, outline: 'none',
              opacity: status === 'running' ? 0.6 : 1
            }}
          />
          <button
            onClick={runPipeline}
            disabled={status === 'running' || !claim.trim()}
            style={{
              background: status === 'running' ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.5)', color: '#818cf8',
              borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600,
              cursor: status === 'running' || !claim.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            {status === 'running' ? (
              <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span> Running...</>
            ) : '🚀 Run Pipeline'}
          </button>
        </div>

        {/* Demo claim chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {demoClaims.map((c, i) => (
            <button key={i} onClick={() => setClaim(c)} disabled={status === 'running'}
              style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.45)', borderRadius: 6, padding: '3px 10px',
                fontSize: 11, cursor: 'pointer', transition: 'all 0.2s'
              }}>
              {c.substring(0, 40)}...
            </button>
          ))}
        </div>
      </div>

      {/* Agent steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {AGENTS.map((agent, i) => (
          <React.Fragment key={agent.id}>
            <AgentStep agent={agent} status={getAgentStatus(i)} />
            {i < AGENTS.length - 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, color: 'rgba(255,255,255,0.15)', fontSize: 11
              }}>
                <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ fontFamily: 'monospace', fontSize: 10 }}>Band Protocol</span>
                <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Log console */}
      {log.length > 0 && (
        <div style={{
          background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 16,
          maxHeight: 140, overflowY: 'auto', fontFamily: 'monospace'
        }} ref={logRef}>
          {log.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 11, lineHeight: 1.6 }}>
              <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{entry.ts}</span>
              <span style={{ color: entry.color }}>{entry.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          color: '#f87171', background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10,
          padding: '12px 16px', fontSize: 13, marginBottom: 16
        }}>
          ❌ {error}
        </div>
      )}

      {/* Result */}
      {report && status === 'done' && (
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, padding: '20px 22px'
        }}>
          {/* Score row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              border: `3px solid ${scoreColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, background: `${scoreColor}10`
            }}>
              <span style={{ color: scoreColor, fontSize: 18, fontWeight: 800 }}>
                {report.verificationScore}%
              </span>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{report.verdict}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
                {report.confidence} confidence · {report.papersAnalyzed} papers analyzed
                {report.totalPipelineMs ? ` · ${report.totalPipelineMs}ms total` : ''}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>
                Report ID: {report.reportId}
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 6, height: 6, marginBottom: 14 }}>
            <div style={{
              width: `${report.verificationScore}%`, height: '100%',
              background: scoreColor, borderRadius: 6, transition: 'width 0.8s ease'
            }} />
          </div>

          {/* Summary */}
          {report.summary && (
            <p style={{
              color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 1.6,
              marginBottom: 14, padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 8
            }}>
              {report.summary}
            </p>
          )}

          {/* Key findings */}
          {report.keyFindings?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Key Findings
              </div>
              {report.keyFindings.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, color: 'rgba(255,255,255,0.6)',
                  fontSize: 12, lineHeight: 1.5, marginBottom: 5
                }}>
                  <span style={{ color: scoreColor, flexShrink: 0 }}>›</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}

          {/* Agent pipeline summary */}
          {report.pipeline && (
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14
            }}>
              {[
                { label: 'Papers found', value: report.pipeline.research?.papersFound },
                { label: 'Papers analyzed', value: report.papersAnalyzed },
                { label: 'Citations', value: report.citations?.count },
                { label: 'Pipeline time', value: report.totalPipelineMs ? `${report.totalPipelineMs}ms` : null }
              ].filter(s => s.value != null).map((stat, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: '6px 12px', fontSize: 12
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.35)' }}>{stat.label}: </span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{stat.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Citations */}
          {report.citations?.count > 0 && (
            <div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Citations — Agent-Generated
              </div>
              <CitationBlock citations={report.citations} />
            </div>
          )}

          {/* Arize metrics */}
          {report.qualityMetrics && (
            <div style={{
              marginTop: 14, padding: '8px 12px',
              background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: 8, display: 'flex', gap: 16, flexWrap: 'wrap'
            }}>
              <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 600 }}>🔭 Arize Trace</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                Latency: {report.qualityMetrics.latencyMs}ms
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                Papers traced: {report.qualityMetrics.papersTraced}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                OTel: {report.qualityMetrics.tracingEnabled ? '✅ enabled' : '⚠️ HTTP mode'}
              </span>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.7; } }
      `}</style>
    </div>
  );
};

export default AgentPipelineDemo;

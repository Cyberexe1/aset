import React, { useState } from 'react';
import { api as apiService } from '../services/api';
import { chatService } from '../services/chatService';
import { generateVerificationReport } from '../services/reportGenerator';

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp,.bmp,.tiff';

const VerdictBadge = ({ verdict, score }) => {
  // Normalize verdict — use score as fallback if verdict is wrong
  let normalizedVerdict = verdict;
  if (score > 0 && verdict === 'unverifiable') {
    normalizedVerdict = score >= 70 ? 'supported' : score >= 40 ? 'inconclusive' : 'contradicted';
  }

  const config = {
    supported:             { color: '#00ffaa', label: 'Supported' },
    'strongly supported':  { color: '#00ffaa', label: 'Strongly Supported' },
    inconclusive:          { color: '#f59e0b', label: 'Inconclusive' },
    contradicted:          { color: '#ef4444', label: 'Contradicted' },
    'strongly contradicted':{ color: '#ef4444', label: 'Strongly Contradicted' },
    unverifiable:          { color: '#f59e0b', label: 'Unverifiable' },
    error:                 { color: '#6b7280', label: 'Error' },
  };
  const c = config[normalizedVerdict?.toLowerCase()] || config.unverifiable;
  return (
    <span style={{
      background: `${c.color}22`,
      border: `1px solid ${c.color}66`,
      color: c.color,
      borderRadius: '6px',
      padding: '2px 10px',
      fontSize: '12px',
      fontWeight: 700,
      letterSpacing: '0.5px'
    }}>
      {c.label} {score > 0 ? `${score}%` : ''}
    </span>
  );
};

const TrustMeter = ({ score }) => {
  const color = score >= 70 ? '#00ffaa' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ margin: '20px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Overall Trust Score</span>
        <span style={{ color, fontWeight: 700, fontSize: 18 }}>{score}%</span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, background: color, height: '100%', borderRadius: 8, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
};

// ── Mode 3: Document Upload ──────────────────────────────────────────────────
export const DocumentVerifier = ({ onClose }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiService.processDocument(formData);
      setResult(res);
      // Save to history
      chatService.saveVerificationResult('document', `📄 ${file.name}`, res);
    } catch (err) {
      setError(err.message || 'Processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      {/* Drop zone */}
      {!result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? '#00ffaa' : 'rgba(255,255,255,0.2)'}`,
            borderRadius: 16,
            padding: '40px 24px',
            textAlign: 'center',
            background: dragOver ? 'rgba(0,255,170,0.05)' : 'rgba(255,255,255,0.03)',
            transition: 'all 0.2s',
            cursor: 'pointer'
          }}
          onClick={() => document.getElementById('doc-file-input').click()}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, marginBottom: 8 }}>
            {file ? file.name : 'Drop your file here or click to browse'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
            PDF, DOCX, DOC, TXT, PNG, JPG, WEBP — max 20MB
          </div>
          <input
            id="doc-file-input"
            type="file"
            accept={ACCEPTED_TYPES}
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {file && !result && (
        <div style={{ display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center' }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              background: loading ? 'rgba(0,255,170,0.3)' : 'rgba(0,255,170,0.15)',
              border: '1px solid rgba(0,255,170,0.5)',
              color: '#00ffaa',
              borderRadius: 10,
              padding: '10px 28px',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳ Analyzing...' : '🔍 Verify Claims'}
          </button>
          <button
            onClick={() => { setFile(null); setError(null); }}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.5)',
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginTop: 16, fontSize: 14 }}>
          ❌ {error}
        </div>
      )}

      {result && <VerificationReport result={result} onReset={() => { setFile(null); setResult(null); }} />}
    </div>
  );
};

// ── Mode 2: YouTube URL ──────────────────────────────────────────────────────
export const YouTubeVerifier = ({ onClose }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await apiService.processYouTube(url.trim());
      setResult(res);
      chatService.saveVerificationResult('youtube', `▶️ ${url.trim()}`, res);
    } catch (err) {
      setError(err.message || 'Processing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      {!result && (
        <form onSubmit={handleSubmit}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <svg width="64" height="45" viewBox="0 0 64 45" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="64" height="45" rx="10" fill="#FF0000"/>
                <polygon points="25,12 25,33 45,22.5" fill="white"/>
              </svg>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
              Paste any YouTube URL — ASET extracts the transcript, identifies all factual claims, and verifies each one against peer-reviewed research.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 16px', color: '#fff', fontSize: 14, outline: 'none' }}
              />
              <button type="submit" disabled={loading || !url.trim()}
                style={{ background: 'rgba(0,255,170,0.15)', border: '1px solid rgba(0,255,170,0.5)', color: '#00ffaa', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                {loading ? '⏳ Analyzing...' : '🔍 Verify'}
              </button>
            </div>
          </div>
        </form>
      )}
      {error && (
        <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginTop: 16, fontSize: 14 }}>
          ❌ {error}
        </div>
      )}
      {result && <VerificationReport result={result} onReset={() => { setUrl(''); setResult(null); }} />}
    </div>
  );

  return (
    <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>
      {!result && (
        <form onSubmit={handleSubmit}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '24px' }}>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>▶️</div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
              {[['url','🔗 YouTube URL'],['text','📋 Paste Transcript']].map(([m, label]) => (
                <button key={m} type="button" onClick={() => setInputMode(m)} style={{
                  background: inputMode === m ? 'rgba(0,255,170,0.12)' : 'transparent',
                  border: `1px solid ${inputMode === m ? 'rgba(0,255,170,0.5)' : 'rgba(255,255,255,0.15)'}`,
                  color: inputMode === m ? '#00ffaa' : 'rgba(255,255,255,0.5)',
                  borderRadius: 8, padding: '6px 16px', fontSize: 13, cursor: 'pointer'
                }}>{label}</button>
              ))}
            </div>

            {inputMode === 'url' ? (
              <>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                  Note: Only works for videos with auto-generated or manual captions enabled
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input type="url" value={url} onChange={e => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '10px 16px', color: '#fff', fontSize: 14, outline: 'none' }}
                  />
                  <button type="submit" disabled={loading || !url.trim()} style={{ background: 'rgba(0,255,170,0.15)', border: '1px solid rgba(0,255,170,0.5)', color: '#00ffaa', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    {loading ? '⏳ Analyzing...' : '🔍 Verify'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
                  Copy the transcript from YouTube (⋯ → Show transcript) and paste it below
                </div>
                <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
                  placeholder="Paste the video transcript here..."
                  rows={8}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <button type="submit" disabled={loading || !transcript.trim()} style={{ marginTop: 12, width: '100%', background: 'rgba(0,255,170,0.15)', border: '1px solid rgba(0,255,170,0.5)', color: '#00ffaa', borderRadius: 10, padding: '10px', fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}>
                  {loading ? '⏳ Analyzing...' : '🔍 Verify Claims'}
                </button>
              </>
            )}
          </div>
        </form>
      )}

      {error && (
        <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginTop: 16, fontSize: 14 }}>
          ❌ {error}
        </div>
      )}

      {result && <VerificationReport result={result} onReset={() => { setUrl(''); setTranscript(''); setResult(null); }} />}
    </div>
  );
};

// ── Shared Verification Report ───────────────────────────────────────────────
const VerificationReport = ({ result, onReset }) => {
  const [expanded, setExpanded]     = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [pdfUrl, setPdfUrl]         = useState(null);   // blob URL for viewer
  const [viewing, setViewing]       = useState(false);  // modal open

  // Generate PDF blob URL for the viewer (doesn't trigger download)
  const handleView = async () => {
    try {
      const { generateVerificationReportBlob } = await import('../services/reportGenerator');
      const blob = generateVerificationReportBlob(result);
      const url  = URL.createObjectURL(blob);
      setPdfUrl(url);
      setViewing(true);
    } catch (err) {
      console.error('PDF preview failed:', err);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      generateVerificationReport(result);
    } catch (err) {
      console.error('Report generation failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const closeViewer = () => {
    setViewing(false);
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(null); }
  };

  return (
    <>
      {/* ── PDF Viewer Modal ── */}
      {viewing && (
        <div
          onClick={closeViewer}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
        >
          {/* Modal box */}
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 900,
              height: '90vh',
              background: '#0a0e18',
              border: '1px solid rgba(0,212,170,0.25)',
              borderRadius: 16,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(0,212,170,0.06)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                  <path d="M14 2v6h6M8 13h8M8 17h5"/>
                </svg>
                <span style={{ color: '#00d4aa', fontWeight: 600, fontSize: 14 }}>
                  ASET Verification Report
                </span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                  {result.filename || result.videoId || 'Report'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Download from viewer */}
                <button
                  onClick={handleDownload}
                  style={{
                    background: 'rgba(0,212,170,0.12)',
                    border: '1px solid rgba(0,212,170,0.3)',
                    color: '#00d4aa', borderRadius: 8,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download
                </button>
                {/* Close */}
                <button
                  onClick={closeViewer}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.6)', borderRadius: 8,
                    padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                  Close
                </button>
              </div>
            </div>

            {/* PDF iframe */}
            <iframe
              src={pdfUrl}
              style={{ flex: 1, border: 'none', width: '100%', background: '#1a1a2e' }}
              title="ASET Verification Report"
            />
          </div>
        </div>
      )}

      {/* ── Main report card ── */}
      <div style={{ marginTop: 8, position: 'relative', zIndex: 2, background: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: '4px' }}>
        {/* Header */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>
                {result.filename || result.videoId || 'Verification Report'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
                {result.totalClaims} claims identified · {result.processingTimeMs}ms
                {result.pages ? ` · ${result.pages} pages` : ''}
                {result.extractionMethod ? ` · ${result.extractionMethod}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>

              {/* View Report Button */}
              <button
                onClick={handleView}
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.4)',
                  color: '#818cf8',
                  borderRadius: 8, padding: '6px 14px',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                  <path d="M14 2v6h6M8 13h8M8 17h5"/>
                </svg>
                View Report
              </button>

              {/* Download Report Button */}
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  background: downloading ? 'rgba(0,212,170,0.1)' : 'rgba(0,212,170,0.15)',
                  border: '1px solid rgba(0,212,170,0.4)',
                  color: '#00d4aa', borderRadius: 8,
                  padding: '6px 14px', fontSize: 12, fontWeight: 600,
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.2s', whiteSpace: 'nowrap',
                }}
              >
                {downloading ? <>⏳ Generating...</> : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download PDF
                  </>
                )}
              </button>

              <button onClick={onReset} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
                New
              </button>
            </div>
          </div>
          <TrustMeter score={result.overallTrustScore} />
        </div>

        {/* Claims list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {result.verifiedClaims.map((item, i) => (
            <div
              key={i}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: '14px 18px',
                cursor: 'pointer', transition: 'border-color 0.2s'
              }}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.5, flex: 1 }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginRight: 8 }}>#{i + 1}</span>
                  {item.claim}
                </div>
                <VerdictBadge verdict={item.verdict} score={item.score} />
              </div>

              {expanded === i && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {item.reason && (
                    <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                      {item.reason}
                    </div>
                  )}
                  {item.sources?.length > 0 && (
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Supporting Papers</div>
                      {item.sources.map((s, j) => (
                        <div key={j} style={{ background: 'rgba(0,255,170,0.05)', border: '1px solid rgba(0,255,170,0.15)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 12 }}>
                          <div style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)' }}>{s.topic} · {s.year || 'n/a'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

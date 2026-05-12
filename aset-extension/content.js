// ASET Content Script — injects verification panel into any webpage

let panel = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SHOW_PANEL') {
    showPanel(msg);
  }
});

function makeDraggable(el) {
  const header = el.querySelector('.aset-header');
  let isDragging = false, startX, startY, startLeft, startBottom;

  header.style.cursor = 'grab';

  header.addEventListener('mousedown', (e) => {
    if (e.target.id === 'aset-close') return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startBottom = window.innerHeight - rect.bottom;
    el.style.transition = 'none';
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newLeft = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, startLeft + dx));
    const newBottom = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, startBottom - dy));
    el.style.left = newLeft + 'px';
    el.style.right = 'auto';
    el.style.bottom = newBottom + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab';
    }
  });
}

function showPanel({ claim, status, result, papers, message }) {
  // Remove existing panel
  if (panel) panel.remove();

  panel = document.createElement('div');
  panel.id = 'aset-panel';
  panel.innerHTML = buildPanelHTML({ claim, status, result, papers, message });
  document.body.appendChild(panel);
  makeDraggable(panel);

  // Close button
  panel.querySelector('#aset-close')?.addEventListener('click', () => {
    panel.remove();
    panel = null;
  });

  // Open full app button
  panel.querySelector('#aset-open-app')?.addEventListener('click', () => {
    window.open('https://www.aset-ai.tech', '_blank');
  });
}

function buildPanelHTML({ claim, status, result, papers, message }) {
  const truncatedClaim = claim.length > 100 ? claim.substring(0, 100) + '...' : claim;

  let content = '';

  if (status === 'loading') {
    content = `
      <div class="aset-loading">
        <div class="aset-spinner"></div>
        <p>Verifying claim against 1.2M+ papers...</p>
      </div>
    `;
  } else if (status === 'error') {
    content = `<div class="aset-error">❌ ${message || 'Verification failed'}</div>`;
  } else if (status === 'no-papers') {
    content = `<div class="aset-warning">⚠️ ${message}</div>`;
  } else if (status === 'done' && result) {
    const score = result.verificationScore || 0;
    const verdict = result.verdict || 'Inconclusive';
    const color = score >= 70 ? '#00ffaa' : score >= 40 ? '#f59e0b' : '#ef4444';

    const papersList = (papers || []).map(p => `
      <div class="aset-paper">
        <div class="aset-paper-title">${p.title?.substring(0, 80)}${p.title?.length > 80 ? '...' : ''}</div>
        <div class="aset-paper-meta">${p.topic || ''} · ${p.year || 'n/a'}</div>
      </div>
    `).join('');

    content = `
      <div class="aset-score-row">
        <div class="aset-score" style="color:${color}">${score}%</div>
        <div class="aset-verdict" style="border-color:${color};color:${color}">${verdict}</div>
      </div>
      <div class="aset-bar-bg">
        <div class="aset-bar-fill" style="width:${score}%;background:${color}"></div>
      </div>
      ${result.summary ? `<p class="aset-summary">${result.summary.substring(0, 200)}${result.summary.length > 200 ? '...' : ''}</p>` : ''}
      ${papersList ? `<div class="aset-papers-label">Supporting Papers</div>${papersList}` : ''}
    `;
  }

  return `
    <div class="aset-header">
      <div class="aset-logo">
        <svg width="20" height="20" fill="none" viewBox="0 0 28 30">
          <ellipse cx="16.662" cy="2.428" rx="1.818" ry="1.818" fill="white"/>
          <ellipse cx="22.114" cy="2.426" rx="2.121" ry="2.122" fill="white"/>
          <ellipse cx="27.577" cy="2.425" rx="2.424" ry="2.425" fill="white"/>
          <ellipse cx="11.207" cy="7.875" rx="1.515" ry="1.515" fill="white"/>
          <ellipse cx="16.662" cy="7.883" rx="1.818" ry="1.818" fill="white"/>
          <ellipse cx="22.114" cy="7.883" rx="2.121" ry="2.122" fill="white"/>
          <ellipse cx="27.578" cy="7.883" rx="2.121" ry="2.122" fill="white"/>
        </svg>
        <span>ASET</span>
      </div>
      <button id="aset-close">✕</button>
    </div>
    <div class="aset-claim">"${truncatedClaim}"</div>
    <div class="aset-content">${content}</div>
    <button id="aset-open-app" class="aset-cta">Open in ASET →</button>
  `;
}

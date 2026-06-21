const API_URL = 'https://api.aset-ai.tech';

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'verify-with-aset',
    title: 'Verify with ASET',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'verify-with-aset-enhanced',
    title: 'Verify with ASET (+ web evidence)',
    contexts: ['selection']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const enhanced = info.menuItemId === 'verify-with-aset-enhanced';
  if (info.menuItemId !== 'verify-with-aset' && !enhanced) return;

  const claim = info.selectionText?.trim();
  if (!claim || claim.length < 10) return;

  // Can't inject into chrome:// pages
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }

  // Ensure content script is injected
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
  } catch (e) {
    // Already injected or can't inject — continue anyway
  }

  // Send claim to content script to show loading panel
  try {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_PANEL',
      claim: claim,
      status: 'loading'
    });
  } catch (e) { return; }

  try {
    // Step 1: Get sources from ASET database
    const searchRes = await fetch(`${API_URL}/api/get-sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim, limit: 5 })
    });
    const searchData = await searchRes.json();
    let papers = searchData.sources || [];

    // Step 2: If enhanced mode, also extract evidence from the current page via Browserbase
    let webEvidence = null;
    if (enhanced && tab.url && !tab.url.startsWith('chrome://')) {
      try {
        const bbRes = await fetch(`${API_URL}/api/browserbase/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: tab.url, claim })
        });
        const bbData = await bbRes.json();
        if (bbData.evidence) {
          webEvidence = bbData;
        }
      } catch (err) {
        console.warn('[ASET Extension] Browserbase extraction failed:', err.message);
      }
    }

    if (!papers.length) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_PANEL',
        claim,
        status: 'no-papers',
        message: 'No relevant papers found in local database. Try the full app for external search.'
      }).catch(() => {});
      return;
    }

    // Step 3: Verify claim against papers
    const verifyRes = await fetch(`${API_URL}/api/verify-claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim, papers, maxPapers: 5 })
    });
    const result = await verifyRes.json();

    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_PANEL',
      claim,
      status: 'done',
      result,
      papers: papers.slice(0, 3),
      webEvidence,
      enhanced
    }).catch(() => {});

  } catch (err) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_PANEL',
      claim,
      status: 'error',
      message: 'Could not connect to ASET API. Check your connection.'
    }).catch(() => {});
  }
});

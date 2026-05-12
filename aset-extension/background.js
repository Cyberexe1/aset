const API_URL = 'https://api.aset-ai.tech';

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'verify-with-aset',
    title: 'Verify with ASET',
    contexts: ['selection']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'verify-with-aset') {
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
      const searchRes = await fetch(`${API_URL}/api/get-sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim, limit: 5 })
      });
      const searchData = await searchRes.json();
      const papers = searchData.sources || [];

      if (!papers.length) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_PANEL',
          claim,
          status: 'no-papers',
          message: 'No relevant papers found in local database. Try the full app for external search.'
        }).catch(() => {});
        return;
      }

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
        papers: papers.slice(0, 3)
      }).catch(() => {});

    } catch (err) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_PANEL',
        claim,
        status: 'error',
        message: 'Could not connect to ASET API. Check your connection.'
      }).catch(() => {});
    }
  }
});
